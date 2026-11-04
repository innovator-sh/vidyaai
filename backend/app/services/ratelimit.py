"""DB-backed fixed-window rate limiter + daily quota (works across N instances).

Two key spaces share one implementation: authenticated users (`usage_counters`, FK to users) and
client IPs (`ip_usage_counters`, keyed by a SHA-256 of the address so raw IPs are never stored).
"""

from __future__ import annotations

import hashlib
import math
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.models import IpUsageCounter, UsageCounter
from app.errors import AppError

DAY_BUCKET = "day"
IP_GLOBAL_GC_ONE_IN = 200  # on a new window, 1/N of the time purge every stale IP window


def hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def _window(now: datetime, window_seconds: int) -> tuple[int, datetime]:
    epoch = int(now.timestamp())
    start_epoch = epoch - (epoch % window_seconds)
    return start_epoch, datetime.fromtimestamp(start_epoch, UTC)


def _too_many(bucket: str, retry_after: int) -> AppError:
    what = "Daily quota reached" if bucket == DAY_BUCKET else "Too many requests"
    return AppError(
        429,
        "rate_limited" if bucket != DAY_BUCKET else "quota_exceeded",
        f"{what}. Retry in {retry_after}s.",
        headers={"Retry-After": str(retry_after)},
    )


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
        start_epoch, window_start = _window(now, window_seconds)
        async with self._sm() as session:
            insert = pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert
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
            raise _too_many(bucket, retry_after)

    async def check_ip(
        self,
        ip: str,
        bucket: str,
        window_seconds: int,
        limit: int,
        *,
        now: datetime | None = None,
    ) -> None:
        """Same as `check` but keyed on a client IP (no user row needed, works pre-auth)."""
        now = now or datetime.now(UTC)
        start_epoch, window_start = _window(now, window_seconds)
        key = hash_ip(ip)
        async with self._sm() as session:
            insert = pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert
            upsert = (
                insert(IpUsageCounter)
                .values(ip_hash=key, bucket=bucket, window_start=window_start, count=1)
                .on_conflict_do_update(
                    index_elements=["ip_hash", "bucket", "window_start"],
                    set_={"count": IpUsageCounter.count + 1},
                )
                .returning(IpUsageCounter.count)
            )
            count = (await session.execute(upsert)).scalar_one()
            if count == 1:
                # Keep the table small: drop this IP's old windows, and now and then everyone's.
                await session.execute(
                    delete(IpUsageCounter).where(
                        IpUsageCounter.ip_hash == key,
                        IpUsageCounter.window_start < window_start - timedelta(hours=1),
                    )
                )
                if secrets.randbelow(IP_GLOBAL_GC_ONE_IN) == 0:
                    await session.execute(
                        delete(IpUsageCounter).where(
                            IpUsageCounter.window_start < window_start - timedelta(days=1)
                        )
                    )
            await session.commit()
        if count > limit:
            retry_after = max(1, math.ceil(start_epoch + window_seconds - now.timestamp()))
            raise _too_many(bucket, retry_after)
