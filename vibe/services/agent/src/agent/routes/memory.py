"""Only authenticated users may explicitly create or delete personal notes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy.ext.asyncio import AsyncSession

from agent.infrastructure.database import get_session
from agent.memory.notes import MemoryNotes
from agent.server_auth import UserProfile, get_current_user

router = APIRouter(prefix='/api/v1/memories', tags=['memory'])


class NoteInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


@router.get('')
async def list_notes(user: UserProfile = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return {'memories': await MemoryNotes(session).list(user.user_id)}


@router.post('', status_code=201)
async def create_note(body: NoteInput, user: UserProfile = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    try:
        return await MemoryNotes(session).create(user.user_id, body.content)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete('/{note_id}')
async def delete_note(note_id: UUID, user: UserProfile = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    if not await MemoryNotes(session).delete(user.user_id, str(note_id)):
        raise HTTPException(status_code=404, detail='Note not found')
    return {'deleted': True}
