"""Thread-safe in-memory KnowledgeIndex for tests and local development."""

from __future__ import annotations

from threading import RLock
from typing import Any
import uuid

from langchain_core.documents import Document

from agent.knowledge.base import KnowledgeStats


class MemoryKnowledgeIndex:
    def __init__(self) -> None:
        self._documents: dict[str, Document] = {}
        self._lock = RLock()

    def search(
        self,
        query: str,
        k: int = 50,
        filter: dict[str, Any] | None = None,
        sparse_query: str | None = None,
    ) -> list[Document]:
        terms = {term.casefold() for term in (sparse_query or query).split() if term}
        with self._lock:
            candidates = list(self._documents.values())
        if filter and "source" in filter:
            candidates = [
                document
                for document in candidates
                if document.metadata.get("source") == filter["source"]
            ]
        ranked = sorted(
            candidates,
            key=lambda document: sum(
                document.page_content.casefold().count(term) for term in terms
            ),
            reverse=True,
        )
        return ranked[:k]

    def add_documents(
        self, documents: list[Document], ids: list[str] | None = None
    ) -> None:
        document_ids = ids or [str(uuid.uuid4()) for _ in documents]
        with self._lock:
            for document_id, document in zip(document_ids, documents, strict=True):
                metadata = {**document.metadata, "id": document_id}
                self._documents[document_id] = Document(
                    page_content=document.page_content, metadata=metadata
                )

    def list_sources(self) -> list[str]:
        with self._lock:
            return sorted(
                {
                    str(document.metadata["source"])
                    for document in self._documents.values()
                    if document.metadata.get("source")
                }
            )

    def delete_source(self, source: str) -> None:
        with self._lock:
            self._documents = {
                document_id: document
                for document_id, document in self._documents.items()
                if document.metadata.get("source") != source
            }

    def stats(self) -> KnowledgeStats:
        with self._lock:
            count = len(self._documents)
        return KnowledgeStats(
            backend="memory",
            index_name="memory",
            document_count=count,
            sources=self.list_sources(),
        )

    def healthcheck(self) -> None:
        return None
