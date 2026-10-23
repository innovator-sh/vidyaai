"""SQLAlchemy 2.0 models. Portable across PostgreSQL (prod) and SQLite (tests)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetimes on every backend (SQLite drops tzinfo otherwise)."""

    impl = sa.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: sa.Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: sa.Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


JSONType = sa.JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)


def _user_fk() -> Mapped[uuid.UUID]:
    return mapped_column(sa.Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _pk()
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(120))
    course: Mapped[str | None] = mapped_column(String(120))
    degree: Mapped[str | None] = mapped_column(String(120))
    college: Mapped[str | None] = mapped_column(String(160))
    location: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_user_updated", "user_id", "updated_at"),)

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = _user_fk()
    title: Mapped[str] = mapped_column(String(160), nullable=False, default="New chat")
    subject: Mapped[str | None] = mapped_column(String(80))
    persona: Mapped[str] = mapped_column(String(32), nullable=False, default="study-buddy")
    is_favorite: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    preview: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "client_message_id", name="uq_messages_conv_client_id"),
        UniqueConstraint("conversation_id", "reply_to", name="uq_messages_conv_reply_to"),
        Index("ix_messages_conv_created", "conversation_id", "created_at"),
        Index("ix_messages_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = _pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    # Denormalised owner: every read filters on it (defence in depth).
    user_id: Mapped[uuid.UUID] = _user_fk()
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Client-generated idempotency key (user messages only).
    client_message_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    # For assistant messages: id of the user message being answered.
    reply_to: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (Index("ix_documents_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = _user_fk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="processing")
    error: Mapped[str | None] = mapped_column(String(200))
    chunk_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class QuizResult(Base):
    __tablename__ = "quiz_results"
    __table_args__ = (Index("ix_quiz_results_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = _user_fk()
    score: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    total: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    subject: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)


class UsageCounter(Base):
    """Fixed-window counters shared by all instances (rate limits and daily quota)."""

    __tablename__ = "usage_counters"

    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    bucket: Mapped[str] = mapped_column(String(32), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(UTCDateTime, primary_key=True)
    count: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
