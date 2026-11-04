"""per-IP rate-limit counters

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-04
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ip_usage_counters",
        sa.Column("ip_hash", sa.String(64), nullable=False),
        sa.Column("bucket", sa.String(32), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("ip_hash", "bucket", "window_start"),
    )
    op.create_index("ix_ip_usage_counters_window", "ip_usage_counters", ["window_start"])


def downgrade() -> None:
    op.drop_index("ix_ip_usage_counters_window", table_name="ip_usage_counters")
    op.drop_table("ip_usage_counters")
