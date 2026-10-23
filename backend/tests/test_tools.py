from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx

from app.routers.stats import streak_from_days
from app.services.generate import FALLBACK_MERMAID, clean_mermaid, parse_quiz
from tests.conftest import Fakes, auth
from tests.pdfutil import JPEG_MIN, PNG_MIN

WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 32


async def test_ocr_handwriting_and_math(client: httpx.AsyncClient, fakes: Fakes) -> None:
    r = await client.post(
        "/v1/ocr",
        files={"image": ("a.png", PNG_MIN, "image/png")},
        data={"mode": "handwriting"},
        headers=auth(),
    )
    assert r.status_code == 200 and r.json() == {"text": fakes.ocr.text}
    r = await client.post(
        "/v1/ocr",
        files={"image": ("a.jpg", JPEG_MIN, "image/jpeg")},
        data={"mode": "math"},
        headers=auth(),
    )
    assert r.status_code == 200
    assert [m for m, _ in fakes.ocr.calls] == ["handwriting", "math"]


async def test_ocr_validation_and_outage(client: httpx.AsyncClient, fakes: Fakes) -> None:
    bad_mode = await client.post(
        "/v1/ocr",
        files={"image": ("a.png", PNG_MIN, "image/png")},
        data={"mode": "cursive"},
        headers=auth(),
    )
    assert bad_mode.status_code == 422
    pdf = await client.post(
        "/v1/ocr", files={"image": ("a.pdf", b"%PDF-1.4 x", "application/pdf")}, headers=auth()
    )
    assert pdf.status_code == 422
    fake_png = await client.post(
        "/v1/ocr", files={"image": ("a.png", b"not a png", "image/png")}, headers=auth()
    )
    assert fake_png.status_code == 422
    fakes.ocr.fail = True
    down = await client.post(
        "/v1/ocr", files={"image": ("a.png", PNG_MIN, "image/png")}, headers=auth()
    )
    assert down.status_code == 503 and down.json()["error"]["code"] == "ocr_unavailable"


async def test_stt(client: httpx.AsyncClient, fakes: Fakes) -> None:
    r = await client.post("/v1/stt", files={"audio": ("a.wav", WAV, "audio/wav")}, headers=auth())
    assert r.status_code == 200 and r.json() == {"text": "hello world"}
    webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 16
    r = await client.post(
        "/v1/stt", files={"audio": ("a.webm", webm, "audio/webm;codecs=opus")}, headers=auth()
    )
    assert r.status_code == 200
    bad = await client.post(
        "/v1/stt", files={"audio": ("a.txt", b"hello", "text/plain")}, headers=auth()
    )
    assert bad.status_code == 422
    spoof = await client.post(
        "/v1/stt", files={"audio": ("a.wav", b"not audio at all", "audio/wav")}, headers=auth()
    )
    assert spoof.status_code == 422
    fakes.stt.fail = True
    down = await client.post(
        "/v1/stt", files={"audio": ("a.wav", WAV, "audio/wav")}, headers=auth()
    )
    assert down.status_code == 503


async def test_generate_quiz(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/v1/generate/quiz", json={"content": "Cells are the unit of life."}, headers=auth()
    )
    assert r.status_code == 200
    qs = r.json()["questions"]
    assert len(qs) == 5
    assert set(qs[0]) == {"question", "options", "answer_index", "explanation"}
    assert len(qs[0]["options"]) == 4 and 0 <= qs[0]["answer_index"] <= 3


async def test_generate_quiz_bad_model_output_is_502(
    client: httpx.AsyncClient, fakes: Fakes
) -> None:
    fakes.llm.complete_text = "sorry, I cannot do that"
    r = await client.post("/v1/generate/quiz", json={"content": "x"}, headers=auth())
    assert r.status_code == 502 and r.json()["error"]["code"] == "bad_model_output"
    fakes.llm.complete_text = None
    fakes.llm.fail = True
    r = await client.post("/v1/generate/quiz", json={"content": "x"}, headers=auth())
    assert r.status_code == 503


