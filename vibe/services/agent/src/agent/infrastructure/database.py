from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base
from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    JSON,
    LargeBinary,
    String,
    Uuid,
)
from datetime import UTC, datetime
import uuid

from agent.config.settings import settings

Base = declarative_base()


class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    status = Column(String, nullable=False)  # PENDING, PROCESSING, COMPLETED, FAILED
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    metadata_json = Column("metadata", JSON, nullable=True)
    job_id = Column(Uuid, nullable=True, unique=True)
    owner_id = Column(String(255), nullable=False, index=True)
    idempotency_key = Column(String(64), nullable=True, unique=True)
    content_hash = Column(String(64), nullable=True, index=True)
    content_type = Column(String(255), nullable=True)
    blob_name = Column(String(1024), nullable=True)
    progress = Column(Integer, nullable=False, default=0)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(2048), nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    tombstoned_at = Column(DateTime(timezone=True), nullable=True)


class CheckpointModel(Base):
    """Durable LangGraph checkpoint keyed by its trusted user owner."""

    __tablename__ = "agent_checkpoints"

    owner_id = Column(String(255), primary_key=True)
    thread_id = Column(String(255), primary_key=True)
    checkpoint_ns = Column(String(255), primary_key=True, default="")
    checkpoint_id = Column(String(255), primary_key=True)
    parent_checkpoint_id = Column(String(255), nullable=True)
    checkpoint_type = Column(String(64), nullable=False)
    checkpoint_data = Column(LargeBinary, nullable=False)
    metadata_type = Column(String(64), nullable=False)
    metadata_data = Column(LargeBinary, nullable=False)


class CheckpointWriteModel(Base):
    """Pending LangGraph writes, scoped to the same owner and thread key."""

    __tablename__ = "agent_checkpoint_writes"

    owner_id = Column(String(255), primary_key=True)
    thread_id = Column(String(255), primary_key=True)
    checkpoint_ns = Column(String(255), primary_key=True, default="")
    checkpoint_id = Column(String(255), primary_key=True)
    task_id = Column(String(255), primary_key=True)
    write_idx = Column(Integer, primary_key=True)
    task_path = Column(String(2048), nullable=False, default="")
    channel = Column(String(255), nullable=False)
    value_type = Column(String(64), nullable=False)
    value_data = Column(LargeBinary, nullable=False)


def normalize_asyncpg_url(raw_url: str) -> tuple[str, dict[str, object]]:
    """Translate libpq ``sslmode`` into asyncpg's ``ssl`` connect argument."""
    url = make_url(raw_url)
    query = dict(url.query)
    sslmode = query.pop("sslmode", None)
    connect_args: dict[str, object] = {}
    if sslmode is not None:
        connect_args["ssl"] = False if sslmode == "disable" else sslmode
        url = url.set(query=query)
    return url.render_as_string(hide_password=False), connect_args


_db_url, _connect_args = normalize_asyncpg_url(settings.database_url)

engine = create_async_engine(
    _db_url,
    echo=settings.debug,
    connect_args=_connect_args,
)

async_session = async_sessionmaker(engine, expire_on_commit=False)


async def initialize_database() -> None:
    """Create local service tables on first launch of the empty starter database."""
    # Import registers the ownership model in shared SQLAlchemy metadata.
    from agent.infrastructure.thread_ownership import ThreadOwnership  # noqa: F401
    from agent.memory.notes import MemoryNote  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
