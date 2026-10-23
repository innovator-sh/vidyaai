from __future__ import annotations

import asyncio

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.deps import ServicesDep

router = APIRouter(tags=["ops"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness: the process is up."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(svc: ServicesDep) -> JSONResponse:
    """Readiness: Postgres and Qdrant are reachable."""

    async def db_ok() -> bool:
        try:
            async with svc.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    async def with_timeout(coro: asyncio.Future[bool] | asyncio.Task[bool]) -> bool:
        try:
            return await asyncio.wait_for(coro, timeout=3)
        except TimeoutError:
            return False

    db, vec = await asyncio.gather(
        with_timeout(asyncio.ensure_future(db_ok())),
        with_timeout(asyncio.ensure_future(svc.vectors.ping())),
    )
    ok = db and vec
    return JSONResponse(
        {"status": "ok" if ok else "unavailable", "postgres": db, "qdrant": vec},
        status_code=200 if ok else 503,
    )
