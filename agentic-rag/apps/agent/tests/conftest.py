"""Test configuration."""

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ["AGENT_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["AGENT_ENVIRONMENT"] = "development"
os.environ["AGENT_REDIS_URL"] = ""
os.environ["AGENT_KNOWLEDGE_BACKEND"] = "memory"

# Add src to python path
sys.path.append(str(Path(__file__).parent.parent / "src"))


@pytest.fixture
def mock_vector_store(monkeypatch):
    """Mock the vector store."""
    from agent.config.settings import settings

    mock_store = MagicMock()
    mock_memory = MagicMock()

    monkeypatch.setattr(settings, "use_hybrid_search", False)
    monkeypatch.setattr("agent.tools.retrieval.get_knowledge_index", lambda: mock_store)
    monkeypatch.setattr("agent.tools.retrieval.AgentMemory", lambda: mock_memory)

    yield mock_store
