"""Development-only Chroma KnowledgeIndex adapter."""

from typing import Any
import uuid

from langchain_core.documents import Document
import structlog

from agent.config.settings import settings
from agent.knowledge.base import KnowledgeStats
from agent.memory.store import get_chroma_client, get_vector_store
from agent.retrieval.ranking import fuse_rankings, keyword_rank

logger = structlog.get_logger(__name__)


class ChromaKnowledgeIndex:
    def __init__(self) -> None:
        if settings.environment != "development":
            raise RuntimeError("Chroma is prohibited outside development")
        self._store = get_vector_store()

    def search(
        self,
        query: str,
        k: int = 50,
        filter: dict[str, Any] | None = None,
        sparse_query: str | None = None,
    ) -> list[Document]:
        candidate_count = max(k, settings.retrieval_top_k_initial) if sparse_query else k
        dense = self._store.similarity_search(query, k=candidate_count, filter=filter)
        if not sparse_query:
            return dense[:k]
        records = self._store._collection.get(
            where=filter,
            include=['documents', 'metadatas'],
            limit=settings.retrieval_lexical_max_chunks + 1,
        )
        if len(records['ids']) > settings.retrieval_lexical_max_chunks:
            logger.warning('lexical_corpus_limit', limit=settings.retrieval_lexical_max_chunks)
            return dense[:k]
        candidates = [
            Document(id=chunk_id, page_content=content or '', metadata=metadata or {})
            for chunk_id, content, metadata in zip(records['ids'], records['documents'], records['metadatas'])
        ]
        lexical = keyword_rank(candidates, sparse_query, candidate_count)
        return fuse_rankings([dense, lexical], k)

    def add_documents(
        self, documents: list[Document], ids: list[str] | None = None
    ) -> None:
        self._store.add_documents(
            documents, ids=ids or [str(uuid.uuid4()) for _ in documents]
        )

    def list_sources(self) -> list[str]:
        results = self._store._collection.get(include=["metadatas"])
        return sorted(
            {
                str(metadata["source"])
                for metadata in results.get("metadatas", [])
                if metadata and metadata.get("source")
            }
        )

    def delete_source(self, source: str) -> None:
        self._store._collection.delete(where={"source": source})

    def delete_document(self, document_id: str, owner_id: str) -> None:
        self._store._collection.delete(
            where={
                "$and": [
                    {"document_id": document_id},
                    {"owner_id": owner_id},
                ]
            }
        )

    def stats(self) -> KnowledgeStats:
        return KnowledgeStats(
            backend="chroma",
            index_name=settings.chroma_collection_name,
            document_count=self._store._collection.count(),
            sources=self.list_sources(),
        )

    def healthcheck(self) -> None:
        get_chroma_client().heartbeat()
