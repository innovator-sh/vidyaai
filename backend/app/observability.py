"""Optional Sentry error tracking. A no-op unless SENTRY_DSN is set.

Privacy: no PII, no request bodies/headers/cookies/query strings, no local variables, and emails or
bearer tokens that slip into exception text or breadcrumbs are redacted before an event leaves.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.config import Settings

log = logging.getLogger("app.observability")

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*")

_REQUEST_DROP = ("data", "headers", "cookies", "query_string", "env")


def _scrub_text(value: str) -> str:
    value = _BEARER.sub("Bearer [redacted]", value)
    value = _JWT.sub("[redacted-token]", value)
    return _EMAIL.sub("[redacted-email]", value)


def _scrub_any(value: Any) -> Any:
    if isinstance(value, str):
        return _scrub_text(value)
    if isinstance(value, dict):
        return {k: _scrub_any(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub_any(v) for v in value]
    return value


def scrub_event(event: dict[str, Any], hint: dict[str, Any] | None = None) -> dict[str, Any]:
    """`before_send` / `before_send_transaction` hook: strip anything user-identifying."""
    request = event.get("request")
    if isinstance(request, dict):
        for key in _REQUEST_DROP:
            request.pop(key, None)
        if isinstance(request.get("url"), str):
            request["url"] = request["url"].split("?", 1)[0]
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if user.get("id") else {}
    event.pop("server_name", None)
    for exc in (event.get("exception") or {}).get("values", []) or []:
        if isinstance(exc.get("value"), str):
            exc["value"] = _scrub_text(exc["value"])
        for frame in (exc.get("stacktrace") or {}).get("frames", []) or []:
            frame.pop("vars", None)
    for crumb in (event.get("breadcrumbs") or {}).get("values", []) or []:
        if isinstance(crumb.get("message"), str):
            crumb["message"] = _scrub_text(crumb["message"])
        if "data" in crumb:
            crumb["data"] = _scrub_any(crumb["data"])
    if isinstance(event.get("message"), str):
        event["message"] = _scrub_text(event["message"])
    if isinstance(event.get("logentry"), dict):
        event["logentry"] = _scrub_any(event["logentry"])
    if "extra" in event:
        event["extra"] = _scrub_any(event["extra"])
    return event


def init_sentry(settings: Settings) -> bool:
    """Initialise Sentry if SENTRY_DSN is set. Returns whether it was enabled."""
    dsn = settings.sentry_dsn.get_secret_value().strip()
    if not dsn:
        return False
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.env,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        before_send=scrub_event,  # type: ignore[arg-type]
        before_send_transaction=scrub_event,  # type: ignore[arg-type]
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    log.info("sentry_enabled")
    return True
