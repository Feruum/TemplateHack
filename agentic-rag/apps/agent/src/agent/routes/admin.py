"""Authenticated document administration routes."""

import asyncio
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select

from agent.config.settings import settings
from agent.infrastructure.database import DocumentModel, async_session
from agent.infrastructure.ingestion import (
    IngestionValidationError,
    enqueue_document,
    get_ingestion_backend,
)
from agent.knowledge import get_knowledge_index
from agent.server_auth import UserProfile, get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


def _document_response(document: DocumentModel) -> dict[str, object]:
    return {
        "id": str(document.id),
        "job_id": str(document.job_id or document.id),
        "filename": document.filename,
        "status": document.status,
        "content_hash": document.content_hash,
        "progress": document.progress or 0,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
        "started_at": document.started_at,
        "completed_at": document.completed_at,
        "error_code": document.error_code,
        "error_message": document.error_message,
    }


@router.post("/ingest", status_code=202)
async def upload_file(
    file: UploadFile = File(...),
    user: UserProfile = Depends(get_current_user),
):
    """Store a private document and enqueue idempotent asynchronous ingestion."""
    content = await file.read(settings.ingestion_max_file_bytes + 1)
    try:
        job = await enqueue_document(
            filename=file.filename or "",
            content_type=file.content_type or "application/octet-stream",
            content=content,
            owner_id=user.user_id,
        )
    except IngestionValidationError as error:
        raise HTTPException(
            status_code=413 if error.code == "FILE_TOO_LARGE" else 400,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return {
        "id": job.id,
        "job_id": job.job_id,
        "filename": job.filename,
        "status": job.status,
        "content_hash": job.content_hash,
        "progress": job.progress,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "error_code": job.error_code,
        "error_message": job.error_message,
    }


@router.get("/documents")
async def get_documents(user: UserProfile = Depends(get_current_user)):
    """List durable document/job state visible to the authenticated owner."""
    async with async_session() as session:
        statement = (
            select(DocumentModel)
            .where(
                DocumentModel.owner_id == user.user_id,
                DocumentModel.status != "DELETED",
            )
            .order_by(DocumentModel.created_at.desc())
            .limit(200)
        )
        documents = (await session.scalars(statement)).all()
    return {"documents": [_document_response(document) for document in documents]}


@router.get("/documents/{document_id}")
async def get_document_status(
    document_id: UUID, user: UserProfile = Depends(get_current_user)
):
    async with async_session() as session:
        document = await session.get(DocumentModel, document_id)
        if document is None or document.owner_id != user.user_id:
            raise HTTPException(status_code=404, detail="Document not found")
        return _document_response(document)


@router.delete("/documents/{document_id}")
async def remove_document(
    document_id: UUID, user: UserProfile = Depends(get_current_user)
):
    """Tombstone durable state and remove private Blob and search chunks."""
    async with async_session() as session:
        document = await session.get(DocumentModel, document_id, with_for_update=True)
        if document is None or document.owner_id != user.user_id:
            raise HTTPException(status_code=404, detail="Document not found")
        if document.status == "DELETED":
            return {"status": "deleted", "id": str(document_id)}
        document.status = "DELETING"
        document.updated_at = datetime.now(UTC)
        source = document.filename
        blob_name = document.blob_name
        await session.commit()

    await asyncio.to_thread(get_knowledge_index().delete_source, source)
    if blob_name:
        await get_ingestion_backend().delete(blob_name)

    async with async_session() as session:
        document = await session.get(DocumentModel, document_id, with_for_update=True)
        if document is not None:
            document.status = "DELETED"
            document.progress = 100
            document.tombstoned_at = datetime.now(UTC)
            document.updated_at = datetime.now(UTC)
            await session.commit()
    return {"status": "deleted", "id": str(document_id), "source": source}
