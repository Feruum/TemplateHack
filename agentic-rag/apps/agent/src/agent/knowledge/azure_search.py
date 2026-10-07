"""Azure AI Search hybrid vector/BM25/RRF/semantic KnowledgeIndex."""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any

from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    HnswAlgorithmConfiguration,
    SearchableField,
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SemanticConfiguration,
    SemanticField,
    SemanticPrioritizedFields,
    SemanticSearch,
    SimpleField,
    VectorSearch,
    VectorSearchProfile,
)
from azure.search.documents.models import VectorizedQuery
from langchain_core.documents import Document

from agent.config.settings import settings
from agent.knowledge.base import KnowledgeStats
from agent.memory.store import get_embeddings


def _odata_literal(value: str) -> str:
    return value.replace("'", "''")


class AzureSearchKnowledgeIndex:
    def __init__(self) -> None:
        if not settings.azure_search_endpoint:
            raise RuntimeError("AGENT_AZURE_SEARCH_ENDPOINT is required")
        self._credential = DefaultAzureCredential(
            managed_identity_client_id=settings.azure_client_id or None,
            exclude_interactive_browser_credential=True,
        )
        self._client = SearchClient(
            endpoint=settings.azure_search_endpoint,
            index_name=settings.azure_search_index,
            credential=self._credential,
        )
        self._embeddings = get_embeddings()

    def search(
        self,
        query: str,
        k: int = 50,
        filter: dict[str, Any] | None = None,
        sparse_query: str | None = None,
    ) -> list[Document]:
        vector = self._embeddings.embed_query(query)
        vector_query = VectorizedQuery(
            vector=vector,
            k_nearest_neighbors=max(k, 50),
            fields="content_vector",
        )
        odata_filter = None
        if filter and filter.get("source"):
            odata_filter = f"source eq '{_odata_literal(str(filter['source']))}'"
        results = self._client.search(
            search_text=sparse_query or query,
            vector_queries=[vector_query],
            query_type="semantic",
            semantic_configuration_name=settings.azure_search_semantic_configuration,
            filter=odata_filter,
            select=["id", "document_id", "content", "source", "metadata_json"],
            top=k,
        )
        documents: list[Document] = []
        for result in results:
            metadata = json.loads(result.get("metadata_json") or "{}")
            metadata.update(
                {
                    "id": result.get("document_id") or result["id"],
                    "source": result.get("source") or "unknown",
                    "search_score": result.get("@search.score"),
                    "reranker_score": result.get("@search.reranker_score"),
                }
            )
            documents.append(
                Document(page_content=result.get("content") or "", metadata=metadata)
            )
        return documents

    def add_documents(
        self, documents: list[Document], ids: list[str] | None = None
    ) -> None:
        document_ids = ids or [
            sha256(
                f"{document.metadata.get('source', '')}\0{document.page_content}".encode()
            ).hexdigest()
            for document in documents
        ]
        vectors = self._embeddings.embed_documents(
            [document.page_content for document in documents]
        )
        actions = []
        for document_id, document, vector in zip(
            document_ids, documents, vectors, strict=True
        ):
            source = str(document.metadata.get("source") or "unknown")
            actions.append(
                {
                    "id": sha256(document_id.encode()).hexdigest(),
                    "document_id": document_id,
                    "content": document.page_content,
                    "source": source,
                    "metadata_json": json.dumps(
                        document.metadata, ensure_ascii=False, default=str
                    ),
                    "content_vector": vector,
                }
            )
        for offset in range(0, len(actions), 500):
            results = self._client.upload_documents(actions[offset : offset + 500])
            failures = [
                result.error_message for result in results if not result.succeeded
            ]
            if failures:
                raise RuntimeError(f"Azure AI Search indexing failed: {failures[0]}")

    def list_sources(self) -> list[str]:
        results = self._client.search(
            search_text="*", facets=["source,count:0"], select=["id"], top=0
        )
        facets = results.get_facets() or {}
        return sorted(str(facet["value"]) for facet in facets.get("source", []))

    def delete_source(self, source: str) -> None:
        results = self._client.search(
            search_text="*",
            filter=f"source eq '{_odata_literal(source)}'",
            select=["id"],
            top=1000,
        )
        keys = [{"id": result["id"]} for result in results]
        if keys:
            outcomes = self._client.delete_documents(keys)
            failures = [
                outcome.error_message for outcome in outcomes if not outcome.succeeded
            ]
            if failures:
                raise RuntimeError(f"Azure AI Search deletion failed: {failures[0]}")

    def stats(self) -> KnowledgeStats:
        results = self._client.search(search_text="*", include_total_count=True, top=0)
        return KnowledgeStats(
            backend="azure_search",
            index_name=settings.azure_search_index,
            document_count=results.get_count() or 0,
            sources=self.list_sources(),
        )

    def healthcheck(self) -> None:
        self._client.search(search_text="*", select=["id"], top=1).get_count()


def ensure_azure_search_index() -> None:
    credential = DefaultAzureCredential(
        managed_identity_client_id=settings.azure_client_id or None,
        exclude_interactive_browser_credential=True,
    )
    index_client = SearchIndexClient(
        endpoint=settings.azure_search_endpoint, credential=credential
    )
    vector_profile = "deimos-hnsw-profile"
    vector_algorithm = "deimos-hnsw"
    index = SearchIndex(
        name=settings.azure_search_index,
        fields=[
            SimpleField(name="id", type=SearchFieldDataType.String, key=True),
            SimpleField(
                name="document_id", type=SearchFieldDataType.String, filterable=True
            ),
            SearchableField(name="content", type=SearchFieldDataType.String),
            SearchableField(
                name="source",
                type=SearchFieldDataType.String,
                filterable=True,
                facetable=True,
            ),
            SimpleField(name="metadata_json", type=SearchFieldDataType.String),
            SearchField(
                name="content_vector",
                type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                searchable=True,
                vector_search_dimensions=settings.embedding_dimensions,
                vector_search_profile_name=vector_profile,
            ),
        ],
        vector_search=VectorSearch(
            algorithms=[HnswAlgorithmConfiguration(name=vector_algorithm)],
            profiles=[
                VectorSearchProfile(
                    name=vector_profile,
                    algorithm_configuration_name=vector_algorithm,
                )
            ],
        ),
        semantic_search=SemanticSearch(
            default_configuration_name=settings.azure_search_semantic_configuration,
            configurations=[
                SemanticConfiguration(
                    name=settings.azure_search_semantic_configuration,
                    prioritized_fields=SemanticPrioritizedFields(
                        content_fields=[SemanticField(field_name="content")],
                        keywords_fields=[SemanticField(field_name="source")],
                    ),
                )
            ],
        ),
    )
    index_client.create_or_update_index(index)
