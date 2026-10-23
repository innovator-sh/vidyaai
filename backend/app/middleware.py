"""Pure-ASGI middlewares (safe with streaming responses): request id/logging, headers, body cap."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid

from fastapi import HTTPException
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.logging_config import request_id_var, user_id_var

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
