from threading import Lock
from typing import Optional

import chromadb
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

from agent.config.settings import settings

_lock = Lock()
_embeddings_instance: Optional[OpenAIEmbeddings] = None
_chroma_client_instance: Optional[chromadb.PersistentClient] = None


def get_embeddings() -> OpenAIEmbeddings:
    global _embeddings_instance
    if _embeddings_instance is None:
        with _lock:
            if _embeddings_instance is None:
                _embeddings_instance = OpenAIEmbeddings(
                    model=settings.embedding_model or "text-embedding-3-small",
                    api_key=settings.embedding_api_key or settings.llm_api_key,
                    base_url=settings.embedding_base_url or settings.llm_base_url,
                )
    return _embeddings_instance


def get_chroma_client() -> chromadb.HttpClient:
    global _chroma_client_instance
    if _chroma_client_instance is None:
        with _lock:
            if _chroma_client_instance is None:
                _chroma_client_instance = chromadb.HttpClient(
                    host=settings.chroma_host,
                    port=settings.chroma_port,
                )
    return _chroma_client_instance


def get_vector_store(collection_name: Optional[str] = None) -> Chroma:
    return Chroma(
        collection_name=collection_name or settings.chroma_collection_name,
        embedding_function=get_embeddings(),
        client=get_chroma_client(),
    )


def get_retriever(
    collection_name: Optional[str] = None,
    k: int = 3,
    filter: Optional[dict] = None,
):
    vector_store = get_vector_store(collection_name)
    return vector_store.as_retriever(search_kwargs={"k": k, "filter": filter})


def list_sources(collection_name: Optional[str] = None) -> list[str]:
    vector_store = get_vector_store(collection_name)
    collection = vector_store._collection
    results = collection.get(include=["metadatas"])
    sources: set[str] = set()
    if results and results.get("metadatas"):
        for metadata in results["metadatas"]:
            if metadata and "source" in metadata:
                sources.add(metadata["source"])
    return sorted(list(sources))


def delete_source(source_name: str, collection_name: Optional[str] = None) -> None:
    vector_store = get_vector_store(collection_name)
    vector_store._collection.delete(where={"source": source_name})
