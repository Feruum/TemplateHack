"""Text document loader with semantic-aware chunking.

Uses improved chunking strategies for better retrieval quality:
- Semantic boundaries (sentences, paragraphs)
- Parent-child metadata for context expansion
- BM25 index integration for hybrid search
"""

from pathlib import Path

from langchain_community.document_loaders import TextLoader

from agent.knowledge import get_knowledge_index
from agent.loaders.pdf import create_semantic_splitter
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)


def ingest_text(
    file_path: str,
    chunk_size: int = 800,
    chunk_overlap: int = 200,
    source_name: str | None = None,
) -> int:
    """Ingest a text document into the knowledge base.

    Uses semantic-aware chunking and indexes to both vector store
    and BM25 index for hybrid search.

    Args:
        file_path: Path to the text file.
        chunk_size: Size of text chunks (default optimized for retrieval).
        chunk_overlap: Overlap between chunks.

    Returns:
        Number of chunks added to the vector store.
    """
    with tracer.start_as_current_span("ingest_text") as span:
        span.set_attribute("file_path", file_path)

        # Load text file
        loader = TextLoader(file_path)
        docs = loader.load()

        span.set_attribute("docs_loaded", len(docs))

        # Use semantic-aware splitter
        splitter = create_semantic_splitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        chunks = splitter.split_documents(docs)

        # Add source metadata
        source_name = source_name or Path(file_path).name
        for i, chunk in enumerate(chunks):
            chunk.metadata["source"] = source_name
            chunk.metadata["chunk_index"] = i
            chunk.metadata["id"] = f"{source_name}_{i}"

        span.set_attribute("chunks_created", len(chunks))

        if chunks:
            ids = [chunk.metadata["id"] for chunk in chunks]
            get_knowledge_index().add_documents(chunks, ids=ids)

        return len(chunks)


async def aingest_text(
    file_path: str,
    chunk_size: int = 800,
    chunk_overlap: int = 200,
    source_name: str | None = None,
) -> int:
    """Ingest a text document into the knowledge base (asynchronous)."""
    import anyio

    return await anyio.to_thread.run_sync(
        ingest_text, file_path, chunk_size, chunk_overlap, source_name
    )
