"""KnowledgeIndex factory."""

from functools import lru_cache

from agent.config.settings import settings
from agent.knowledge.base import KnowledgeIndex, KnowledgeStats


@lru_cache(maxsize=1)
def get_knowledge_index() -> KnowledgeIndex:
    if settings.knowledge_backend == "azure_search":
        from agent.knowledge.azure_search import AzureSearchKnowledgeIndex

        return AzureSearchKnowledgeIndex()
    if settings.knowledge_backend == "chroma":
        from agent.knowledge.chroma import ChromaKnowledgeIndex

        return ChromaKnowledgeIndex()

    from agent.knowledge.memory import MemoryKnowledgeIndex

    return MemoryKnowledgeIndex()


def ensure_index() -> None:
    if settings.knowledge_backend != "azure_search":
        return
    from agent.knowledge.azure_search import ensure_azure_search_index

    ensure_azure_search_index()


__all__ = ["KnowledgeIndex", "KnowledgeStats", "ensure_index", "get_knowledge_index"]
