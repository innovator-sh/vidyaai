"""Uniform error envelope: {"error": {"code": str, "message": str}}."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errors")

_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "upstream_error",
    503: "unavailable",
}


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers or {}


def not_found(what: str = "Resource") -> AppError:
    return AppError(404, "not_found", f"{what} not found")


def envelope(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            envelope(exc.code, exc.message), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "error")
        return JSONResponse(
            envelope(code, str(exc.detail)),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Report field locations and messages only - never echo submitted values.
        def where(err: dict[str, Any]) -> str:
            return ".".join(str(p) for p in err.get("loc", ()) if p != "body")

        problems = "; ".join(f"{where(e)}: {e.get('msg', 'invalid')}" for e in exc.errors()[:5])
        return JSONResponse(envelope("validation_error", problems or "Invalid request"), 422)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", extra={"error_type": type(exc).__name__}, exc_info=exc)
        return JSONResponse(envelope("internal_error", "Internal server error"), 500)
