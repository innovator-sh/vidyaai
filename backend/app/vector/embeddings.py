"""Embedding provider interface + FastEmbed (ONNX) implementation."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Sequence
from typing import Any, Protocol


class Embedder(Protocol):
    dim: int

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class FastEmbedEmbedder:
    """BAAI/bge-small-en-v1.5 (384-d) via ONNX runtime. No torch."""

    dim = 384

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5", cache_dir: str | None = None):
        self._model_name = model_name
        self._cache_dir = cache_dir or None
        self._model: Any = None
        self._lock = threading.Lock()

    def _load(self) -> Any:
        with self._lock:
            if self._model is None:
                from fastembed import TextEmbedding

                self._model = TextEmbedding(self._model_name, cache_dir=self._cache_dir)
            return self._model

    def _embed_docs_sync(self, texts: list[str]) -> list[list[float]]:
        model = self._load()
        return [vec.tolist() for vec in model.embed(texts, batch_size=32)]

    def _embed_query_sync(self, text: str) -> list[float]:
        model = self._load()
        return next(vec.tolist() for vec in model.query_embed([text]))

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        return await asyncio.to_thread(self._embed_docs_sync, list(texts))

    async def embed_query(self, text: str) -> list[float]:
        return await asyncio.to_thread(self._embed_query_sync, text)
