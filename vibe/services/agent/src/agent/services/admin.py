from connectrpc.request import RequestContext
from google.protobuf.timestamp_pb2 import Timestamp
from sqlalchemy import func, select

import agent.gen.admin.v1.admin_pb2 as admin_pb2
from agent.gen.admin.v1.admin_connect import AdminService as AdminServiceProtocol
from agent.infrastructure.database import DocumentModel, async_session
from agent.infrastructure.ingestion import enqueue_document, get_ingestion_backend
from agent.knowledge import get_knowledge_index
from agent.utils import get_logger

logger = get_logger(__name__)


def _timestamp(value) -> Timestamp | None:
    if value is None:
        return None
    result = Timestamp()
    result.FromDatetime(value)
    return result


class AdminService(AdminServiceProtocol):
    async def list_documents(
        self, request: admin_pb2.ListDocumentsRequest, ctx: RequestContext
    ) -> admin_pb2.ListDocumentsResponse:
        async with async_session() as session:
            # Query
            stmt = select(DocumentModel).order_by(DocumentModel.created_at.desc())

            # Pagination
            page_size = request.page_size or 10
            page = request.page or 1
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)

            result = await session.execute(stmt)
            docs = result.scalars().all()

            # Total count
            count_stmt = select(func.count()).select_from(DocumentModel)
            count_result = await session.execute(count_stmt)
            total_count = count_result.scalar()

            response_docs = []
            for d in docs:
                response_docs.append(
                    admin_pb2.Document(
                        id=str(d.id),
                        filename=d.filename,
                        status=d.status,
                        created_at=_timestamp(d.created_at),
                        updated_at=_timestamp(d.updated_at),
                        metadata={
                            str(key): str(value)
                            for key, value in (d.metadata_json or {}).items()
                        },
                        job_id=str(d.job_id or d.id),
                        content_hash=d.content_hash or "",
                        progress=d.progress or 0,
                        started_at=_timestamp(d.started_at),
                        completed_at=_timestamp(d.completed_at),
                        error_code=d.error_code or "",
                        error_message=d.error_message or "",
                    )
                )

            return admin_pb2.ListDocumentsResponse(
                documents=response_docs, total_count=total_count
            )

    async def upload_document(
        self, request: admin_pb2.UploadDocumentRequest, ctx: RequestContext
    ) -> admin_pb2.UploadDocumentResponse:
        job = await enqueue_document(
            filename=request.filename,
            content_type=request.content_type,
            content=request.content,
            owner_id="internal-admin-service",
        )
        return admin_pb2.UploadDocumentResponse(
            id=job.id,
            status=job.status,
            job_id=job.job_id,
            content_hash=job.content_hash,
            progress=job.progress,
            created_at=_timestamp(job.created_at),
            updated_at=_timestamp(job.updated_at),
            error_code=job.error_code or "",
        )

    async def delete_document(
        self, request: admin_pb2.DeleteDocumentRequest, ctx: RequestContext
    ) -> admin_pb2.DeleteDocumentResponse:
        async with async_session() as session:
            doc = await session.get(DocumentModel, request.id)
            if doc:
                source_name = doc.filename
                blob_name = doc.blob_name
                await session.delete(doc)
                await session.commit()
                get_knowledge_index().delete_source(source_name)
                if blob_name:
                    await get_ingestion_backend().delete(blob_name)
                return admin_pb2.DeleteDocumentResponse(success=True)
            return admin_pb2.DeleteDocumentResponse(success=False)

    async def get_ingestion_status(
        self, request: admin_pb2.GetIngestionStatusRequest, ctx: RequestContext
    ) -> admin_pb2.GetIngestionStatusResponse:
        async with async_session() as session:
            doc = await session.get(DocumentModel, request.id)
            if doc:
                return admin_pb2.GetIngestionStatusResponse(
                    id=str(doc.id),
                    status=doc.status,
                    error_message=doc.error_message or "",
                    job_id=str(doc.job_id or doc.id),
                    content_hash=doc.content_hash or "",
                    progress=doc.progress or 0,
                    created_at=_timestamp(doc.created_at),
                    updated_at=_timestamp(doc.updated_at),
                    started_at=_timestamp(doc.started_at),
                    completed_at=_timestamp(doc.completed_at),
                    error_code=doc.error_code or "",
                )
            return admin_pb2.GetIngestionStatusResponse(
                id=request.id, status="NOT_FOUND"
            )
