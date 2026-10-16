"""Explicit user notes; the existing database owns persistence and isolation."""

from __future__ import annotations

from datetime import UTC, datetime
import uuid

from langchain_core.documents import Document
from sqlalchemy import Column, DateTime, Index, JSON, String, Text, delete, func, select, text
from sqlalchemy.dialects.postgresql import JSONB

from agent.infrastructure.database import Base
from agent.retrieval.ranking import keyword_rank

MAX_NOTES = 100
MAX_NOTE_LENGTH = 2000


class MemoryNote(Base):
    __tablename__ = 'agent_memories'
    __table_args__ = (Index('ix_agent_memories_user_created', 'user_id', 'created_at'),)

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column('metadata', JSON().with_variant(JSONB(), 'postgresql'), nullable=False, default=dict, server_default=text("'{}'"))
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), server_default=func.now())


def serialize_note(note: MemoryNote) -> dict:
    created_at = note.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    return {'id': note.id, 'content': note.content, 'created_at': created_at.isoformat()}


class MemoryNotes:
    def __init__(self, session):
        self.session = session

    async def list(self, user_id: str) -> list[dict]:
        if not user_id:
            raise ValueError('An authenticated user is required.')
        notes = await self.session.scalars(select(MemoryNote).where(MemoryNote.user_id == user_id).order_by(MemoryNote.created_at.desc(), MemoryNote.id).limit(1000))
        return [serialize_note(note) for note in notes]

    async def create(self, user_id: str, content: str) -> dict:
        content = content.strip()
        # Match the browser textarea and Zod's UTF-16 string-length boundary.
        content_length = len(content.encode('utf-16-le')) // 2
        if not user_id or not 1 <= content_length <= MAX_NOTE_LENGTH:
            raise ValueError('A note must contain 1 to 2000 characters and have an authenticated owner.')
        if self.session.get_bind().dialect.name == 'postgresql':
            # Serialize quota checks for this owner across API workers.
            await self.session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(user_id, 0))))
        count = await self.session.scalar(select(func.count(MemoryNote.id)).where(MemoryNote.user_id == user_id))
        if count >= MAX_NOTES:
            raise ValueError('A maximum of 100 notes is allowed. Delete a note before adding another.')
        note = MemoryNote(user_id=user_id, content=content)
        self.session.add(note)
        await self.session.commit()
        return serialize_note(note)

    async def delete(self, user_id: str, note_id: str) -> bool:
        if not user_id:
            raise ValueError('An authenticated user is required.')
        result = await self.session.execute(delete(MemoryNote).where(MemoryNote.user_id == user_id, MemoryNote.id == note_id))
        await self.session.commit()
        return result.rowcount > 0

    async def search(self, user_id: str, query: str) -> list[dict]:
        notes = await self.list(user_id)
        documents = [Document(page_content=note['content'], metadata={'id': note['id']}) for note in notes]
        ranked = keyword_rank(documents, query, 5)
        by_id = {note['id']: note for note in notes}
        # Recent explicit preferences remain useful when the wording differs.
        return [by_id[document.metadata['id']] for document in ranked] if ranked else notes[:5]


__all__ = ['MemoryNote', 'MemoryNotes']
