from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Document, QuizResult
from app.utils.cursor import decode_cursor, encode_cursor


class DocumentRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def create(
        self, user_id: uuid.UUID, *, name: str, mime_type: str, size_bytes: int
    ) -> Document:
        doc = Document(user_id=user_id, name=name, mime_type=mime_type, size_bytes=size_bytes)
        self.s.add(doc)
        await self.s.commit()
        return doc

    async def get(self, user_id: uuid.UUID, doc_id: uuid.UUID) -> Document | None:
        res = await self.s.execute(
            select(Document).where(Document.id == doc_id, Document.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def list_page(
        self, user_id: uuid.UUID, cursor: str | None, limit: int
    ) -> tuple[Sequence[Document], str | None]:
        stmt = select(Document).where(Document.user_id == user_id)
        if cursor:
            ts, cid = decode_cursor(cursor)
            stmt = stmt.where(
                or_(Document.created_at < ts, and_(Document.created_at == ts, Document.id < cid))
            )
        stmt = stmt.order_by(Document.created_at.desc(), Document.id.desc()).limit(limit + 1)
        rows = list((await self.s.execute(stmt)).scalars())
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id)
        return rows, next_cursor

    async def set_status(
        self,
        user_id: uuid.UUID,
        doc_id: uuid.UUID,
        status: str,
        *,
        chunk_count: int = 0,
        error: str | None = None,
    ) -> None:
        await self.s.execute(
            update(Document)
            .where(Document.id == doc_id, Document.user_id == user_id)
            .values(status=status, chunk_count=chunk_count, error=error)
        )
        await self.s.commit()

    async def delete(self, user_id: uuid.UUID, doc_id: uuid.UUID) -> bool:
        res = await self.s.execute(
            delete(Document).where(Document.id == doc_id, Document.user_id == user_id)
        )
        await self.s.commit()
        return bool(res.rowcount)  # type: ignore[attr-defined]

    async def all_for_user(self, user_id: uuid.UUID) -> Sequence[Document]:
        res = await self.s.execute(
            select(Document).where(Document.user_id == user_id).order_by(Document.created_at)
        )
        return res.scalars().all()


class QuizRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def create(
        self, user_id: uuid.UUID, *, score: int, total: int, subject: str | None
    ) -> QuizResult:
        row = QuizResult(user_id=user_id, score=score, total=total, subject=subject)
        self.s.add(row)
        await self.s.commit()
        return row

    async def recent(self, user_id: uuid.UUID, limit: int = 50) -> Sequence[QuizResult]:
        res = await self.s.execute(
            select(QuizResult)
            .where(QuizResult.user_id == user_id)
            .order_by(QuizResult.created_at.desc(), QuizResult.id.desc())
            .limit(limit)
        )
        return res.scalars().all()
