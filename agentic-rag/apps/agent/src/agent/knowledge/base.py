"""Knowledge index contracts shared by production and hermetic substitutes."""

from dataclasses import dataclass
from typing import Any, Protocol

from langchain_core.documents import Document


@dataclass(frozen=True)
class KnowledgeStats:
    backend: str
    index_name: str
    document_count: int
    sources: list[str]


class KnowledgeIndex(Protocol):
    def search(
        self,
        query: str,
        k: int = 50,
        filter: dict[str, Any] | None = None,
        sparse_query: str | None = None,
    ) -> list[Document]: ...

    def add_documents(
        self, documents: list[Document], ids: list[str] | None = None
    ) -> None: ...

    def list_sources(self) -> list[str]: ...

    def delete_source(self, source: str) -> None: ...

    def stats(self) -> KnowledgeStats: ...

    def healthcheck(self) -> None: ...
