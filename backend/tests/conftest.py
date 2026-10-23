from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from qdrant_client import AsyncQdrantClient

from app.config import Settings
from app.db.models import Base
from app.main import create_app
from app.services.container import Services
from app.vector.store import VectorStore
from tests.fakes import FakeAuthAdmin, FakeEmbedder, FakeLLM, FakeOCR, FakeSTT, FakeVerifier
from tests.pdfutil import JPEG_MIN, PDF_MIN, PNG_MIN, make_pdf  # noqa: F401


@dataclass
class Fakes:
    llm: FakeLLM
    embedder: FakeEmbedder
    ocr: FakeOCR
    stt: FakeSTT
    verifier: FakeVerifier
    auth_admin: FakeAuthAdmin


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    db_url = os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        env="test",
        database_url=db_url,
        cors_origins=["http://localhost:3000"],
        daily_quota=1000,
        rag_score_threshold=0.2,  # fake bag-of-words embedder scores are low
    )


@pytest.fixture
def fakes() -> Fakes:
    return Fakes(FakeLLM(), FakeEmbedder(), FakeOCR(), FakeSTT(), FakeVerifier(), FakeAuthAdmin())


@pytest_asyncio.fixture
async def app(settings: Settings, fakes: Fakes) -> AsyncIterator[FastAPI]:
    vectors = VectorStore(AsyncQdrantClient(":memory:"), dim=384)
    application = create_app(
        settings,
        vectors=vectors,
        embedder=fakes.embedder,
        llm=fakes.llm,
        ocr=fakes.ocr,
        stt=fakes.stt,
        verifier=fakes.verifier,
        auth_admin=fakes.auth_admin,
    )
    svc: Services = application.state.services
    async with svc.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with application.router.lifespan_context(application):
        yield application
    async with svc.engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def svc(app: FastAPI) -> Services:
    services: Services = app.state.services
    return services


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def auth(name: str = "alice") -> dict[str, str]:
    return {"Authorization": f"Bearer tok-{name}"}


def parse_sse(body: str) -> list[tuple[str, dict[str, object]]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = block.splitlines()
        ev = next(ln[7:] for ln in lines if ln.startswith("event: "))
        data = json.loads(next(ln[6:] for ln in lines if ln.startswith("data: ")))
        events.append((ev, data))
    return events


async def chat(
    client: httpx.AsyncClient,
    message: str = "What is photosynthesis?",
    *,
    user: str = "alice",
    conversation_id: str | None = None,
    message_id: str | None = None,
    **extra: object,
) -> tuple[httpx.Response, list[tuple[str, dict[str, object]]]]:
    body = {
        "conversation_id": conversation_id,
        "message_id": message_id or str(uuid.uuid4()),
        "message": message,
        "persona": "teacher",
        **extra,
    }
    resp = await client.post("/v1/chat", json=body, headers=auth(user))
    return resp, parse_sse(resp.text) if resp.status_code == 200 else []
