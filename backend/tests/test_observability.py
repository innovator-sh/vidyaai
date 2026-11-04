from __future__ import annotations

from typing import Any

import pytest

from app import observability
from app.config import Settings
from app.observability import init_sentry, scrub_event

DSN = "https://publickey@o0.ingest.sentry.io/0"


def make_settings(**kw: Any) -> Settings:
    return Settings(_env_file=None, env="test", **kw)  # type: ignore[call-arg]


def test_init_is_a_noop_when_dsn_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    import sentry_sdk

    called: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: called.append(kw))
    assert init_sentry(make_settings()) is False
    assert init_sentry(make_settings(sentry_dsn="   ")) is False
    assert called == []


def test_init_when_set_is_privacy_preserving(monkeypatch: pytest.MonkeyPatch) -> None:
    import sentry_sdk

    called: list[dict[str, Any]] = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: called.append(kw))
    assert init_sentry(make_settings(sentry_dsn=DSN, sentry_traces_sample_rate=0.25)) is True
    (kw,) = called
    assert kw["dsn"] == DSN
    assert kw["send_default_pii"] is False
    assert kw["max_request_body_size"] == "never"
    assert kw["include_local_variables"] is False
    assert kw["traces_sample_rate"] == 0.25
    assert kw["before_send"] is observability.scrub_event
    assert kw["before_send_transaction"] is observability.scrub_event
    names = {type(i).__name__ for i in kw["integrations"]}
    assert "FastApiIntegration" in names


def test_default_trace_rate_is_zero() -> None:
    assert make_settings().sentry_traces_sample_rate == 0.0
    assert make_settings().sentry_dsn.get_secret_value() == ""


def test_scrub_event_strips_request_user_and_secrets() -> None:
    event: dict[str, Any] = {
        "request": {
            "url": "https://api.example.com/v1/chat?token=abc",
            "method": "POST",
            "headers": {"Authorization": "Bearer eyJhbGciOi.abcdefgh.sig", "Cookie": "s=1"},
            "data": {"message": "my private question"},
            "cookies": {"s": "1"},
            "query_string": "token=abc",
            "env": {"REMOTE_ADDR": "1.2.3.4"},
        },
        "user": {"id": "u-1", "email": "kid@example.com", "ip_address": "1.2.3.4", "username": "k"},
        "server_name": "host-1",
        "exception": {
            "values": [
                {
                    "value": "failed for kid@example.com with Bearer abc.def.ghi",
                    "stacktrace": {"frames": [{"function": "f", "vars": {"password": "x"}}]},
                }
            ]
        },
        "breadcrumbs": {
            "values": [
                {"message": "mail kid@example.com", "data": {"auth": "Bearer secret.token.value"}}
            ]
        },
        "message": "hello kid@example.com",
        "extra": {"note": "contact kid@example.com"},
    }
    out = scrub_event(event, {})
    blob = repr(out)
    assert "kid@example.com" not in blob
    assert "my private question" not in blob
    assert "abc.def.ghi" not in blob and "secret.token.value" not in blob
    assert "eyJhbGciOi" not in blob
    assert "1.2.3.4" not in blob and "host-1" not in blob and "password" not in blob
    assert out["user"] == {"id": "u-1"}
    assert out["request"]["url"] == "https://api.example.com/v1/chat"
    assert out["request"]["method"] == "POST"
    for key in ("headers", "data", "cookies", "query_string", "env"):
        assert key not in out["request"]


def test_scrub_event_tolerates_sparse_events() -> None:
    assert scrub_event({}, None) == {}
    assert scrub_event({"user": None, "request": None, "exception": None}, {})["user"] is None
