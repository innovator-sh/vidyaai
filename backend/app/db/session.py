"""Async engine/session construction."""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings

_SSL_ON = {"require", "verify-ca", "verify-full", "prefer", "allow"}
_DROPPED_PARAMS = {"sslmode", "channel_binding", "options"}


def normalize_database_url(url: str) -> tuple[str, dict[str, Any]]:
    """Return (sqlalchemy async url, connect_args).

    Accepts Neon/libpq style URLs (postgres://, postgresql://, ?sslmode=require&channel_binding=...)
    and converts them into something asyncpg understands.
    """
    connect_args: dict[str, Any] = {}
    if url.startswith("sqlite"):
        return url, connect_args
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"
    if scheme.startswith("postgresql+asyncpg"):
        query = parse_qsl(parts.query, keep_blank_values=True)
        sslmode = next((v for k, v in query if k == "sslmode"), None)
        kept = [(k, v) for k, v in query if k not in _DROPPED_PARAMS]
        if sslmode in _SSL_ON or any(k == "ssl" for k, _ in kept):
            connect_args["ssl"] = True
            kept = [(k, v) for k, v in kept if k != "ssl"]
        # PgBouncer (Neon "-pooler" hosts) cannot reuse prepared statements.
        if parts.hostname and "-pooler" in parts.hostname:
            connect_args["statement_cache_size"] = 0
        parts = parts._replace(query=urlencode(kept))
    return urlunsplit(parts._replace(scheme=scheme)), connect_args


def build_engine(settings: Settings) -> AsyncEngine:
    url, connect_args = normalize_database_url(settings.database_url)
    kwargs: dict[str, Any] = {"pool_pre_ping": True, "connect_args": connect_args}
    if url.startswith("postgresql"):
        kwargs.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=300,
        )
    engine = create_async_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine.sync_engine, "connect")
        def _sqlite_pragmas(dbapi_conn: Any, _rec: Any) -> None:
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


def build_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)
