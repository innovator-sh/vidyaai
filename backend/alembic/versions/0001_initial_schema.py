"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-23
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_TS = sa.DateTime(timezone=True)


def _user_fk() -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("firebase_uid", sa.String(128), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("display_name", sa.String(120), nullable=True),
        sa.Column("course", sa.String(120), nullable=True),
        sa.Column("degree", sa.String(120), nullable=True),
        sa.Column("college", sa.String(160), nullable=True),
        sa.Column("location", sa.String(160), nullable=True),
        sa.Column("created_at", _TS, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("firebase_uid"),
    )

    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("subject", sa.String(80), nullable=True),
        sa.Column("persona", sa.String(32), nullable=False),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column("preview", sa.String(200), nullable=False),
        sa.Column("created_at", _TS, nullable=False),
        sa.Column("updated_at", _TS, nullable=False),
        _user_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_user_updated", "conversations", ["user_id", "updated_at"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("client_message_id", sa.Uuid(), nullable=True),
        sa.Column("reply_to", sa.Uuid(), nullable=True),
        sa.Column(
            "meta",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=True,
        ),
        sa.Column("created_at", _TS, nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        _user_fk(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id", "client_message_id", name="uq_messages_conv_client_id"
        ),
        sa.UniqueConstraint("conversation_id", "reply_to", name="uq_messages_conv_reply_to"),
    )
    op.create_index("ix_messages_conv_created", "messages", ["conversation_id", "created_at"])
    op.create_index("ix_messages_user_created", "messages", ["user_id", "created_at"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("mime_type", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error", sa.String(200), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("created_at", _TS, nullable=False),
        _user_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documents_user_created", "documents", ["user_id", "created_at"])

    op.create_table(
        "quiz_results",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(80), nullable=True),
        sa.Column("created_at", _TS, nullable=False),
        _user_fk(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quiz_results_user_created", "quiz_results", ["user_id", "created_at"])

    op.create_table(
        "usage_counters",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("bucket", sa.String(32), nullable=False),
        sa.Column("window_start", _TS, nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        _user_fk(),
        sa.PrimaryKeyConstraint("user_id", "bucket", "window_start"),
    )


def downgrade() -> None:
    op.drop_table("usage_counters")
    op.drop_index("ix_quiz_results_user_created", table_name="quiz_results")
    op.drop_table("quiz_results")
    op.drop_index("ix_documents_user_created", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_messages_user_created", table_name="messages")
    op.drop_index("ix_messages_conv_created", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversations_user_updated", table_name="conversations")
    op.drop_table("conversations")
    op.drop_table("users")
