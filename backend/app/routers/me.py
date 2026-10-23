from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Response
from fastapi.encoders import jsonable_encoder

from app.deps import CurrentUser, ServicesDep, SessionDep
from app.errors import AppError
from app.repositories.conversations import ConversationRepo
from app.repositories.documents import DocumentRepo, QuizRepo
from app.repositories.users import UserRepo
from app.schemas.api import MeOut, MeUpdate
from app.vector.store import COLLECTIONS

router = APIRouter(prefix="/v1/me", tags=["account"])
log = logging.getLogger("app.me")


@router.get("", response_model=MeOut)
async def get_me(user: CurrentUser) -> Any:
    return user


@router.patch("", response_model=MeOut)
async def patch_me(body: MeUpdate, user: CurrentUser, session: SessionDep) -> Any:
    return await UserRepo(session).update_profile(user, body.model_dump(exclude_unset=True))


@router.delete("", status_code=204)
async def delete_me(user: CurrentUser, session: SessionDep, svc: ServicesDep) -> Response:
    """Erase everything: vectors, relational rows (cascade), then the Firebase identity."""
    uid, firebase_uid = user.id, user.firebase_uid
    await svc.vectors.delete_user(uid)
    await UserRepo(session).delete(uid)
    try:
        await svc.auth_admin.delete_user(firebase_uid)
    except Exception as exc:
        log.error("firebase_delete_failed", extra={"error_type": type(exc).__name__})
        raise AppError(
            502, "identity_delete_failed", "Data erased; retry to finish removing the login"
        ) from None
    return Response(status_code=204)


@router.get("/export")
async def export_me(user: CurrentUser, session: SessionDep, svc: ServicesDep) -> Any:
    convs_repo = ConversationRepo(session)
    conversations = []
    cursor = None
    while True:
        page, cursor = await convs_repo.list_page(user.id, cursor, 100)
        for c in page:
            msgs = await convs_repo.list_messages(user.id, c.id)
            conversations.append(
                {
                    "id": c.id,
                    "title": c.title,
                    "subject": c.subject,
                    "persona": c.persona,
                    "is_favorite": c.is_favorite,
                    "created_at": c.created_at,
                    "updated_at": c.updated_at,
                    "messages": [
                        {
                            "id": m.id,
                            "role": m.role,
                            "content": m.content,
                            "created_at": m.created_at,
                        }
                        for m in msgs
                    ],
                }
            )
        if cursor is None:
            break
    docs = await DocumentRepo(session).all_for_user(user.id)
    quizzes = await QuizRepo(session).recent(user.id, limit=1000)
    memory: dict[str, list[dict[str, Any]]] = {}
    for name in COLLECTIONS:
        items = await svc.vectors.scroll_user(name, user.id)
        memory[name] = [{k: v for k, v in p.items() if k != "user_id"} for p in items]
    return jsonable_encoder(
        {
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": user.display_name,
                "course": user.course,
                "degree": user.degree,
                "college": user.college,
                "location": user.location,
                "created_at": user.created_at,
            },
            "conversations": conversations,
            "documents": [
                {"id": d.id, "name": d.name, "status": d.status, "created_at": d.created_at}
                for d in docs
            ],
            "quiz_results": [
                {
                    "id": q.id,
                    "score": q.score,
                    "total": q.total,
                    "subject": q.subject,
                    "created_at": q.created_at,
                }
                for q in quizzes
            ],
            "vector_data": memory,
        }
    )
