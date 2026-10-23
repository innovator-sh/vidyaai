from __future__ import annotations

import httpx

from tests.conftest import auth


async def test_health_and_ready(client: httpx.AsyncClient) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    r = await client.get("/readyz")
    assert r.status_code == 200, r.text
    assert r.json()["postgres"] is True and r.json()["qdrant"] is True


async def test_me_upserts_user(client: httpx.AsyncClient) -> None:
    r = await client.get("/v1/me", headers=auth("alice"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "alice@example.com"
    assert set(body) == {
        "id", "email", "display_name", "course", "degree", "college", "location", "created_at",
    }  # fmt: skip
    again = await client.get("/v1/me", headers=auth("alice"))
    assert again.json()["id"] == body["id"]
