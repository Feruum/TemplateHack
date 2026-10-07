"""Ingestion CLI script."""

import argparse
import sys
from pathlib import Path

from agent.loaders import ingest_pdf, ingest_text


def main():
    """Run the ingestion CLI."""
    parser = argparse.ArgumentParser(
        description="Ingest documents into the agent's knowledge base."
    )
    parser.add_argument("file", help="Path to the file to ingest.")
    parser.add_argument(
        "--type",
        choices=["pdf", "text"],
        help="Type of file (optional, inferred from extension).",
    )
    parser.add_argument(
        "--chunk-size", type=int, default=1000, help="Chunk size for text splitting."
    )
    parser.add_argument(
        "--chunk-overlap",
        type=int,
        default=200,
        help="Chunk overlap for text splitting.",
    )

    args = parser.parse_args()
    file_path = Path(args.file)

    if not file_path.exists():
        print(f"Error: File '{file_path}' not found.")
        sys.exit(1)

    file_type = args.type
    if not file_type:
        if file_path.suffix.lower() == ".pdf":
            file_type = "pdf"
        else:
            file_type = "text"

    print(f"Ingesting '{file_path}' as {file_type}...")

    try:
        if file_type == "pdf":
            count = ingest_pdf(str(file_path), args.chunk_size, args.chunk_overlap)
        else:
            count = ingest_text(str(file_path), args.chunk_size, args.chunk_overlap)

        print(f"Successfully ingested {count} chunks.")
    except Exception as e:
        print(f"Error during ingestion: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
