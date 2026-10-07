"""Retrieval module for advanced RAG patterns.

This module provides:
- Hybrid search (BM25 + dense vectors with RRF fusion)
- Cross-encoder reranking
- Document grading
"""

from agent.retrieval.hybrid import HybridRetriever, hybrid_search
from agent.retrieval.reranker import Reranker, rerank_documents

__all__ = [
    "HybridRetriever",
    "hybrid_search",
    "Reranker",
    "rerank_documents",
]
