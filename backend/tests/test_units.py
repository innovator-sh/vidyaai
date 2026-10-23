"""Pure unit tests + migration parity."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.db.session import normalize_database_url
from app.providers.llm import CircuitBreaker
from app.utils.chunker import chunk_text
from app.utils.cursor import decode_cursor, encode_cursor

BACKEND = Path(__file__).resolve().parent.parent


def test_chunker_respects_size_and_overlap() -> None:
    text = " ".join(f"word{i}" for i in range(1000))
    chunks = chunk_text(text, 200, 40)
    assert len(chunks) > 5
    assert all(len(c) <= 200 for c in chunks)
    # overlap: the head of chunk n+1 appears at the tail of chunk n
    for a, b in zip(chunks, chunks[1:], strict=False):
        assert b.split()[0] in a
    # nothing lost
    assert set(text.split()) <= set(" ".join(chunks).split())


def test_chunker_edge_cases() -> None:
    assert chunk_text("") == [] and chunk_text("   \n ") == []
    assert chunk_text("short") == ["short"]
    long_token = "x" * 2500
    assert all(len(c) <= 1000 for c in chunk_text(long_token))
    with pytest.raises(ValueError, match="overlap"):
        chunk_text("abc", 10, 10)
    paras = "\n\n".join(["para " * 50] * 10)
    assert all(len(c) <= 1000 for c in chunk_text(paras))


def test_cursor_roundtrip() -> None:
    import uuid
    from datetime import UTC, datetime

    ts, i = datetime(2026, 1, 2, 3, 4, 5, 678901, tzinfo=UTC), uuid.uuid4()
    assert decode_cursor(encode_cursor(ts, i)) == (ts, i)


def test_database_url_normalisation() -> None:
    url, args = normalize_database_url(
        "postgresql://u:p@ep-x-pooler.eu.aws.neon.tech/db?sslmode=require&channel_binding=require"
    )
    assert url == "postgresql+asyncpg://u:p@ep-x-pooler.eu.aws.neon.tech/db"
    assert args == {"ssl": True, "statement_cache_size": 0}
    url, args = normalize_database_url("postgres://u:p@localhost:5432/db")
    assert url == "postgresql+asyncpg://u:p@localhost:5432/db" and args == {}
    url, args = normalize_database_url("sqlite+aiosqlite:///C:\\tmp\\x.db")
    assert url == "sqlite+aiosqlite:///C:\\tmp\\x.db" and args == {}


def test_circuit_breaker_opens_and_half_opens() -> None:
    cb = CircuitBreaker(threshold=2, cooldown=0.05)
    assert cb.allow()
    cb.failure()
    assert cb.allow()
    cb.failure()
    assert not cb.allow()
    import time

    time.sleep(0.06)
    assert cb.allow()  # half-open probe
    cb.success()
    assert cb.allow()


def test_alembic_migration_matches_models(tmp_path: Path) -> None:
    """`alembic upgrade head` on a fresh DB must produce exactly the ORM schema."""
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite+aiosqlite:///{tmp_path / 'mig.db'}",
    }
    for cmd in (["upgrade", "head"], ["check"], ["downgrade", "base"]):
        res = subprocess.run(  # noqa: S603
            [sys.executable, "-m", "alembic", *cmd],
            cwd=BACKEND,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert res.returncode == 0, (cmd, res.stdout, res.stderr)
