"""The single Qdrant wrapper must always scope by user_id."""

from __future__ import annotations

import uuid

import pytest
from qdrant_client import AsyncQdrantClient

from app.vector.store import DOC_CHUNKS, STUDENT_MEMORY, VectorStore
from tests.fakes import FakeEmbedder


@pytest.fixture
async def store() -> VectorStore:
    return VectorStore(AsyncQdrantClient(":memory:"), dim=384)


async def test_search_never_returns_other_users_points(store: VectorStore) -> None:
    emb = FakeEmbedder()
    a, b = uuid.uuid4(), uuid.uuid4()
    [va] = await emb.embed_documents(["secret alice biology notes"])
    [vb] = await emb.embed_documents(["secret bob biology notes"])
    await store.upsert(DOC_CHUNKS, a, [(va, {"text": "alice", "doc_id": "d1"})])
    await store.upsert(DOC_CHUNKS, b, [(vb, {"text": "bob", "doc_id": "d2"})])

    q = await emb.embed_query("secret biology notes")
    hits_a = await store.search(DOC_CHUNKS, a, q, limit=10)
    hits_b = await store.search(DOC_CHUNKS, b, q, limit=10)
    assert [h.payload["text"] for h in hits_a] == ["alice"]
    assert [h.payload["text"] for h in hits_b] == ["bob"]
    # even asking for the other user's doc_id yields nothing
    assert await store.search(DOC_CHUNKS, a, q, doc_id="d2") == []


async def test_caller_cannot_override_user_id_in_payload(store: VectorStore) -> None:
    emb = FakeEmbedder()
    a, b = uuid.uuid4(), uuid.uuid4()
    [v] = await emb.embed_documents(["spoof attempt"])
    await store.upsert(STUDENT_MEMORY, a, [(v, {"text": "t", "user_id": str(b)})])
    assert await store.count_user(STUDENT_MEMORY, b) == 0
    assert await store.count_user(STUDENT_MEMORY, a) == 1


async def test_empty_user_id_is_refused(store: VectorStore) -> None:
    emb = FakeEmbedder()
    [v] = await emb.embed_documents(["x"])
    for bad in ("", "   "):
        with pytest.raises(ValueError, match="user_id"):
            await store.search(DOC_CHUNKS, bad, v)
        with pytest.raises(ValueError, match="user_id"):
            await store.upsert(DOC_CHUNKS, bad, [(v, {})])
        with pytest.raises(ValueError, match="user_id"):
            await store.delete_where(DOC_CHUNKS, bad)


async def test_delete_where_is_scoped_and_narrowable(store: VectorStore) -> None:
    emb = FakeEmbedder()
    a, b = uuid.uuid4(), uuid.uuid4()
    [v] = await emb.embed_documents(["hello"])
    await store.upsert(DOC_CHUNKS, a, [(v, {"doc_id": "d1"}), (v, {"doc_id": "d2"})])
    await store.upsert(DOC_CHUNKS, b, [(v, {"doc_id": "d1"})])
    await store.delete_where(DOC_CHUNKS, a, doc_id="d1")
    assert await store.count_user(DOC_CHUNKS, a) == 1
    assert await store.count_user(DOC_CHUNKS, b) == 1
    await store.delete_user(a)
    assert await store.count_user(DOC_CHUNKS, a) == 0
    assert await store.count_user(DOC_CHUNKS, b) == 1


async def test_ids_are_uuids_and_unique(store: VectorStore) -> None:
    emb = FakeEmbedder()
    [v] = await emb.embed_documents(["hello"])
    u = uuid.uuid4()
    ids1 = await store.upsert(STUDENT_MEMORY, u, [(v, {})] * 3)
    ids2 = await store.upsert(STUDENT_MEMORY, u, [(v, {})] * 3)
    assert len(set(ids1 + ids2)) == 6
    for i in ids1:
        uuid.UUID(i)
    assert await store.count_user(STUDENT_MEMORY, u) == 6  # no id collisions (old chroma bug)


async def test_scroll_user_only_returns_own(store: VectorStore) -> None:
    emb = FakeEmbedder()
    [v] = await emb.embed_documents(["hello"])
    a, b = uuid.uuid4(), uuid.uuid4()
    await store.upsert(STUDENT_MEMORY, a, [(v, {"text": "a1"}), (v, {"text": "a2"})])
    await store.upsert(STUDENT_MEMORY, b, [(v, {"text": "b1"})])
    got = await store.scroll_user(STUDENT_MEMORY, a)
    assert sorted(p["text"] for p in got) == ["a1", "a2"]