async def test_generate_flowchart_and_report(client: httpx.AsyncClient) -> None:
    r = await client.post("/v1/generate/flowchart", json={"content": "A then B"}, headers=auth())
    assert r.status_code == 200
    assert r.json()["mermaid"].startswith("graph TD") and "```" not in r.json()["mermaid"]
    r = await client.post("/v1/generate/report", json={"content": "Long text"}, headers=auth())
    assert r.status_code == 200 and "key point" in r.json()["summary"]
    assert (
        await client.post("/v1/generate/report", json={"content": ""}, headers=auth())
    ).status_code == 422
    assert (await client.post("/v1/generate/report", json={}, headers=auth())).status_code == 422


def test_quiz_parser_accepts_legacy_key_and_rejects_bad_shapes() -> None:
    legacy = json.dumps(
        [{"question": "q?", "options": list("abcd"), "correctAnswer": 2, "explanation": "e"}]
    )
    assert parse_quiz("Here you go: " + legacy)[0].answer_index == 2
    for bad in (
        "[]",
        "{}",
        json.dumps(
            [{"question": "q", "options": list("abc"), "answer_index": 0, "explanation": "e"}]
        ),
        json.dumps(
            [{"question": "q", "options": list("abcd"), "answer_index": 4, "explanation": "e"}]
        ),
        json.dumps(
            [{"question": "q", "options": list("abcd"), "answer_index": True, "explanation": "e"}]
        ),
    ):
        try:
            parse_quiz(bad)
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 502
        else:
            raise AssertionError(bad)


def test_clean_mermaid() -> None:
    assert clean_mermaid("```mermaid\ngraph LR\nA-->B\n```") == "graph LR\nA-->B"
    assert clean_mermaid("Sure! here is a diagram") == FALLBACK_MERMAID
    cleaned = clean_mermaid('graph TD\nA["x"]\nclick A "http://evil" \n%%{init: {}}%%\nA-->B')
    assert "click" not in cleaned and "%%{" not in cleaned


async def test_quiz_results_and_stats(client: httpx.AsyncClient) -> None:
    stats = (await client.get("/v1/stats", headers=auth())).json()
    assert stats == {"quiz_results": [], "chat_count": 0, "streak_days": 0}
    r = await client.post(
        "/v1/quiz-results", json={"score": 4, "total": 5, "subject": "Bio"}, headers=auth()
    )
    assert r.status_code == 201 and r.json()["score"] == 4
    await client.post("/v1/quiz-results", json={"score": 2, "total": 5}, headers=auth())
    from tests.conftest import chat

    await chat(client, "hello tutor")
    stats = (await client.get("/v1/stats", headers=auth())).json()
    assert [q["score"] for q in stats["quiz_results"]] == [2, 4]  # newest first
    assert stats["chat_count"] == 1
    assert stats["streak_days"] == 1
    # isolation
    other = (await client.get("/v1/stats", headers=auth("bob"))).json()
    assert other == {"quiz_results": [], "chat_count": 0, "streak_days": 0}


async def test_quiz_result_validation(client: httpx.AsyncClient) -> None:
    for bad in ({"score": 6, "total": 5}, {"score": -1, "total": 5}, {"score": 1, "total": 0}):
        assert (await client.post("/v1/quiz-results", json=bad, headers=auth())).status_code == 422


def test_streak_math() -> None:
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)
    assert streak_from_days(set(), now) == 0
    assert streak_from_days({"2026-10-23"}, now) == 1
    assert streak_from_days({"2026-10-23", "2026-10-22", "2026-10-21"}, now) == 3
    assert streak_from_days({"2026-10-22", "2026-10-21"}, now) == 2  # today not yet active
    assert streak_from_days({"2026-10-23", "2026-10-21"}, now) == 1  # gap breaks it
    assert streak_from_days({"2026-10-20"}, now) == 0
