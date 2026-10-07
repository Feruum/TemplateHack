from typing import List, Tuple
from functools import lru_cache

import httpx
import structlog
from langchain_core.documents import Document

from agent.config.settings import settings
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)
logger = structlog.get_logger(__name__)


class Reranker:
    def __init__(self):
        self.model = settings.rerank_model
        self.api_key = settings.rerank_api_key
        self.base_url = (settings.rerank_base_url or settings.llm_base_url).rstrip("/")
        self.top_n = settings.retrieval_top_k_after_rerank

    def rerank(
        self,
        query: str,
        documents: List[Document],
        top_k: int | None = None,
    ) -> List[Tuple[Document, float]]:
        if not documents:
            return []

        with tracer.start_as_current_span("rerank") as span:
            span.set_attribute("num_documents", len(documents))
            span.set_attribute("query_length", len(query))

            passages = [doc.page_content for doc in documents]
            effective_top = top_k or self.top_n

            try:
                payload = {
                    "model": self.model,
                    "query": query,
                    "documents": passages,
                    "top_n": effective_top,
                }
                headers: dict[str, str] = {}
                if self.api_key:
                    headers["Authorization"] = f"Bearer {self.api_key}"

                with httpx.Client(timeout=30.0) as client:
                    resp = client.post(
                        f"{self.base_url}/rerank",
                        json=payload,
                        headers=headers,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    results = data.get("results", [])

                    doc_scores: list[tuple[Document, float]] = []
                    for r in results:
                        idx = r.get("index")
                        score = r.get("relevance_score", 0.0)
                        if isinstance(idx, int) and 0 <= idx < len(documents):
                            doc_scores.append((documents[idx], float(score)))

                    doc_scores.sort(key=lambda x: x[1], reverse=True)

                    if top_k is not None:
                        doc_scores = doc_scores[:top_k]

                    span.set_attribute(
                        "top_score", doc_scores[0][1] if doc_scores else 0.0
                    )
                    return doc_scores
            except Exception as e:
                logger.warning("rerank_failed_fail_open", error=str(e))
                # Fail-open per spec: return docs[:top_k]
                k = top_k or self.top_n or len(documents)
                return [(doc, 0.0) for doc in documents[:k]]


@lru_cache(maxsize=1)
def get_reranker() -> Reranker:
    return Reranker()


def rerank_documents(
    query: str,
    documents: List[Document],
    top_k: int | None = None,
) -> List[Document]:
    results = get_reranker().rerank(query, documents, top_k)
    return [doc for doc, _ in results]
