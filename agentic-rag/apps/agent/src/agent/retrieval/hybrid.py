"""Hybrid retrieval delegated to the configured KnowledgeIndex.

Azure AI Search executes vector and full-text queries in parallel and performs
RRF server-side. Local substitutes implement the same small contract.
"""

from functools import lru_cache
from typing import Any

from langchain_core.documents import Document

from agent.knowledge import get_knowledge_index
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)


@lru_cache(maxsize=8)
def get_hybrid_retriever(collection_name: str | None = None) -> "HybridRetriever":
    return HybridRetriever(collection_name=collection_name)


class HybridRetriever:
    def __init__(self, collection_name: str | None = None, rrf_k: int | None = None):
        self.collection_name = collection_name
        self.rrf_k = rrf_k
        self.index = get_knowledge_index()

    def search(
        self,
        query: str,
        k: int = 50,
        filter: dict[str, Any] | None = None,
        sparse_query: str | None = None,
    ) -> list[Document]:
        with tracer.start_as_current_span("hybrid_search") as span:
            span.set_attribute("query", query[:100])
            span.set_attribute("k", k)
            documents = self.index.search(
                query=query,
                k=k,
                filter=filter,
                sparse_query=sparse_query,
            )
            span.set_attribute("final_results", len(documents))
            return documents


def hybrid_search(
    query: str,
    k: int = 50,
    filter: dict[str, Any] | None = None,
    collection_name: str | None = None,
    sparse_query: str | None = None,
) -> list[Document]:
    return get_hybrid_retriever(collection_name=collection_name).search(
        query, k=k, filter=filter, sparse_query=sparse_query
    )
