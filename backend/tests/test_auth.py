"""Every /v1 route requires a valid Firebase token; transport hardening."""

from __future__ import annotations

import uuid

import httpx
import pytest

from app.config import ConfigError, Settings
from tests.conftest import auth

ZERO = "00000000-0000-0000-0000-000000000000"

V1_ROUTES = [
    ("GET", "/v1/me"),
    ("PATCH", "/v1/me"),
    ("DELETE", "/v1/me"),
    ("GET", "/v1/me/export"),
    ("GET", "/v1/conversations"),
    ("GET", f"/v1/conversations/{ZERO}"),
    ("PATCH", f"/v1/conversations/{ZERO}"),
    ("DELETE", f"/v1/conversations/{ZERO}"),
    ("POST", "/v1/chat"),
    ("POST", "/v1/documents"),
    ("GET", "/v1/documents"),
    ("GET", f"/v1/documents/{ZERO}"),
    ("DELETE", f"/v1/documents/{ZERO}"),
    ("POST", "/v1/ocr"),
    ("POST", "/v1/stt"),
    ("POST", "/v1/generate/quiz"),
    ("POST", "/v1/generate/flowchart"),
    ("POST", "/v1/generate/report"),
    ("POST", "/v1/quiz-results"),
    ("GET", "/v1/stats"),
]


@pytest.mark.parametrize(("method", "path"), V1_ROUTES)
async def test_requires_auth(client: httpx.AsyncClient, method: str, path: str) -> None:
    r = await client.request(method, path)
    assert r.status_code == 401, (method, path, r.text)
    assert r.json()["error"]["code"] == "unauthorized"
    assert r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(("method", "path"), V1_ROUTES[:3])
async def test_rejects_invalid_token(client: httpx.AsyncClient, method: str, path: str) -> None:
    r = await client.request(method, path, headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_token"


async def test_rejects_non_bearer_scheme(client: httpx.AsyncClient) -> None:
    r = await client.get("/v1/me", headers={"Authorization": "Basic abc"})
    assert r.status_code == 401


async def test_rejects_unverified_email(client: httpx.AsyncClient) -> None:
    r = await client.get("/v1/me", headers={"Authorization": "Bearer tok-unverified-mallory"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "email_not_verified"


async def test_uid_in_query_or_body_is_ignored(client: httpx.AsyncClient) -> None:
    a = (await client.get("/v1/me", headers=auth("alice"))).json()
    b = (
        await client.get(f"/v1/me?firebase_uid=uid-bob&user_id={a['id']}", headers=auth("bob"))
    ).json()
    assert a["id"] != b["id"]
    assert b["email"] == "bob@example.com"


async def test_ops_routes_need_no_auth(client: httpx.AsyncClient) -> None:
    assert (await client.get("/healthz")).status_code == 200
    assert (await client.get("/readyz")).status_code == 200


async def test_security_headers_and_request_id(client: httpx.AsyncClient) -> None:
    r = await client.get("/v1/me", headers=auth())
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"
    assert len(r.headers["x-request-id"]) >= 8
    r2 = await client.get("/healthz", headers={"X-Request-ID": "trace-1234567890"})
    assert r2.headers["x-request-id"] == "trace-1234567890"
    r3 = await client.get("/healthz", headers={"X-Request-ID": "bad id with spaces\t"})
    assert r3.headers["x-request-id"] != "bad id with spaces"


async def test_cors_allow_list(client: httpx.AsyncClient) -> None:
    ok = await client.options(
        "/v1/me",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" not in ok.headers
    bad = await client.options(
        "/v1/me",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in bad.headers


async def test_json_body_limit_413(client: httpx.AsyncClient) -> None:
    big = "x" * 1_100_000
    r = await client.post(
        "/v1/generate/quiz", content=big, headers={**auth(), "Content-Type": "application/json"}
    )
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"


async def test_validation_errors_use_envelope_and_do_not_echo_input(
    client: httpx.AsyncClient,
) -> None:
    r = await client.post(
        "/v1/quiz-results", json={"score": "secret-value", "total": 3}, headers=auth()
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert "secret-value" not in r.text


async def test_unknown_fields_rejected(client: httpx.AsyncClient) -> None:
    r = await client.patch("/v1/me", json={"email": "x@y.z"}, headers=auth())
    assert r.status_code == 422


def test_prod_config_fails_fast_on_missing_secrets() -> None:
    with pytest.raises(ConfigError) as exc:
        Settings(_env_file=None, env="prod")  # type: ignore[call-arg]
    msg = str(exc.value)
    for name in (
        "DATABASE_URL",
        "QDRANT_URL",
        "GROQ_API_KEY",
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "CORS_ORIGINS",
    ):
        assert name in msg


def test_prod_config_ok_when_complete() -> None:
    s = Settings(
        _env_file=None,  # type: ignore[call-arg]
        env="prod",
        database_url="postgresql://u:p@host/db",
        qdrant_url="https://q.example",
        groq_api_key="k",  # type: ignore[arg-type]
        firebase_service_account_json="{}",  # type: ignore[arg-type]
        cors_origins="https://a.example/, https://b.example",  # type: ignore[arg-type]
    )
    assert s.cors_origins == ["https://a.example", "https://b.example"]


def test_wildcard_cors_rejected() -> None:
    with pytest.raises(ValueError, match="allow-list"):
        Settings(_env_file=None, env="test", cors_origins="*")  # type: ignore[call-arg, arg-type]


async def test_user_ids_are_uuids(client: httpx.AsyncClient) -> None:
    me = (await client.get("/v1/me", headers=auth())).json()
    uuid.UUID(me["id"])
