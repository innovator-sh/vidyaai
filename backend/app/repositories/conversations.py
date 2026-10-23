"""Conversation + message persistence. EVERY query is filtered by user_id."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Message, QuizResult, utcnow
from app.utils.cursor import decode_cursor, encode_cursor


class ConversationRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    # --- conversations -----------------------------------------------------------------------
    async def create(self, user_id: uuid.UUID, *, title: str, persona: str) -> Conversation:
        conv = Conversation(user_id=user_id, title=title[:160], persona=persona)
        self.s.add(conv)
        await self.s.flush()
        return conv

    async def get(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> Conversation | None:
        res = await self.s.execute(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        return res.scalar_one_or_none()

    async def list_page(
        self, user_id: uuid.UUID, cursor: str | None, limit: int
    ) -> tuple[Sequence[Conversation], str | None]:
        stmt = select(Conversation).where(Conversation.user_id == user_id)
        if cursor:
            ts, cid = decode_cursor(cursor)
            stmt = stmt.where(
                or_(
                    Conversation.updated_at < ts,
                    and_(Conversation.updated_at == ts, Conversation.id < cid),
                )
            )
        stmt = stmt.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).limit(
            limit + 1
        )
        rows = list((await self.s.execute(stmt)).scalars())
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            last = rows[-1]
            next_cursor = encode_cursor(last.updated_at, last.id)
        return rows, next_cursor

    async def delete(self, user_id: uuid.UUID, conversation_id: uuid.UUID) -> bool:
        res = await self.s.execute(
            delete(Conversation).where(
                Conversation.id == conversation_id, Conversation.user_id == user_id
            )
        )
        await self.s.commit()
        return bool(res.rowcount)  # type: ignore[attr-defined]

    # --- messages ----------------------------------------------------------------------------
    async def add_message(
        self,
        user_id: uuid.UUID,
        conversation: Conversation,
        *,
        role: str,
        content: str,
        client_message_id: uuid.UUID | None = None,
        reply_to: uuid.UUID | None = None,
        meta: dict[str, object] | None = None,
    ) -> Message:
        assert conversation.user_id == user_id
        now = utcnow()
        # Keep strict ordering inside a conversation even on coarse clocks.
        if role == "assistant":
            last = await self._last_created_at(user_id, conversation.id)
            if last is not None and now <= last:
                now = last + timedelta(microseconds=1)
        msg = Message(
            conversation_id=conversation.id,
            user_id=user_id,
            role=role,
            content=content,
            client_message_id=client_message_id,
            reply_to=reply_to,
            meta=meta,
            created_at=now,
        )
        self.s.add(msg)
        conversation.updated_at = max(now, conversation.updated_at)
        conversation.preview = " ".join(content.split())[:200]
        await self.s.flush()
        return msg

    async def _last_created_at(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID
    ) -> datetime | None:
        res = await self.s.execute(
            select(func.max(Message.created_at)).where(
                Message.conversation_id == conversation_id, Message.user_id == user_id
            )
        )
        return res.scalar_one_or_none()

    async def list_messages(
        self, user_id: uuid.UUID, conversation_id: uuid.UUID, limit: int = 2000
    ) -> Sequence[Message]:
        res = await self.s.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.user_id == user_id)
            .order_by(Message.created_at.asc())
            .limit(limit)
        )
        return res.scalars().all()

    async def find_by_client_id(
        self, user_id: uuid.UUID, client_message_id: uuid.UUID
    ) -> Message | None:
        res = await self.s.execute(
            select(Message).where(
                Message.user_id == user_id,
                Message.client_message_id == client_message_id,
                Message.role == "user",
            )
        )
        return res.scalar_one_or_none()

    async def find_reply(self, user_id: uuid.UUID, user_message_id: uuid.UUID) -> Message | None:
        res = await self.s.execute(
            select(Message).where(
                Message.user_id == user_id,
                Message.reply_to == user_message_id,
                Message.role == "assistant",
            )
        )
        return res.scalar_one_or_none()

    async def recent_before(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        before: datetime,
        limit: int,
    ) -> list[Message]:
        if limit <= 0:
            return []
        res = await self.s.execute(
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.user_id == user_id,
                Message.created_at < before,
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        return list(reversed(res.scalars().all()))

    # --- stats -------------------------------------------------------------------------------
    async def count_user_messages(self, user_id: uuid.UUID) -> int:
        res = await self.s.execute(
            select(func.count())
            .select_from(Message)
            .where(Message.user_id == user_id, Message.role == "user")
        )
        return int(res.scalar_one())

    async def activity_days(self, user_id: uuid.UUID, since: datetime) -> set[str]:
        """ISO dates (UTC) on which the user sent a message or took a quiz."""
        days: set[str] = set()
        for model in (Message, QuizResult):
            col = model.created_at
            stmt = select(func.date(col)).distinct().where(model.user_id == user_id, col >= since)
            if model is Message:
                stmt = stmt.where(Message.role == "user")
            for (d,) in (await self.s.execute(stmt)).all():
                if d is not None:
                    days.add(str(d)[:10])
        return days
