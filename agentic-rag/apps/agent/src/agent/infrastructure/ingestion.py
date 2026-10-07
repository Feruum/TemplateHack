"""Durable Blob + Service Bus document ingestion pipeline."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from hashlib import sha256
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Protocol
import uuid

from azure.identity.aio import DefaultAzureCredential
from azure.servicebus import ServiceBusMessage
from azure.servicebus.aio import ServiceBusClient
from azure.storage.blob import ContentSettings
from azure.storage.blob.aio import BlobServiceClient
from opentelemetry.propagate import inject
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from agent.config.settings import settings
from agent.infrastructure.database import DocumentModel, async_session
from agent.loaders import aingest_pdf, aingest_text
from agent.utils import get_logger

logger = get_logger(__name__)
SUPPORTED_SUFFIXES = {".pdf", ".txt"}
SUPPORTED_CONTENT_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".txt": {"text/plain", "application/octet-stream"},
}


class IngestionValidationError(ValueError):
    """A stable, client-correctable ingestion error."""

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


class IngestionBackend(Protocol):
    async def upload(
        self, blob_name: str, content: bytes, content_type: str, content_hash: str
    ) -> None: ...

    async def download(self, blob_name: str) -> bytes: ...

    async def delete(self, blob_name: str) -> None: ...

    async def publish(self, payload: dict[str, str]) -> None: ...


class AzureIngestionBackend:
    def _credential(self) -> DefaultAzureCredential:
        return DefaultAzureCredential(
            managed_identity_client_id=settings.azure_client_id or None,
            exclude_interactive_browser_credential=True,
        )

    async def upload(
        self, blob_name: str, content: bytes, content_type: str, content_hash: str
    ) -> None:
        credential = self._credential()
        service = BlobServiceClient(settings.blob_account_url, credential=credential)
        try:
            blob = service.get_blob_client(settings.blob_document_container, blob_name)
            await blob.upload_blob(
                content,
                overwrite=False,
                metadata={"sha256": content_hash},
                content_settings=ContentSettings(content_type=content_type),
            )
        finally:
            await service.close()
            await credential.close()

    async def download(self, blob_name: str) -> bytes:
        credential = self._credential()
        service = BlobServiceClient(settings.blob_account_url, credential=credential)
        try:
            blob = service.get_blob_client(settings.blob_document_container, blob_name)
            stream = await blob.download_blob(max_concurrency=2)
            return await stream.readall()
        finally:
            await service.close()
            await credential.close()

    async def delete(self, blob_name: str) -> None:
        credential = self._credential()
        service = BlobServiceClient(settings.blob_account_url, credential=credential)
        try:
            blob = service.get_blob_client(settings.blob_document_container, blob_name)
            await blob.delete_blob(delete_snapshots="include")
        finally:
            await service.close()
            await credential.close()

    async def publish(self, payload: dict[str, str]) -> None:
        credential = self._credential()
        client = ServiceBusClient(
            settings.service_bus_fully_qualified_namespace,
            credential=credential,
        )
        carrier: dict[str, str] = {}
        inject(carrier)
        message = ServiceBusMessage(
            json.dumps(payload, separators=(",", ":")),
            message_id=payload["job_id"],
            correlation_id=payload["document_id"],
            content_type="application/json",
            application_properties={
                key: value for key, value in carrier.items() if isinstance(value, str)
            },
        )
        try:
            async with client:
                sender = client.get_queue_sender(queue_name=settings.ingestion_queue)
                async with sender:
                    await sender.send_messages(message)
        finally:
            await credential.close()


class LocalIngestionBackend:
    """Development-only substitute with the same state transitions."""

    def __init__(self) -> None:
        self._root = Path(settings.upload_dir).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, blob_name: str) -> Path:
        path = (self._root / blob_name).resolve()
        if self._root not in path.parents:
            raise IngestionValidationError("INVALID_BLOB_PATH", "Invalid blob path")
        return path

    async def upload(
        self, blob_name: str, content: bytes, content_type: str, content_hash: str
    ) -> None:
        del content_type, content_hash
        path = self._path(blob_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, content)

    async def download(self, blob_name: str) -> bytes:
        return await asyncio.to_thread(self._path(blob_name).read_bytes)

    async def delete(self, blob_name: str) -> None:
        path = self._path(blob_name)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    async def publish(self, payload: dict[str, str]) -> None:
        asyncio.create_task(process_ingestion_job(payload, self))


@lru_cache(maxsize=1)
def get_ingestion_backend() -> IngestionBackend:
    if settings.environment == "development":
        return LocalIngestionBackend()
    return AzureIngestionBackend()


def _safe_filename(filename: str) -> str:
    normalized = Path(filename).name.strip()
    if not normalized or normalized in {".", ".."}:
        raise IngestionValidationError("INVALID_FILENAME", "A filename is required")
    if len(normalized.encode("utf-8")) > 255:
        raise IngestionValidationError("INVALID_FILENAME", "Filename is too long")
    return normalized


def validate_document(
    filename: str, content_type: str, content: bytes
) -> tuple[str, str]:
    safe_name = _safe_filename(filename)
    suffix = Path(safe_name).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise IngestionValidationError(
            "UNSUPPORTED_FILE_TYPE", "Only PDF and plain-text files are supported"
        )
    if len(content) == 0:
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


async def enqueue_document(
    *, filename: str, content_type: str, content: bytes, owner_id: str
) -> IngestionJob:
    safe_name, normalized_type = validate_document(filename, content_type, content)
    content_hash = sha256(content).hexdigest()
    idempotency_key = sha256(f"{owner_id}\0{content_hash}".encode()).hexdigest()
    now = datetime.now(UTC)

    async with async_session() as session:
        existing = await session.scalar(
            select(DocumentModel).where(
                DocumentModel.idempotency_key == idempotency_key
            )
        )
        if existing is not None:
            return _job_from_model(existing)

        document_id = uuid.uuid4()
        job_id = uuid.uuid4()
        blob_name = f"{document_id}/{safe_name}"
        document = DocumentModel(
            id=document_id,
            job_id=job_id,
            owner_id=owner_id,
            idempotency_key=idempotency_key,
            filename=safe_name,
            status="PENDING",
            content_hash=content_hash,
            content_type=normalized_type,
            blob_name=blob_name,
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
                select(DocumentModel).where(
                    DocumentModel.idempotency_key == idempotency_key
                )
            )
            if existing is None:
                raise
            return _job_from_model(existing)

    backend = get_ingestion_backend()
    try:
        await backend.upload(blob_name, content, normalized_type, content_hash)
        async with async_session() as session:
            document = await session.get(DocumentModel, document_id)
            if document is None:
                raise RuntimeError("Document record disappeared during enqueue")
            document.status = "QUEUED"
            document.progress = 5
            document.updated_at = datetime.now(UTC)
            await session.commit()
        await backend.publish(
            {
                "document_id": str(document_id),
                "job_id": str(job_id),
                "blob_name": blob_name,
                "filename": safe_name,
                "content_type": normalized_type,
                "content_hash": content_hash,
            }
        )
        async with async_session() as session:
            document = await session.get(DocumentModel, document_id)
            if document is None:
                raise RuntimeError("Document record disappeared after enqueue")
            return _job_from_model(document)
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


async def process_ingestion_job(
    payload: dict[str, str], backend: IngestionBackend | None = None
) -> None:
    backend = backend or get_ingestion_backend()
    document_id = uuid.UUID(payload["document_id"])

    async with async_session() as session:
        document = await session.get(DocumentModel, document_id, with_for_update=True)
        if document is None:
            raise IngestionValidationError("DOCUMENT_NOT_FOUND", "Document was deleted")
        if document.status == "COMPLETED":
            return
        if document.status in {"DELETING", "DELETED"}:
            raise IngestionValidationError("DOCUMENT_DELETED", "Document was deleted")
        document.status = "PROCESSING"
        document.progress = 10
        document.attempt_count = (document.attempt_count or 0) + 1
        document.started_at = document.started_at or datetime.now(UTC)
        document.updated_at = datetime.now(UTC)
        await session.commit()

    try:
        content = await backend.download(payload["blob_name"])
        if sha256(content).hexdigest() != payload["content_hash"]:
            raise IngestionValidationError(
                "CONTENT_HASH_MISMATCH", "Stored document failed integrity validation"
            )

        suffix = Path(payload["filename"]).suffix.lower()
        with NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            temporary.write(content)
            temporary_path = temporary.name
        try:
            if suffix == ".pdf":
                chunks = await aingest_pdf(
                    temporary_path, source_name=payload["filename"]
                )
            else:
                chunks = await aingest_text(
                    temporary_path, source_name=payload["filename"]
                )
        finally:
            Path(temporary_path).unlink(missing_ok=True)

        async with async_session() as session:
            document = await session.get(
                DocumentModel, document_id, with_for_update=True
            )
            if document is None:
                raise IngestionValidationError(
                    "DOCUMENT_NOT_FOUND", "Document was deleted"
                )
            document.status = "COMPLETED"
            document.progress = 100
            document.completed_at = datetime.now(UTC)
            document.updated_at = datetime.now(UTC)
            document.error_code = None
            document.error_message = None
            document.metadata_json = {"chunks": chunks}
            await session.commit()
    except Exception as error:
        logger.exception("document_ingestion_failed", document_id=str(document_id))
        async with async_session() as session:
            document = await session.get(
                DocumentModel, document_id, with_for_update=True
            )
            if document is not None:
                document.status = "FAILED"
                document.error_code = getattr(error, "code", "INGESTION_FAILED")
                document.error_message = "Document ingestion failed"
                document.updated_at = datetime.now(UTC)
                await session.commit()
        raise


@asynccontextmanager
async def _service_bus_client() -> AsyncIterator[ServiceBusClient]:
    credential = DefaultAzureCredential(
        managed_identity_client_id=settings.azure_client_id or None,
        exclude_interactive_browser_credential=True,
    )
    client = ServiceBusClient(
        settings.service_bus_fully_qualified_namespace,
        credential=credential,
    )
    try:
        async with client:
            yield client
    finally:
        await credential.close()


async def run_ingestion_worker() -> None:
    backend = AzureIngestionBackend()
    async with _service_bus_client() as client:
        receiver = client.get_queue_receiver(
            queue_name=settings.ingestion_queue,
            max_wait_time=30,
            prefetch_count=1,
        )
        async with receiver:
            async for message in receiver:
                try:
                    payload = json.loads(str(message))
                    await process_ingestion_job(payload, backend)
                    await receiver.complete_message(message)
                except IngestionValidationError as error:
                    await receiver.dead_letter_message(
                        message,
                        reason=error.code,
                        error_description=str(error)[:4096],
                    )
                except Exception:
                    if message.delivery_count >= settings.ingestion_max_delivery_count:
                        await receiver.dead_letter_message(
                            message,
                            reason="MAX_DELIVERY_COUNT",
                            error_description="Document ingestion exhausted retries",
                        )
                    else:
                        await receiver.abandon_message(message)


def main() -> None:
    asyncio.run(run_ingestion_worker())


__all__ = [
    "IngestionBackend",
    "IngestionJob",
    "IngestionValidationError",
    "enqueue_document",
    "get_ingestion_backend",
    "main",
    "process_ingestion_job",
    "run_ingestion_worker",
    "validate_document",
]
