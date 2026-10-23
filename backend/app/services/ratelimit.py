"""DB-backed fixed-window rate limiter + daily quota (works across N instances)."""

from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import UsageCounter
from app.errors import AppError

DAY_BUCKET = "day"


class RateLimiter:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sm = sessionmaker

    async def check(
        self,
        user_id: uuid.UUID,
        bucket: str,
        window_seconds: int,
        limit: int,
        *,
        now: datetime | None = None,
    ) -> None:
        """Count one hit; raise 429 (with Retry-After) once `limit` is exceeded."""
        now = now or datetime.now(UTC)
        epoch = int(now.timestamp())
        start_epoch = epoch - (epoch % window_seconds)
        window_start = datetime.fromtimestamp(start_epoch, UTC)
        async with self._sm() as session:
            dialect = session.get_bind().dialect.name
            insert = pg_insert if dialect == "postgresql" else sqlite_insert
            upsert = (
                insert(UsageCounter)
                .values(user_id=user_id, bucket=bucket, window_start=window_start, count=1)
                .on_conflict_do_update(
                    index_elements=["user_id", "bucket", "window_start"],
                    set_={"count": UsageCounter.count + 1},
                )
                .returning(UsageCounter.count)
            )
            count = (await session.execute(upsert)).scalar_one()
            if count == 1 and bucket == DAY_BUCKET:
                # Opportunistic GC of expired windows for this user.
                await session.execute(
                    delete(UsageCounter).where(
                        UsageCounter.user_id == user_id,
                        UsageCounter.window_start < window_start - timedelta(days=2),
                    )
                )
            await session.commit()
        if count > limit:
            retry_after = max(1, math.ceil(start_epoch + window_seconds - now.timestamp()))
            what = "Daily quota reached" if bucket == DAY_BUCKET else "Too many requests"
            raise AppError(
                429,
                "rate_limited" if bucket != DAY_BUCKET else "quota_exceeded",
                f"{what}. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )
