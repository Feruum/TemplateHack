"""Private local file storage and durable PDF/TXT ingestion jobs."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from agent.config.settings import settings
from agent.infrastructure.database import DocumentModel, async_session
from agent.loaders import aingest_pdf, aingest_text
from agent.knowledge import get_knowledge_index
from agent.utils import get_logger

logger = get_logger(__name__)
SUPPORTED_SUFFIXES = {".pdf", ".txt"}
SUPPORTED_CONTENT_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".txt": {"text/plain", "application/octet-stream"},
}
_background_tasks: set[asyncio.Task] = set()


def _ingestion_task_done(task: asyncio.Task) -> None:
    _background_tasks.discard(task)
    if task.cancelled():
        return
    error = task.exception()
    if error:
        logger.error("local_ingestion_task_failed", error=str(error))


class IngestionValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class IngestionJob:
    id: str
    job_id: str
    filename: str
    status: str
    content_hash: str
    progress: int
    created_at: datetime
    updated_at: datetime
    error_code: str | None = None
    error_message: str | None = None


class LocalIngestionBackend:
    """Store uploaded files beneath the configured persistent volume."""

    def __init__(self) -> None:
        self.root = Path(settings.upload_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, blob_name: str) -> Path:
        result = (self.root / blob_name).resolve()
        if self.root not in result.parents:
            raise IngestionValidationError("INVALID_BLOB_PATH", "Invalid file path")
        return result

    async def upload(self, blob_name: str, content: bytes) -> None:
        path = self.path(blob_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, content)

    async def download(self, blob_name: str) -> bytes:
        return await asyncio.to_thread(self.path(blob_name).read_bytes)

    async def delete(self, blob_name: str | None) -> None:
        if not blob_name:
            return
        path = self.path(blob_name)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    async def publish(self, payload: dict[str, str]) -> None:
        task = asyncio.create_task(process_ingestion_job(payload, self))
        _background_tasks.add(task)
        task.add_done_callback(_ingestion_task_done)


@lru_cache(maxsize=1)
def get_ingestion_backend() -> LocalIngestionBackend:
    return LocalIngestionBackend()


def _safe_filename(filename: str) -> str:
    normalized = Path(filename.replace("\\", "/")).name.strip()
    if not normalized or normalized in {".", ".."}:
        raise IngestionValidationError("INVALID_FILENAME", "A filename is required")
    if any(ord(character) < 32 for character in normalized):
        raise IngestionValidationError("INVALID_FILENAME", "Filename contains control characters")
    if len(normalized.encode("utf-8")) > 255:
        raise IngestionValidationError("INVALID_FILENAME", "Filename is too long")
    return normalized


def validate_document(filename: str, content_type: str, content: bytes) -> tuple[str, str]:
    safe_name = _safe_filename(filename)
    suffix = Path(safe_name).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise IngestionValidationError(
            "UNSUPPORTED_FILE_TYPE", "Only PDF and plain-text files are supported"
        )
    if not content:
        raise IngestionValidationError("EMPTY_FILE", "Uploaded file is empty")
    if len(content) > settings.ingestion_max_file_bytes:
        raise IngestionValidationError(
            "FILE_TOO_LARGE",
            f"File exceeds the {settings.ingestion_max_file_bytes}-byte limit",
        )
    normalized_type = (content_type or "application/octet-stream").split(";", 1)[0]
    if normalized_type not in SUPPORTED_CONTENT_TYPES[suffix]:
        raise IngestionValidationError(
            "CONTENT_TYPE_MISMATCH", "Content type does not match the filename"
        )
    if suffix == ".pdf" and not content.startswith(b"%PDF-"):
        raise IngestionValidationError("INVALID_PDF", "File is not a valid PDF")
    if suffix == ".txt" and b"\x00" in content[:4096]:
        raise IngestionValidationError("INVALID_TEXT", "Text file contains binary data")
    return safe_name, normalized_type


def _job_from_model(document: DocumentModel) -> IngestionJob:
    return IngestionJob(
        id=str(document.id),
        job_id=str(document.job_id or document.id),
        filename=document.filename,
        status=document.status,
        content_hash=document.content_hash or "",
        progress=document.progress or 0,
        created_at=document.created_at,
        updated_at=document.updated_at,
        error_code=document.error_code,
        error_message=document.error_message,
    )


def _payload_for(document: DocumentModel) -> dict[str, str]:
    if not document.owner_id or not document.blob_name or not document.content_hash:
        raise IngestionValidationError("INVALID_DOCUMENT_STATE", "Document metadata is incomplete")
    return {
        "document_id": str(document.id),
        "job_id": str(document.job_id or document.id),
        "owner_id": document.owner_id,
        "blob_name": document.blob_name,
        "filename": document.filename,
        "content_hash": document.content_hash,
    }


async def enqueue_document(
    *, filename: str, content_type: str, content: bytes, owner_id: str
) -> IngestionJob:
    safe_name, normalized_type = validate_document(filename, content_type, content)
    content_hash = sha256(content).hexdigest()
    idempotency_key = sha256(f"{owner_id}\0{content_hash}".encode()).hexdigest()
    now = datetime.now(UTC)
    document_id, job_id = uuid.uuid4(), uuid.uuid4()

    async with async_session() as session:
        existing = await session.scalar(
            select(DocumentModel).where(DocumentModel.idempotency_key == idempotency_key)
        )
        if existing is not None:
            if existing.status == "FAILED":
                if not existing.blob_name:
                    existing.blob_name = f"{existing.id}/{existing.filename}"
                await get_ingestion_backend().upload(existing.blob_name, content)
                existing.status = "QUEUED"
                existing.progress = 5
                existing.error_code = None
                existing.error_message = None
                existing.updated_at = datetime.now(UTC)
                await session.commit()
                await get_ingestion_backend().publish(_payload_for(existing))
            elif existing.status in {"PENDING", "QUEUED", "PROCESSING"}:
                await get_ingestion_backend().publish(_payload_for(existing))
            return _job_from_model(existing)

        document = DocumentModel(
            id=document_id,
            job_id=job_id,
            owner_id=owner_id,
            idempotency_key=idempotency_key,
            filename=safe_name,
            status="PENDING",
            content_hash=content_hash,
            content_type=normalized_type,
            blob_name=f"{document_id}/{safe_name}",
            progress=0,
            created_at=now,
            updated_at=now,
            metadata_json={},
        )
        session.add(document)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            existing = await session.scalar(
                select(DocumentModel).where(DocumentModel.idempotency_key == idempotency_key)
            )
            if existing is None:
                raise
            return _job_from_model(existing)

    backend = get_ingestion_backend()
    try:
        await backend.upload(f"{document_id}/{safe_name}", content)
        async with async_session() as session:
            document = await session.get(DocumentModel, document_id)
            if document is None:
                raise RuntimeError("Document record disappeared during upload")
            document.status = "QUEUED"
            document.progress = 5
            document.updated_at = datetime.now(UTC)
            payload = _payload_for(document)
            await session.commit()
        await backend.publish(payload)
    except Exception:
        logger.exception("document_enqueue_failed", document_id=str(document_id))
        async with async_session() as session:
            document = await session.get(DocumentModel, document_id)
            if document is not None:
                document.status = "FAILED"
                document.error_code = "ENQUEUE_FAILED"
                document.error_message = "The ingestion job could not be queued"
                document.updated_at = datetime.now(UTC)
                await session.commit()
        raise

    async with async_session() as session:
        document = await session.get(DocumentModel, document_id)
        return _job_from_model(document)


async def process_ingestion_job(
    payload: dict[str, str], backend: LocalIngestionBackend | None = None
) -> None:
    backend = backend or get_ingestion_backend()
    document_id = uuid.UUID(payload["document_id"])
    async with async_session() as session:
        document = await session.get(DocumentModel, document_id, with_for_update=True)
        if document is None or document.status in {"DELETING", "DELETED"}:
            return
        if document.status == "COMPLETED":
            return
        actual = _payload_for(document)
        if actual["owner_id"] != payload.get("owner_id"):
            raise IngestionValidationError("OWNER_MISMATCH", "Document owner changed")
        document.status = "PROCESSING"
        document.progress = 10
        document.attempt_count = (document.attempt_count or 0) + 1
        document.started_at = document.started_at or datetime.now(UTC)
        document.updated_at = datetime.now(UTC)
        await session.commit()

    try:
        content = await backend.download(payload["blob_name"])
        if sha256(content).hexdigest() != payload["content_hash"]:
            raise IngestionValidationError("CONTENT_HASH_MISMATCH", "Stored file failed integrity validation")
        suffix = Path(payload["filename"]).suffix.lower()
        with NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            temporary.write(content)
            temporary_path = temporary.name
        try:
            owner_id = payload["owner_id"]
            doc_id = payload["document_id"]
            if suffix == ".pdf":
                chunks = await aingest_pdf(
                    temporary_path,
                    source_name=payload["filename"],
                    owner_id=owner_id,
                    document_id=doc_id,
                )
            elif suffix == ".txt":
                chunks = await aingest_text(
                    temporary_path,
                    source_name=payload["filename"],
                    owner_id=owner_id,
                    document_id=doc_id,
                )
            else:
                raise IngestionValidationError("UNSUPPORTED_FILE_TYPE", "Unsupported file type")
        finally:
            Path(temporary_path).unlink(missing_ok=True)

        delete_during_ingestion = False
        delete_owner_id = payload["owner_id"]
        delete_blob_name: str | None = None
        async with async_session() as session:
            document = await session.get(DocumentModel, document_id, with_for_update=True)
            if document is not None:
                if document.status in {"DELETING", "DELETED"}:
                    delete_during_ingestion = True
                    delete_owner_id = document.owner_id or payload["owner_id"]
                    delete_blob_name = document.blob_name
                else:
                    document.status = "COMPLETED"
                    document.progress = 100
                    document.completed_at = datetime.now(UTC)
                    document.updated_at = datetime.now(UTC)
                    document.error_code = None
                    document.error_message = None
                    document.metadata_json = {"chunks": chunks}
                    await session.commit()
        if delete_during_ingestion:
            await asyncio.to_thread(
                get_knowledge_index().delete_document,
                str(document_id),
                delete_owner_id,
            )
            await backend.delete(delete_blob_name)
            return
    except Exception as error:
        logger.exception("document_ingestion_failed", document_id=str(document_id))
        async with async_session() as session:
            document = await session.get(DocumentModel, document_id, with_for_update=True)
            if document is not None and document.status not in {"DELETING", "DELETED"}:
                document.status = "FAILED"
                document.error_code = getattr(error, "code", "INGESTION_FAILED")
                document.error_message = "Document ingestion failed"
                document.updated_at = datetime.now(UTC)
                await session.commit()
        raise


async def resume_ingestion_jobs() -> None:
    """Re-enqueue unfinished local jobs after a service restart."""
    async with async_session() as session:
        documents = (
            await session.scalars(
                select(DocumentModel).where(
                    DocumentModel.status.in_(["PENDING", "QUEUED", "PROCESSING"])
                )
            )
        ).all()
    for document in documents:
        try:
            await get_ingestion_backend().publish(_payload_for(document))
        except Exception:
            logger.exception("document_resume_failed", document_id=str(document.id))


async def run_ingestion_worker() -> None:
    await resume_ingestion_jobs()
    while True:
        await asyncio.sleep(1)


def main() -> None:
    asyncio.run(run_ingestion_worker())


__all__ = [
    "IngestionJob",
    "IngestionValidationError",
    "enqueue_document",
    "get_ingestion_backend",
    "main",
    "process_ingestion_job",
    "resume_ingestion_jobs",
    "run_ingestion_worker",
    "validate_document",
]
