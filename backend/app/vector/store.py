"""The ONLY place that talks to Qdrant.

Every operation requires a `user_id` and always injects it as a mandatory payload filter, so a
bug in a caller can never read or write another user's vectors.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from qdrant_client import AsyncQdrantClient, models

log = logging.getLogger("app.vector")

STUDENT_MEMORY = "student_memory"
DOC_CHUNKS = "doc_chunks"
COLLECTIONS = (STUDENT_MEMORY, DOC_CHUNKS)
_INDEXED_FIELDS = ("user_id", "doc_id", "tag", "conversation_id")


@dataclass(frozen=True)
class Hit:
    id: str
    score: float
    payload: dict[str, Any]


def _require_user(user_id: uuid.UUID | str) -> str:
    uid = str(user_id).strip()
    if not uid:
        raise ValueError("user_id is required for every vector operation")
    return uid


def _flt(user_id: uuid.UUID | str, **equals: str | uuid.UUID | None) -> models.Filter:
    must: list[models.Condition] = [
        models.FieldCondition(key="user_id", match=models.MatchValue(value=_require_user(user_id)))
    ]
    for key, value in equals.items():
        if value is not None:
            must.append(models.FieldCondition(key=key, match=models.MatchValue(value=str(value))))
    return models.Filter(must=must)


class VectorStore:
    def __init__(self, client: AsyncQdrantClient, dim: int = 384) -> None:
        self._client = client
        self._dim = dim
        self._ready = False
        self._lock = asyncio.Lock()

    # --- lifecycle ---------------------------------------------------------------------------
    async def ensure_ready(self) -> None:
        if self._ready:
            return
        async with self._lock:
            if self._ready:
                return
            for name in COLLECTIONS:
                if not await self._client.collection_exists(name):
                    await self._client.create_collection(
                        name,
                        vectors_config=models.VectorParams(
                            size=self._dim, distance=models.Distance.COSINE
                        ),
                    )
                for field in _INDEXED_FIELDS:
                    await self._client.create_payload_index(
                        name, field, models.PayloadSchemaType.KEYWORD
                    )
            self._ready = True

    async def ping(self) -> bool:
        try:
            await self._client.get_collections()
            return True
        except Exception:
            log.warning("qdrant_ping_failed")
            return False

    async def close(self) -> None:
        await self._client.close()

    # --- writes ------------------------------------------------------------------------------
    async def upsert(
        self,
        collection: str,
        user_id: uuid.UUID | str,
        items: Sequence[tuple[Sequence[float], dict[str, Any]]],
    ) -> list[str]:
        uid = _require_user(user_id)
        if not items:
            return []
        await self.ensure_ready()
        ids = [str(uuid.uuid4()) for _ in items]
        points = [
            models.PointStruct(
                id=pid,
                vector=list(vec),
                # user_id is forced AFTER caller payload so it can never be overridden.
                payload={**payload, "user_id": uid},
            )
            for pid, (vec, payload) in zip(ids, items, strict=True)
        ]
        await self._client.upsert(collection, points=points, wait=True)
        return ids

    async def delete_where(
        self,
        collection: str,
        user_id: uuid.UUID | str,
        *,
        doc_id: uuid.UUID | str | None = None,
        conversation_id: uuid.UUID | str | None = None,
    ) -> None:
        """Delete this user's points (optionally narrowed). With no narrowing: all of them."""
        await self.ensure_ready()
        await self._client.delete(
            collection,
            points_selector=models.FilterSelector(
                filter=_flt(user_id, doc_id=doc_id, conversation_id=conversation_id)
            ),
            wait=True,
        )

    async def delete_user(self, user_id: uuid.UUID | str) -> None:
        for name in COLLECTIONS:
            await self.delete_where(name, user_id)

    # --- reads -------------------------------------------------------------------------------
    async def search(
        self,
        collection: str,
        user_id: uuid.UUID | str,
        vector: Sequence[float],
        *,
        limit: int = 5,
        doc_id: uuid.UUID | str | None = None,
        tag: str | None = None,
        score_threshold: float | None = None,
    ) -> list[Hit]:
        await self.ensure_ready()
        res = await self._client.query_points(
            collection,
            query=list(vector),
            query_filter=_flt(user_id, doc_id=doc_id, tag=tag),
            limit=limit,
            score_threshold=score_threshold,
            with_payload=True,
        )
        return [Hit(str(p.id), p.score, dict(p.payload or {})) for p in res.points]

    async def scroll_user(
        self, collection: str, user_id: uuid.UUID | str, limit: int = 2000
    ) -> list[dict[str, Any]]:
        await self.ensure_ready()
        out: list[dict[str, Any]] = []
        offset: Any = None
        while len(out) < limit:
            points, offset = await self._client.scroll(
                collection,
                scroll_filter=_flt(user_id),
                limit=min(256, limit - len(out)),
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            out.extend(dict(p.payload or {}) for p in points)
            if offset is None:
                break
        return out

    async def count_user(self, collection: str, user_id: uuid.UUID | str) -> int:
        await self.ensure_ready()
        res = await self._client.count(collection, count_filter=_flt(user_id), exact=True)
        return res.count
