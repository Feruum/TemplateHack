"""PDF document loader with semantic-aware chunking.

Uses improved chunking strategies for better retrieval quality:
- Semantic boundaries (sentences, paragraphs)
- Parent-child metadata for context expansion
- BM25 index integration for hybrid search
"""

from pathlib import Path
import uuid

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from agent.knowledge import get_knowledge_index
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)


def create_semantic_splitter(
    chunk_size: int = 800,
    chunk_overlap: int = 200,
) -> RecursiveCharacterTextSplitter:
    """Create a text splitter with semantic-aware separators.

    Uses separators that respect document structure:
    paragraphs > sentences > words

    Args:
        chunk_size: Target chunk size in characters.
        chunk_overlap: Overlap between chunks.

    Returns:
        Configured text splitter.
    """
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=[
            "\n\n\n",  # Multiple newlines (major sections)
            "\n\n",  # Paragraph breaks
            "\n",  # Line breaks
            ". ",  # Sentence boundaries
            "? ",  # Question boundaries
            "! ",  # Exclamation boundaries
            "; ",  # Semicolon breaks
            ", ",  # Clause breaks
            " ",  # Word breaks
            "",  # Character fallback
        ],
        length_function=len,
    )


def ingest_pdf(
    file_path: str,
    chunk_size: int = 800,
    chunk_overlap: int = 200,
    source_name: str | None = None,
    owner_id: str = "local",
    document_id: str | None = None,
) -> int:
    """Ingest a PDF document into the knowledge base.

    Uses semantic-aware chunking and indexes to both vector store
    and BM25 index for hybrid search.

    Args:
        file_path: Path to the PDF file.
        chunk_size: Size of text chunks (default optimized for retrieval).
        chunk_overlap: Overlap between chunks.

    Returns:
        Number of chunks added to the vector store.
    """
    with tracer.start_as_current_span("ingest_pdf") as span:
        span.set_attribute("file_path", file_path)

        # Load PDF
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        span.set_attribute("pages_loaded", len(docs))

        # Use semantic-aware splitter
        splitter = create_semantic_splitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        chunks = splitter.split_documents(docs)

        # Add source metadata
        actual_source = source_name or Path(file_path).name
        actual_document_id = document_id or str(uuid.uuid4())
        for i, chunk in enumerate(chunks):
            chunk.metadata["source"] = actual_source
            chunk.metadata["owner_id"] = owner_id
            chunk.metadata["document_id"] = actual_document_id
            chunk.metadata["chunk_index"] = i
            chunk.metadata["id"] = f"{actual_document_id}_{i}"

        span.set_attribute("chunks_created", len(chunks))

        if chunks:
            ids = [chunk.metadata["id"] for chunk in chunks]
            get_knowledge_index().add_documents(chunks, ids=ids)

        return len(chunks)


async def aingest_pdf(
    file_path: str,
    chunk_size: int = 800,
    chunk_overlap: int = 200,
    source_name: str | None = None,
    owner_id: str = "local",
    document_id: str | None = None,
) -> int:
    """Ingest a PDF document into the knowledge base (asynchronous)."""
    import anyio

    return await anyio.to_thread.run_sync(
        lambda: ingest_pdf(
            file_path, chunk_size, chunk_overlap, source_name, owner_id, document_id
        )
    )
