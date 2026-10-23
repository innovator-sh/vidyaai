"""Service container: every external dependency lives here so tests can inject fakes."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from qdrant_client import AsyncQdrantClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.auth.firebase import (
    AuthAdmin,
    AuthError,
    FirebaseAuthAdmin,
    FirebaseVerifier,
    NullAuthAdmin,
    TokenVerifier,
    VerifiedToken,
)
from app.config import Settings
from app.db.session import build_engine, build_sessionmaker
from app.providers.llm import GroqLLM, LLMProvider, UnconfiguredLLM
from app.providers.ocr import CompositeOCR, GroqVisionMathOCR, OCRProvider, SarvamHandwritingOCR
from app.providers.stt import SarvamSTT, STTProvider, UnconfiguredSTT
from app.services.ratelimit import RateLimiter
from app.vector.embeddings import Embedder, FastEmbedEmbedder
from app.vector.store import VectorStore

log = logging.getLogger("app.container")


class RejectAllVerifier:
    """Dev fallback when no Firebase credentials are configured: nothing authenticates."""

    async def verify(self, token: str) -> VerifiedToken:
        raise AuthError("firebase not configured")


@dataclass
class Services:
    settings: Settings
    engine: AsyncEngine
    sessionmaker: async_sessionmaker[AsyncSession]
    vectors: VectorStore
    embedder: Embedder
    llm: LLMProvider
    ocr: OCRProvider
    stt: STTProvider
    verifier: TokenVerifier
    auth_admin: AuthAdmin
    limiter: RateLimiter


def build_services(
    settings: Settings,
    *,
    engine: AsyncEngine | None = None,
    vectors: VectorStore | None = None,
    embedder: Embedder | None = None,
    llm: LLMProvider | None = None,
    ocr: OCRProvider | None = None,
    stt: STTProvider | None = None,
    verifier: TokenVerifier | None = None,
    auth_admin: AuthAdmin | None = None,
) -> Services:
    engine = engine or build_engine(settings)
    sm = build_sessionmaker(engine)

    if vectors is None:
        api_key = settings.qdrant_api_key.get_secret_value() or None
        if settings.qdrant_url:
            client = AsyncQdrantClient(url=settings.qdrant_url, api_key=api_key, timeout=15)
        else:
            log.warning("QDRANT_URL not set: using in-memory vector store (data is not persisted)")
            client = AsyncQdrantClient(":memory:")
        vectors = VectorStore(client, dim=settings.embedding_dim)

    embedder = embedder or FastEmbedEmbedder(
        settings.embedding_model, settings.fastembed_cache_path or None
    )

    groq_key = settings.groq_api_key.get_secret_value()
    if llm is None:
        llm = (
            GroqLLM(
                groq_key,
                chat_model=settings.llm_chat_model,
                vision_model=settings.llm_vision_model,
                timeout=settings.llm_timeout_seconds,
                max_tokens=settings.llm_max_output_tokens,
            )
            if groq_key
            else UnconfiguredLLM()
        )

    sarvam_key = settings.sarvam_api_key.get_secret_value()
    if ocr is None:
        ocr = CompositeOCR(
            handwriting=SarvamHandwritingOCR(sarvam_key) if sarvam_key else None,
            math=GroqVisionMathOCR(llm) if groq_key else None,
        )
    if stt is None:
        stt = SarvamSTT(sarvam_key) if sarvam_key else UnconfiguredSTT()

    sa_json = settings.firebase_service_account_json.get_secret_value()
    if verifier is None:
        verifier = FirebaseVerifier(sa_json) if sa_json else RejectAllVerifier()
    if auth_admin is None:
        auth_admin = FirebaseAuthAdmin(sa_json) if sa_json else NullAuthAdmin()

    return Services(
        settings=settings,
        engine=engine,
        sessionmaker=sm,
        vectors=vectors,
        embedder=embedder,
        llm=llm,
        ocr=ocr,
        stt=stt,
        verifier=verifier,
        auth_admin=auth_admin,
        limiter=RateLimiter(sm),
    )
