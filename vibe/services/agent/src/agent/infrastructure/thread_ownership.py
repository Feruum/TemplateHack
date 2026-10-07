"""Thread ownership tracking for access control."""

import structlog
from sqlalchemy import Column, DateTime, String, func, select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from agent.infrastructure.database import Base, async_session

logger = structlog.get_logger(__name__)


class ThreadOwnership(Base):
    __tablename__ = "thread_ownership"

    thread_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    module_id = Column(String(64), nullable=False, default="rag")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


async def ensure_thread_ownership(
    thread_id: str, user_id: str, module_id: str = "rag"
) -> bool:
    """Atomically claim a new thread and reject an existing foreign owner."""
    async with async_session() as session:
        dialect = session.get_bind().dialect.name
        insert = sqlite_insert if dialect == "sqlite" else postgresql_insert
        statement = (
            insert(ThreadOwnership)
            .values(thread_id=thread_id, user_id=user_id, module_id=module_id)
            .on_conflict_do_nothing(index_elements=[ThreadOwnership.thread_id])
        )
        await session.execute(statement)
        record = await session.scalar(
            select(ThreadOwnership).where(
                ThreadOwnership.thread_id == thread_id
            )
        )
        await session.commit()
        return record is not None and record.user_id == user_id and record.module_id == module_id


async def check_thread_access(thread_id: str, user_id: str) -> bool:
    """Check if the authenticated user owns the thread."""
    async with async_session() as session:
        result = await session.execute(
            select(ThreadOwnership).where(ThreadOwnership.thread_id == thread_id)
        )
        record = result.scalar_one_or_none()
        if record is None:
            return False
        return record.user_id == user_id


async def get_thread_module(thread_id: str, user_id: str) -> str | None:
    async with async_session() as session:
        record = await session.scalar(
            select(ThreadOwnership).where(
                ThreadOwnership.thread_id == thread_id,
                ThreadOwnership.user_id == user_id,
            )
        )
        return record.module_id if record else None
