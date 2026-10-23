from __future__ import annotations

import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, ServicesDep, SessionDep
from app.errors import not_found
from app.repositories.conversations import ConversationRepo
from app.schemas.api import ConversationDetail, ConversationPage, ConversationPatch
from app.vector.store import STUDENT_MEMORY

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])
log = logging.getLogger("app.conversations")


@router.get("", response_model=ConversationPage)
async def list_conversations(
    user: CurrentUser,
    session: SessionDep,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> Any:
    items, next_cursor = await ConversationRepo(session).list_page(user.id, cursor, limit)
    return {"items": items, "next_cursor": next_cursor}


async def _detail(session: AsyncSession, user_id: uuid.UUID, conv: Any) -> dict[str, Any]:
    messages = await ConversationRepo(session).list_messages(user_id, conv.id)
    return {
        "id": conv.id,
        "title": conv.title,
        "subject": conv.subject,
        "persona": conv.persona,
        "is_favorite": conv.is_favorite,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "messages": messages,
    }


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> Any:
    conv = await ConversationRepo(session).get(user.id, conversation_id)
    if conv is None:
        raise not_found("Conversation")
    return await _detail(session, user.id, conv)


@router.patch("/{conversation_id}", response_model=ConversationDetail)
async def patch_conversation(
    conversation_id: uuid.UUID, body: ConversationPatch, user: CurrentUser, session: SessionDep
) -> Any:
    conv = await ConversationRepo(session).get(user.id, conversation_id)
    if conv is None:
        raise not_found("Conversation")
    if body.title is not None:
        conv.title = body.title
    if body.is_favorite is not None:
        conv.is_favorite = body.is_favorite
    await session.commit()
    return await _detail(session, user.id, conv)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: uuid.UUID, user: CurrentUser, session: SessionDep, svc: ServicesDep
) -> Response:
    if not await ConversationRepo(session).delete(user.id, conversation_id):
        raise not_found("Conversation")
    # Memory derived from this conversation goes with it (best effort; row is already gone).
    try:
        await svc.vectors.delete_where(STUDENT_MEMORY, user.id, conversation_id=conversation_id)
    except Exception as exc:
        log.warning("memory_cleanup_failed", extra={"error_type": type(exc).__name__})
    return Response(status_code=204)
