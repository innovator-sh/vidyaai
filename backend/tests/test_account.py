from __future__ import annotations

import uuid

import httpx
from sqlalchemy import func, select

from app.db.models import Conversation, Document, Message, QuizResult, UsageCounter, User
from app.services.container import Services
from app.vector.store import COLLECTIONS
from tests.conftest import Fakes, auth, chat
from tests.pdfutil import PDF_MIN


async def test_patch_me(client: httpx.AsyncClient) -> None:
    r = await client.patch(
        "/v1/me", json={"display_name": "Ali", "course": "BSc", "college": "IIT"}, headers=auth()
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Ali" and r.json()["course"] == "BSc"
    me = (await client.get("/v1/me", headers=auth())).json()
    assert me["college"] == "IIT" and me["degree"] is None
    assert (
        await client.patch("/v1/me", json={"display_name": "x" * 500}, headers=auth())
    ).status_code == 422
    # other users unaffected
    assert (await client.get("/v1/me", headers=auth("bob"))).json()["course"] is None


async def _populate(client: httpx.AsyncClient, user: str) -> None:
    await chat(client, f"{user} asks about photosynthesis", user=user)
    up = await client.post(
        "/v1/documents", files={"file": ("n.pdf", PDF_MIN, "application/pdf")}, headers=auth(user)
    )
    assert up.status_code == 202
    await client.post("/v1/quiz-results", json={"score": 3, "total": 5}, headers=auth(user))


async def test_export_contains_only_own_data(client: httpx.AsyncClient) -> None:
    await _populate(client, "alice")
    await _populate(client, "bob")
    data = (await client.get("/v1/me/export", headers=auth("alice"))).json()
    assert data["user"]["email"] == "alice@example.com"
    assert len(data["conversations"]) == 1
    assert data["conversations"][0]["messages"][0]["content"] == "alice asks about photosynthesis"
    assert len(data["documents"]) == 1 and len(data["quiz_results"]) == 1
    assert data["vector_data"]["student_memory"] and data["vector_data"]["doc_chunks"]
    blob = str(data)
    assert "bob" not in blob
    assert "user_id" not in str(data["vector_data"])


async def test_account_delete_wipes_postgres_qdrant_and_firebase(
    client: httpx.AsyncClient, svc: Services, fakes: Fakes
) -> None:
    await _populate(client, "alice")
    await _populate(client, "bob")
    alice = (await client.get("/v1/me", headers=auth("alice"))).json()
    bob = (await client.get("/v1/me", headers=auth("bob"))).json()
    for name in COLLECTIONS:
        assert await svc.vectors.count_user(name, alice["id"]) > 0

    r = await client.delete("/v1/me", headers=auth("alice"))
    assert r.status_code == 204
    assert fakes.auth_admin.deleted == ["uid-alice"]

    async with svc.sessionmaker() as s:
        for model in (Conversation, Message, Document, QuizResult, UsageCounter):
            n = (
                await s.execute(
                    select(func.count())
                    .select_from(model)
                    .where(model.user_id == uuid.UUID(alice["id"]))  # type: ignore[attr-defined]
                )
            ).scalar_one()
            assert n == 0, model.__tablename__
        assert (
            await s.execute(select(User).where(User.firebase_uid == "uid-alice"))
        ).first() is None
    for name in COLLECTIONS:
        assert await svc.vectors.count_user(name, alice["id"]) == 0

    # bob is untouched
    for name in COLLECTIONS:
        assert await svc.vectors.count_user(name, bob["id"]) > 0
    assert len((await client.get("/v1/conversations", headers=auth("bob"))).json()["items"]) == 1

    # Firebase would reject the deleted account; with our fake the token still works and starts fresh
    fresh = (await client.get("/v1/me", headers=auth("alice"))).json()
    assert fresh["id"] != alice["id"]
    assert (await client.get("/v1/conversations", headers=auth("alice"))).json()["items"] == []


async def test_account_delete_reports_firebase_failure_but_data_is_gone(
    client: httpx.AsyncClient, svc: Services, fakes: Fakes
) -> None:
    await _populate(client, "alice")
    alice = (await client.get("/v1/me", headers=auth("alice"))).json()
    fakes.auth_admin.fail = True
    r = await client.delete("/v1/me", headers=auth("alice"))
    assert r.status_code == 502 and r.json()["error"]["code"] == "identity_delete_failed"
    for name in COLLECTIONS:
        assert await svc.vectors.count_user(name, alice["id"]) == 0
    fakes.auth_admin.fail = False
    assert (await client.delete("/v1/me", headers=auth("alice"))).status_code == 204  # retry works


async def test_conversation_delete_removes_its_memory(
    client: httpx.AsyncClient, svc: Services
) -> None:
    _, ev = await chat(client, "How does photosynthesis make glucose?")
    cid = str(ev[0][1]["conversation_id"])
    me = (await client.get("/v1/me", headers=auth())).json()
    assert await svc.vectors.count_user("student_memory", me["id"]) == 2
    assert (await client.delete(f"/v1/conversations/{cid}", headers=auth())).status_code == 204
    assert await svc.vectors.count_user("student_memory", me["id"]) == 0
