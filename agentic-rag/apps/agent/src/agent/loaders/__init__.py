"""Document loaders for the agent."""

from agent.loaders.pdf import ingest_pdf, aingest_pdf
from agent.loaders.text import ingest_text, aingest_text

__all__ = ["ingest_pdf", "aingest_pdf", "ingest_text", "aingest_text"]
