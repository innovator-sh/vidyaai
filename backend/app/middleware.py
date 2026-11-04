"""Pure-ASGI middlewares (safe with streaming responses): request id/logging, headers, body cap."""

from __future__ import annotations

import ipaddress
import json
import logging
import re
import time
import uuid

from fastapi import HTTPException
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.errors import AppError, envelope
from app.logging_config import request_id_var, user_id_var
from app.services.ratelimit import RateLimiter

log = logging.getLogger("app.access")

_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-site",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


class RequestContextMiddleware:
    """Assigns X-Request-ID, adds security headers, emits one JSON access-log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = Headers(scope=scope).get("x-request-id", "")
        rid = incoming if _SAFE_ID.match(incoming) else uuid.uuid4().hex
        token_r = request_id_var.set(rid)
        token_u = user_id_var.set("-")
        start = time.perf_counter()
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = MutableHeaders(scope=message)
                headers["x-request-id"] = rid
                for k, v in SECURITY_HEADERS.items():
                    headers.setdefault(k, v)
                if scope["path"].startswith("/v1"):
                    headers.setdefault("cache-control", "no-store")
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            log.info(
                "request",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                },
            )
            request_id_var.reset(token_r)
            user_id_var.reset(token_u)


class BodyLimitMiddleware:
    """Rejects oversized bodies (declared or streamed) with the standard 413 envelope."""

    def __init__(self, app: ASGIApp, max_json: int, max_upload: int, upload_paths: tuple[str, ...]):
        self.app = app
        self.max_json = max_json
        self.max_upload = max_upload + 64 * 1024  # multipart framing overhead
        self.upload_paths = upload_paths

    def _limit(self, path: str) -> int:
        return self.max_upload if path.startswith(self.upload_paths) else self.max_json

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS", "DELETE"):
            await self.app(scope, receive, send)
            return
        limit = self._limit(scope["path"])
        declared = Headers(scope=scope).get("content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            await self._reject(send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(413, "Request body too large")
            return message

        await self.app(scope, limited_receive, send)

    @staticmethod
    async def _reject(send: Send) -> None:
        body = json.dumps(
            {"error": {"code": "payload_too_large", "message": "Request body too large"}}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


def client_ip(scope: Scope, trusted_hops: int) -> str:
    """The caller's IP behind `trusted_hops` reverse proxies (Cloud Run = 1).

    Each trusted proxy APPENDS the address it received the connection from, so the real client is
    the entry `trusted_hops` places from the RIGHT of X-Forwarded-For. Entries further left are
    whatever the client chose to send and are never used (a spoofed leftmost entry is ignored).
    Without the header (or with hops=0) the socket peer is used. IPv6 is bucketed per /64 and
    IPv4-mapped IPv6 collapses to IPv4, so rotating inside a prefix does not evade the limiter.
    """
    peer = (scope.get("client") or ("unknown", 0))[0]
    candidate = peer
    if trusted_hops > 0:
        raw = Headers(scope=scope).get("x-forwarded-for", "")
        hops = [h.strip() for h in raw.split(",") if h.strip()]
        if hops:
            candidate = hops[max(0, len(hops) - trusted_hops)]
    try:
        addr = ipaddress.ip_address(candidate.strip("[]"))
    except ValueError:
        return "unknown"
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f"{addr}/64", strict=False))
    return str(addr)


class IPRateLimitMiddleware:
    """Per-IP, database-backed throttle for everything reachable without (or before) auth.

    /v1/* gets a coarse limit that runs BEFORE token verification, so floods of invalid tokens are
    throttled cheaply; every other path (readyz, docs, 404 probes) gets a stricter public limit.
    /healthz is exempt (constant response, must keep working when the database is down). If the
    limiter itself fails (database down) the request is let through - /readyz must still report
    503 rather than 500, and per-user limits still apply on authenticated routes.
    """

    def __init__(
        self,
        app: ASGIApp,
        limiter: RateLimiter,
        *,
        enabled: bool,
        v1_per_min: int,
        public_per_min: int,
        trusted_hops: int,
    ) -> None:
        self.app = app
        self.limiter = limiter
        self.enabled = enabled
        self.v1_per_min = v1_per_min
        self.public_per_min = public_per_min
        self.trusted_hops = trusted_hops

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if (
            scope["type"] != "http"
            or not self.enabled
            or scope["method"] == "OPTIONS"
            or path == "/healthz"
        ):
            await self.app(scope, receive, send)
            return
        is_v1 = path == "/v1" or path.startswith("/v1/")
        bucket, limit = ("ip_v1", self.v1_per_min) if is_v1 else ("ip_public", self.public_per_min)
        try:
            await self.limiter.check_ip(client_ip(scope, self.trusted_hops), bucket, 60, limit)
        except AppError as exc:
            await JSONResponse(
                envelope(exc.code, exc.message), status_code=exc.status_code, headers=exc.headers
            )(scope, receive, send)
            return
        except Exception as exc:
            log.warning("ip_ratelimit_unavailable", extra={"error_type": type(exc).__name__})
        await self.app(scope, receive, send)
