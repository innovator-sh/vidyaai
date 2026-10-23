from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI

from app.errors import AppError
from app.services.container import Services
from app.services.ratelimit import DAY_BUCKET
from tests.conftest import auth, chat
from tests.pdfutil import PDF_MIN


async def test_chat_rate_limit_429_with_retry_after(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    limit = app.state.services.settings.rl_chat_per_min
    assert limit == 20
    for i in range(limit):
        r, _ = await chat(client, f"q{i}")
        assert r.status_code == 200
    r, _ = await chat(client, "one too many")
    assert r.status_code == 429
    body = r.json()
    assert body["error"]["code"] == "rate_limited"
    assert 1 <= int(r.headers["retry-after"]) <= 60
    # per-user: bob is unaffected
    r, _ = await chat(client, "hello", user="bob")
    assert r.status_code == 200
    # rejected request created no conversation for alice beyond the 20 allowed
    items = (await client.get("/v1/conversations?limit=50", headers=auth())).json()["items"]
    assert len(items) == 20


async def test_upload_limit(client: httpx.AsyncClient) -> None:
    codes = []
    for i in range(7):
        r = await client.post(
            "/v1/documents",
            files={"file": (f"{i}.pdf", PDF_MIN, "application/pdf")},
            headers=auth(),
        )
        codes.append(r.status_code)
    assert codes == [202] * 5 + [429] * 2


async def test_ocr_stt_share_a_bucket(client: httpx.AsyncClient, svc: Services) -> None:
    svc.settings.rl_ocr_stt_per_min = 2
    wav = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 32
    a = await client.post("/v1/stt", files={"audio": ("a.wav", wav, "audio/wav")}, headers=auth())
    b = await client.post("/v1/stt", files={"audio": ("a.wav", wav, "audio/wav")}, headers=auth())
    c = await client.post("/v1/stt", files={"audio": ("a.wav", wav, "audio/wav")}, headers=auth())
    assert (a.status_code, b.status_code, c.status_code) == (200, 200, 429)


async def test_daily_quota(client: httpx.AsyncClient, svc: Services) -> None:
    svc.settings.daily_quota = 3
    codes = [(await chat(client, f"q{i}"))[0].status_code for i in range(5)]
    assert codes == [200, 200, 200, 429, 429]
    r, _ = await chat(client, "again")
    assert r.json()["error"]["code"] == "quota_exceeded"
    assert int(r.headers["retry-after"]) > 60  # until the day window rolls over
    # generate endpoints draw from the same daily quota
    g = await client.post("/v1/generate/report", json={"content": "x"}, headers=auth())
    assert g.status_code == 429


async def test_counters_are_shared_through_the_database(
    svc: Services, client: httpx.AsyncClient
) -> None:
    """A second limiter instance (another Cloud Run replica) sees the same counts."""
    from app.services.ratelimit import RateLimiter

    uid = uuid.UUID((await client.get("/v1/me", headers=auth())).json()["id"])
    other_replica = RateLimiter(svc.sessionmaker)
    now = datetime(2026, 1, 1, 12, 0, 30, tzinfo=UTC)
    await svc.limiter.check(uid, "chat", 60, 2, now=now)
    await other_replica.check(uid, "chat", 60, 2, now=now)
    with pytest.raises(AppError) as exc:
        await svc.limiter.check(uid, "chat", 60, 2, now=now)
    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"] == "30"
    # next window starts fresh
    await svc.limiter.check(uid, "chat", 60, 2, now=now + timedelta(seconds=31))


async def test_old_daily_windows_are_garbage_collected(
    svc: Services, client: httpx.AsyncClient
) -> None:
    from sqlalchemy import func, select

    from app.db.models import UsageCounter

    uid = uuid.UUID((await client.get("/v1/me", headers=auth())).json()["id"])
    t0 = datetime(2026, 1, 1, 12, tzinfo=UTC)
    await svc.limiter.check(uid, DAY_BUCKET, 86400, 10, now=t0)
    await svc.limiter.check(uid, DAY_BUCKET, 86400, 10, now=t0 + timedelta(days=5))
    async with svc.sessionmaker() as s:
        n = (
            await s.execute(
                select(func.count())
                .select_from(UsageCounter)
                .where(UsageCounter.bucket == DAY_BUCKET)
            )
        ).scalar_one()
    assert n == 1
