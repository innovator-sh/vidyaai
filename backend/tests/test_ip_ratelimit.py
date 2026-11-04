from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

import httpx
import pytest
from sqlalchemy import func, select
from starlette.types import Scope

from app.config import Settings
from app.db.models import IpUsageCounter
from app.errors import AppError
from app.middleware import client_ip
from app.services.container import Services
from app.services.ratelimit import RateLimiter, hash_ip
from tests.conftest import Fakes, auth


@pytest.fixture
def settings(settings: Settings) -> Settings:
    settings.rl_ip_public_per_min = 3
    settings.rl_ip_v1_per_min = 6
    return settings


def xff(value: str) -> dict[str, str]:
    return {"X-Forwarded-For": value}


async def test_readyz_is_limited_per_ip_with_retry_after(client: httpx.AsyncClient) -> None:
    codes = [(await client.get("/readyz")).status_code for _ in range(3)]
    assert codes == [200] * 3
    r = await client.get("/readyz")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert 1 <= int(r.headers["retry-after"]) <= 60
    assert "x-request-id" in r.headers  # still wrapped by the request-context middleware


async def test_healthz_is_never_limited(client: httpx.AsyncClient) -> None:
    for _ in range(10):
        assert (await client.get("/healthz")).status_code == 200


async def test_unknown_unauthenticated_paths_share_the_public_bucket(
    client: httpx.AsyncClient,
) -> None:
    codes = [(await client.get(f"/nope/{i}")).status_code for i in range(4)]
    assert codes == [404, 404, 404, 429]


async def test_v1_flood_with_bad_tokens_is_throttled_before_token_verification(
    client: httpx.AsyncClient, fakes: Fakes
) -> None:
    bad = {"Authorization": "Bearer garbage"}
    codes = [(await client.get("/v1/me", headers=bad)).status_code for _ in range(8)]
    assert codes == [401] * 6 + [429] * 2
    assert fakes.verifier.calls == 6  # the throttled requests never reached the verifier
    r = await client.get("/v1/me", headers=auth())
    assert r.status_code == 429 and "retry-after" in r.headers  # valid tokens share the IP cap


async def test_other_ips_are_unaffected(client: httpx.AsyncClient) -> None:
    for _ in range(4):
        await client.get("/readyz", headers=xff("203.0.113.1"))
    assert (await client.get("/readyz", headers=xff("203.0.113.1"))).status_code == 429
    assert (await client.get("/readyz", headers=xff("203.0.113.2"))).status_code == 200


async def test_spoofed_leftmost_xff_does_not_evade_the_limit(client: httpx.AsyncClient) -> None:
    """Cloud Run appends the real peer on the right; the client controls everything to its left."""
    real = "198.51.100.7"
    codes = [
        (await client.get("/readyz", headers=xff(f"10.0.0.{i}, {real}"))).status_code
        for i in range(5)
    ]
    assert codes == [200, 200, 200, 429, 429]
    # and a spoofed entry cannot frame a victim: their bucket is untouched
    assert (await client.get("/readyz", headers=xff("203.0.113.50"))).status_code == 200
    assert (await client.get("/readyz", headers=xff(f"203.0.113.50, {real}"))).status_code == 429


async def test_limit_is_shared_by_replicas_and_stores_only_a_hash(
    svc: Services, client: httpx.AsyncClient
) -> None:
    for _ in range(3):
        await client.get("/readyz", headers=xff("192.0.2.9"))
    other_replica = RateLimiter(svc.sessionmaker)
    with pytest.raises(AppError) as exc:
        await other_replica.check_ip("192.0.2.9", "ip_public", 60, 3)
    assert exc.value.status_code == 429 and "Retry-After" in exc.value.headers
    async with svc.sessionmaker() as s:
        keys = (await s.execute(select(IpUsageCounter.ip_hash))).scalars().all()
    assert keys == [hash_ip("192.0.2.9")] and "192.0.2.9" not in keys[0]


async def test_old_ip_windows_are_garbage_collected(svc: Services) -> None:
    t0 = datetime(2026, 1, 1, 12, tzinfo=UTC)
    await svc.limiter.check_ip("192.0.2.5", "ip_public", 60, 10, now=t0)
    await svc.limiter.check_ip("192.0.2.5", "ip_public", 60, 10, now=t0.replace(hour=15))
    async with svc.sessionmaker() as s:
        n = (await s.execute(select(func.count()).select_from(IpUsageCounter))).scalar_one()
    assert n == 1


async def test_limiter_failure_fails_open(
    svc: Services, client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(*_: object, **__: object) -> None:
        raise RuntimeError("db down")

    monkeypatch.setattr(svc.limiter, "check_ip", boom)
    assert (await client.get("/readyz")).status_code == 200


async def test_429_carries_cors_headers(client: httpx.AsyncClient) -> None:
    for _ in range(3):
        await client.get("/readyz")
    r = await client.get("/readyz", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 429
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "retry-after" in r.headers["access-control-expose-headers"].lower()


async def test_preflight_is_not_counted(client: httpx.AsyncClient) -> None:
    for _ in range(10):
        r = await client.options(
            "/v1/me",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        assert r.status_code == 200


def scope(peer: str | None, header: str | None = None) -> Scope:
    headers = [(b"x-forwarded-for", header.encode())] if header is not None else []
    client: Any = (peer, 1234) if peer else None
    return cast(Scope, {"type": "http", "headers": headers, "client": client})


def test_client_ip_picks_the_right_most_trusted_hop() -> None:
    assert client_ip(scope("169.254.1.1", "6.6.6.6, 203.0.113.9"), 1) == "203.0.113.9"
    # two trusted proxies (e.g. Cloud Run behind a load balancer): skip the LB's own entry
    assert client_ip(scope("169.254.1.1", "6.6.6.6, 203.0.113.9, 35.191.0.1"), 2) == "203.0.113.9"
    # shorter chain than configured hops: best available, never an error
    assert client_ip(scope("169.254.1.1", "203.0.113.9"), 3) == "203.0.113.9"


def test_client_ip_ignores_header_without_trusted_proxy() -> None:
    assert client_ip(scope("192.0.2.1", "6.6.6.6"), 0) == "192.0.2.1"
    assert client_ip(scope("192.0.2.1"), 1) == "192.0.2.1"
    assert client_ip(scope(None), 1) == "unknown"


def test_client_ip_rejects_garbage_and_normalises_ipv6() -> None:
    assert client_ip(scope("192.0.2.1", "not-an-ip"), 1) == "unknown"
    a = client_ip(scope("x", "2001:db8:1:2:aaaa::1"), 1)
    b = client_ip(scope("x", "2001:db8:1:2:bbbb::9"), 1)
    assert a == b == "2001:db8:1:2::/64"  # one /64 = one bucket
    assert client_ip(scope("x", "::ffff:203.0.113.4"), 1) == "203.0.113.4"
    assert client_ip(scope("x", "[2001:db8::1]"), 1) == "2001:db8::/64"
