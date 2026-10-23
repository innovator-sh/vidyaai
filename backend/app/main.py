"""FastAPI application factory.  Run with:  uvicorn app.main:create_app --factory"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import Settings, get_settings
from app.errors import install_error_handlers
from app.logging_config import configure_logging
from app.middleware import BodyLimitMiddleware, RequestContextMiddleware
from app.routers import chat, conversations, documents, me, ops, stats, tools
from app.services.container import build_services

log = logging.getLogger("app.main")

UPLOAD_PATHS = ("/v1/documents", "/v1/ocr", "/v1/stt")


def create_app(settings: Settings | None = None, **overrides: Any) -> FastAPI:
    """Build the app. `overrides` replace external services (used by tests): engine, vectors,
    embedder, llm, ocr, stt, verifier, auth_admin."""
    settings = settings or get_settings()
    if settings.env != "test":
        configure_logging()
    services = build_services(settings, **overrides)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            await services.vectors.ensure_ready()
        except Exception as exc:  # readiness probe will report it; collections retried lazily
            log.warning("qdrant_init_failed", extra={"error_type": type(exc).__name__})
        yield
        await services.vectors.close()
        await services.engine.dispose()

    app = FastAPI(
        title="VidyaAI API",
        version="2.0.0",
        lifespan=lifespan,
        docs_url=None if settings.is_prod else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_prod else "/openapi.json",
    )
    app.state.services = services
    install_error_handlers(app)

    # add_middleware wraps: the LAST one added is the outermost.
    app.add_middleware(
        BodyLimitMiddleware,
        max_json=settings.max_json_bytes,
        max_upload=settings.max_upload_bytes,
        upload_paths=UPLOAD_PATHS,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["Retry-After", "X-Request-ID"],
        max_age=600,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(RequestContextMiddleware)

    for r in (ops, me, conversations, chat, documents, tools, stats):
        app.include_router(r.router)
    return app
