"""Tests for retrieval tools."""

from langchain_core.documents import Document
from agent.tools.retrieval import search_knowledge, save_to_memory


def test_search_knowledge_found(mock_vector_store):
    """Test searching with results."""
    # Setup mock
    mock_doc = Document(page_content="Test content", metadata={"source": "test"})
    mock_vector_store.search.return_value = [mock_doc]

    # Run tool
    # When invoking directly, it returns the content string by default
    # To get artifacts, we might need to inspect the tool definition or trust the string
    # For now, let's verify the string content which is what the agent sees
    result = search_knowledge.invoke("test query")

    # Verify
    assert isinstance(result, str)
    assert "Test content" in result
    mock_vector_store.search.assert_called_once()


def test_search_knowledge_empty(mock_vector_store):
    """Test searching with no results."""
    # Setup mock
    mock_vector_store.search.return_value = []

    # Run tool
    result = search_knowledge.invoke("test query")

    # Verify
    assert isinstance(result, str)
    assert "I couldn't find any relevant information" in result


def test_save_to_memory(mock_vector_store):
    """Test saving to memory."""
    # Run tool
    result = save_to_memory.invoke({"content": "New info", "metadata": "user"})

    # Verify
    assert "Successfully saved to knowledge base and long-term memory" in result
    mock_vector_store.add_documents.assert_called_once()
    args = mock_vector_store.add_documents.call_args
    assert args[0][0][0].page_content == "New info"
    assert args[0][0][0].metadata["source"] == "user"
