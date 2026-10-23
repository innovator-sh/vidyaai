from __future__ import annotations

import uuid

import httpx

from app.services.container import Services
from app.vector.store import DOC_CHUNKS
from tests.conftest import Fakes, auth
from tests.pdfutil import JPEG_MIN, PDF_MIN, PNG_MIN, make_pdf


async def upload(
    client: httpx.AsyncClient,
    data: bytes,
    name: str = "notes.pdf",
    ctype: str = "application/pdf",
    user: str = "alice",
) -> httpx.Response:
    return await client.post(
        "/v1/documents", files={"file": (name, data, ctype)}, headers=auth(user)
    )


async def test_ingest_flow_pdf(client: httpx.AsyncClient, svc: Services) -> None:
    r = await upload(client, make_pdf("Mitochondria produce ATP. " * 200))
    assert r.status_code == 202
    body = r.json()
    assert set(body) == {"id", "name", "status"} and body["name"] == "notes.pdf"
    # background task has run by the time the (in-process) response returns
    doc = (await client.get(f"/v1/documents/{body['id']}", headers=auth())).json()
    assert doc["status"] == "ready" and set(doc) == {"id", "name", "status", "created_at"}

    me = (await client.get("/v1/me", headers=auth())).json()
    n = await svc.vectors.count_user(DOC_CHUNKS, me["id"])
    assert n >= 5  # ~5k chars -> several chunks

    listing = (await client.get("/v1/documents", headers=auth())).json()
    assert [d["id"] for d in listing["items"]] == [body["id"]]

    assert (await client.delete(f"/v1/documents/{body['id']}", headers=auth())).status_code == 204
    assert await svc.vectors.count_user(DOC_CHUNKS, me["id"]) == 0  # vectors deleted too
    assert (await client.get(f"/v1/documents/{body['id']}", headers=auth())).status_code == 404
    assert (await client.get("/v1/documents", headers=auth())).json()["items"] == []


async def test_image_goes_through_ocr(
    client: httpx.AsyncClient, fakes: Fakes, svc: Services
) -> None:
    r = await upload(client, PNG_MIN, "scan.png", "image/png")
    assert r.status_code == 202
    assert (await client.get(f"/v1/documents/{r.json()['id']}", headers=auth())).json()[
        "status"
    ] == "ready"
    assert fakes.ocr.calls == [("handwriting", len(PNG_MIN))]
    r = await upload(client, JPEG_MIN, "photo.jpg", "image/jpeg")
    assert r.status_code == 202


async def test_failed_status_when_ocr_down_or_no_text(
    client: httpx.AsyncClient, fakes: Fakes
) -> None:
    fakes.ocr.fail = True
    r = await upload(client, PNG_MIN, "scan.png", "image/png")
    assert (await client.get(f"/v1/documents/{r.json()['id']}", headers=auth())).json()[
        "status"
    ] == "failed"
    blank = await upload(client, make_pdf(""))
    assert (await client.get(f"/v1/documents/{blank.json()['id']}", headers=auth())).json()[
        "status"
    ] == "failed"


async def test_corrupt_pdf_marked_failed(client: httpx.AsyncClient) -> None:
    r = await upload(client, b"%PDF-1.4\nthis is not really a pdf")
    assert r.status_code == 202
    assert (await client.get(f"/v1/documents/{r.json()['id']}", headers=auth())).json()[
        "status"
    ] == "failed"


async def test_upload_validation(client: httpx.AsyncClient) -> None:
    # wrong MIME type
    r = await upload(client, b"MZ\x90\x00 exe", "evil.exe", "application/x-msdownload")
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_type"
    # declared PDF but bytes are not a PDF (magic-byte check)
    r = await upload(client, b"<html>not a pdf</html>", "x.pdf", "application/pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "content_mismatch"
    # declared PNG but JPEG bytes
    r = await upload(client, JPEG_MIN, "x.png", "image/png")
    assert r.status_code == 422
    # empty
    r = await upload(client, b"", "x.pdf", "application/pdf")
    assert r.status_code == 422
    # oversize (> 10MB)
    r = await upload(client, PDF_MIN + b"0" * (10 * 1024 * 1024), "big.pdf")
    assert r.status_code == 413


async def test_filename_sanitised(client: httpx.AsyncClient) -> None:
    r = await upload(client, PDF_MIN, "../../etc/pass<wd>.pdf")
    assert r.status_code == 202 and r.json()["name"] == "passwd.pdf"
    r = await upload(client, PDF_MIN, "C:\\Users\\bob\\notes.pdf")
    assert r.json()["name"] == "notes.pdf"


async def test_cross_user_isolation(client: httpx.AsyncClient, svc: Services) -> None:
    doc_id = (await upload(client, PDF_MIN, user="alice")).json()["id"]
    assert (await client.get(f"/v1/documents/{doc_id}", headers=auth("bob"))).status_code == 404
    assert (await client.delete(f"/v1/documents/{doc_id}", headers=auth("bob"))).status_code == 404
    assert (await client.get("/v1/documents", headers=auth("bob"))).json()["items"] == []
    # bob's delete attempt did not remove alice's vectors
    alice = (await client.get("/v1/me", headers=auth("alice"))).json()
    assert await svc.vectors.count_user(DOC_CHUNKS, alice["id"]) >= 1
    assert (await client.get(f"/v1/documents/{doc_id}", headers=auth("alice"))).status_code == 200
    assert (
        await client.get(f"/v1/documents/{uuid.uuid4()}", headers=auth("alice"))
    ).status_code == 404


async def test_document_pagination(client: httpx.AsyncClient) -> None:
    ids = [(await upload(client, PDF_MIN, f"d{i}.pdf")).json()["id"] for i in range(5)]
    first = (await client.get("/v1/documents?limit=2", headers=auth())).json()
    assert [d["id"] for d in first["items"]] == ids[::-1][:2] and first["next_cursor"]
    second = (
        await client.get(f"/v1/documents?limit=2&cursor={first['next_cursor']}", headers=auth())
    ).json()
    assert [d["id"] for d in second["items"]] == ids[::-1][2:4]
