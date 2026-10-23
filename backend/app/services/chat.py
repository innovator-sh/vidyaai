"""Chat orchestration: idempotent persistence, retrieval, streaming, post-processing."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Message, User
from app.errors import not_found
from app.prompts.system_prompt import get_system_prompt, wrap_untrusted
from app.providers.llm import LLMError
from app.repositories.conversations import ConversationRepo
from app.repositories.documents import DocumentRepo
from app.schemas.api import ChatRequest
from app.services.container import Services
from app.services.memory import PostChat, RetrievedContext, retrieve_context

log = logging.getLogger("app.chat")

FALLBACK_MESSAGE = "The tutor is temporarily unavailable. Please try again in a moment."
MAX_HISTORY_CHARS = 4000


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


def make_title(message: str) -> str:
    one_line = " ".join(message.split())
    return (one_line[:57] + "...") if len(one_line) > 60 else one_line


@dataclass
class Turn:
    conversation: Conversation
    user_message: Message
    existing_reply: Message | None


async def prepare_turn(session: AsyncSession, user: User, req: ChatRequest) -> Turn:
    """Persist the user message first (idempotent on message_id). Raises 404 for foreign ids."""
    convs = ConversationRepo(session)
    if req.document_id is not None and not await DocumentRepo(session).get(
        user.id, req.document_id
    ):
        raise not_found("Document")

    async def replay() -> Turn | None:
        existing = await convs.find_by_client_id(user.id, req.message_id)
        if existing is None:
            return None
        conv = await convs.get(user.id, existing.conversation_id)
        if conv is None:  # pragma: no cover - cascade makes this unreachable
            return None
        return Turn(conv, existing, await convs.find_reply(user.id, existing.id))

    if (turn := await replay()) is not None:
        return turn

    if req.conversation_id is not None:
        conv = await convs.get(user.id, req.conversation_id)
        if conv is None:
            raise not_found("Conversation")
        conv.persona = req.persona
    else:
        conv = await convs.create(user.id, title=make_title(req.message), persona=req.persona)
    try:
        msg = await convs.add_message(
            user.id, conv, role="user", content=req.message, client_message_id=req.message_id
        )
        await session.commit()
    except IntegrityError:
        # A concurrent request with the same message_id won the race.
        await session.rollback()
        turn = await replay()
        if turn is None:
            raise
        return turn
    return Turn(conv, msg, None)


def build_messages(
    req: ChatRequest,
    history: list[Message],
    ctx: RetrievedContext,
) -> list[dict[str, Any]]:
    system = get_system_prompt(
        persona=req.persona,
        weak_areas="; ".join(ctx.weak_areas) or "None identified yet",
        language=req.language,
    )
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for m in history:
        messages.append(
            {
                "role": "assistant" if m.role == "assistant" else "user",
                "content": m.content[:MAX_HISTORY_CHARS],
            }
        )
    blocks = [req.message]
    for name, text in ctx.doc_chunks:
        blocks.append(wrap_untrusted(f"document:{name}", text))
    if ctx.memory:
        blocks.append(wrap_untrusted("student-memory", "\n---\n".join(ctx.memory)))
    messages.append({"role": "user", "content": "\n\n".join(blocks)})
    return messages


def effective_window(svc: Services, requested: int | None) -> int:
    s = svc.settings
    value = s.chat_history_default if requested is None else requested
    return max(0, min(value, s.chat_history_max))


async def stream_turn(
    svc: Services, user: User, req: ChatRequest, turn: Turn, job: PostChat
) -> AsyncIterator[str]:
    conv = turn.conversation
    yield sse(
        "meta", {"conversation_id": str(conv.id), "user_message_id": str(turn.user_message.id)}
    )

    if turn.existing_reply is not None:  # idempotent replay: no new LLM call, no new rows
        yield sse("token", {"text": turn.existing_reply.content})
        yield sse(
            "done", {"assistant_message_id": str(turn.existing_reply.id), "title": conv.title}
        )
        return

    # --- build prompt ---------------------------------------------------------------------
    ctx = await retrieve_context(svc, user.id, req.message, req.document_id)
    async with svc.sessionmaker() as session:
        history = await ConversationRepo(session).recent_before(
            user.id,
            conv.id,
            turn.user_message.created_at,
            effective_window(svc, req.history_window),
        )
    messages = build_messages(req, history, ctx)

    # --- stream ---------------------------------------------------------------------------
    parts: list[str] = []
    try:
        async with asyncio.timeout(svc.settings.llm_stream_max_seconds):
            async for piece in svc.llm.stream(messages, model=svc.settings.llm_chat_model):
                parts.append(piece)
                yield sse("token", {"text": piece})
    except (LLMError, TimeoutError) as exc:
        code = "timeout" if isinstance(exc, TimeoutError) else "llm_unavailable"
        log.warning("chat_stream_failed", extra={"code": code})
        yield sse("error", {"code": code, "message": FALLBACK_MESSAGE})
        return

    answer = "".join(parts).strip()
    if not answer:
        yield sse("error", {"code": "empty_response", "message": FALLBACK_MESSAGE})
        return

    # --- persist --------------------------------------------------------------------------
    assistant_id = await _persist_reply(svc, user, turn, answer, ctx)
    job.answer = answer
    job.doc_text = "\n".join(t for _, t in ctx.doc_chunks)
    job.past = "\n".join(ctx.memory)
    yield sse("done", {"assistant_message_id": str(assistant_id), "title": conv.title})


async def _persist_reply(
    svc: Services, user: User, turn: Turn, answer: str, ctx: RetrievedContext
) -> Any:
    async with svc.sessionmaker() as session:
        convs = ConversationRepo(session)
        conv = await convs.get(user.id, turn.conversation.id)
        if conv is None:  # deleted mid-stream
            return turn.user_message.id
        try:
            msg = await convs.add_message(
                user.id,
                conv,
                role="assistant",
                content=answer,
                reply_to=turn.user_message.id,
                meta={"sources": ctx.doc_ids} if ctx.doc_ids else None,
            )
            await session.commit()
            return msg.id
        except IntegrityError:
            await session.rollback()
            existing = await convs.find_reply(user.id, turn.user_message.id)
            return existing.id if existing else turn.user_message.id
