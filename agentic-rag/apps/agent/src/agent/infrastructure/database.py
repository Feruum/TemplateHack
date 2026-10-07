from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, DateTime, Integer, JSON, String, Uuid
from datetime import datetime
import uuid

from agent.config.settings import settings

Base = declarative_base()


class DocumentModel(Base):
    __tablename__ = "documents"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    status = Column(String, nullable=False)  # PENDING, PROCESSING, COMPLETED, FAILED
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    metadata_json = Column("metadata", JSON, nullable=True)
    job_id = Column(Uuid, nullable=True, unique=True)
    owner_id = Column(String(255), nullable=True, index=True)
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

async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
