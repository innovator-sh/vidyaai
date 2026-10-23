from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from app.db.models import User
from app.deps import ServicesDep, SessionDep, rate_limit
from app.schemas.api import ChatRequest
from app.services.chat import prepare_turn, stream_turn
from app.services.memory import PostChat, update_student_memory

router = APIRouter(prefix="/v1", tags=["chat"])

ChatUser = Annotated[User, Depends(rate_limit("chat", "rl_chat_per_min"))]


@router.post("/chat")
async def chat(
    req: ChatRequest, user: ChatUser, session: SessionDep, svc: ServicesDep
) -> StreamingResponse:
    """SSE stream. The user message is committed BEFORE any token is produced."""
    turn = await prepare_turn(session, user, req)
    job = PostChat(user_id=user.id, conversation_id=turn.conversation.id, question=req.message)
    return StreamingResponse(
        stream_turn(svc, user, req, turn, job),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        # Memory/root-cause update runs after the stream has been delivered.
        background=BackgroundTask(update_student_memory, svc, job),
    )
