"""Store document timestamps with their UTC timezone.

Revision ID: 20260716_0004
Revises: 20260716_0003
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0004"
down_revision: str | None = "20260716_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "thread_ownership",
        sa.Column("module_id", sa.String(length=64), nullable=False, server_default="rag"),
    )
    op.alter_column("thread_ownership", "module_id", server_default=None)
    for column_name in ("created_at", "updated_at"):
        op.alter_column(
            "documents",
            column_name,
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            postgresql_using=f"{column_name} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    for column_name in ("updated_at", "created_at"):
        op.alter_column(
            "documents",
            column_name,
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            postgresql_using=f"{column_name} AT TIME ZONE 'UTC'",
        )
    op.drop_column("thread_ownership", "module_id")
