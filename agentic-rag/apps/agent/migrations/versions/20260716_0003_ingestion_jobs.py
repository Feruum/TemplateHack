"""Add durable document ingestion job state.

Revision ID: 20260716_0003
Revises: 20260716_0002
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_0003"
down_revision: str | None = "20260716_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("job_id", sa.Uuid(), nullable=True))
    op.add_column(
        "documents", sa.Column("owner_id", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "documents", sa.Column("idempotency_key", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "documents", sa.Column("content_hash", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "documents", sa.Column("content_type", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "documents", sa.Column("blob_name", sa.String(length=1024), nullable=True)
    )
    op.add_column(
        "documents",
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "documents", sa.Column("error_code", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "documents", sa.Column("error_message", sa.String(length=2048), nullable=True)
    )
    op.add_column(
        "documents",
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "documents", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "documents",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("tombstoned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint("uq_documents_job_id", "documents", ["job_id"])
    op.create_unique_constraint(
        "uq_documents_idempotency_key", "documents", ["idempotency_key"]
    )
    op.create_index("ix_documents_owner_id", "documents", ["owner_id"], unique=False)
    op.create_index(
        "ix_documents_content_hash", "documents", ["content_hash"], unique=False
    )
    op.create_index(
        "ix_documents_status_updated",
        "documents",
        ["status", "updated_at"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_documents_progress_range", "documents", "progress BETWEEN 0 AND 100"
    )
    op.create_check_constraint(
        "ck_documents_status",
        "documents",
        "status IN ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DELETING', 'DELETED')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_documents_status", "documents", type_="check")
    op.drop_constraint("ck_documents_progress_range", "documents", type_="check")
    op.drop_index("ix_documents_status_updated", table_name="documents")
    op.drop_index("ix_documents_content_hash", table_name="documents")
    op.drop_index("ix_documents_owner_id", table_name="documents")
    op.drop_constraint("uq_documents_idempotency_key", "documents", type_="unique")
    op.drop_constraint("uq_documents_job_id", "documents", type_="unique")
    for column_name in [
        "tombstoned_at",
        "completed_at",
        "started_at",
        "attempt_count",
        "error_message",
        "error_code",
        "progress",
        "blob_name",
        "content_type",
        "content_hash",
        "idempotency_key",
        "owner_id",
        "job_id",
    ]:
        op.drop_column("documents", column_name)
