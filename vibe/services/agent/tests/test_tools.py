import json

from langchain_core.documents import Document

from agent.config.settings import settings
from agent.modules.rag import search_user_documents


def test_search_user_documents_applies_owner_filter(monkeypatch):
    calls = {}

    class FakeIndex:
        def search(self, **kwargs):
            calls.update(kwargs)
            return [Document(page_content="Private answer", metadata={"source": "notes.txt", "page": 0})]

    monkeypatch.setattr("agent.modules.rag.get_knowledge_index", lambda: FakeIndex())
    monkeypatch.setattr(settings, "use_reranker", False)

    result = json.loads(search_user_documents.invoke({"query": "question", "user_id": "user-a"}))

    assert calls["filter"] == {"owner_id": "user-a"}
    assert "Private answer" in result["context"]
    assert result["sources"][0]["filename"] == "notes.txt"


def test_search_user_documents_requires_authenticated_context():
    result = json.loads(search_user_documents.invoke({"query": "question"}))

    assert result["sources"] == []
    assert "authorized user" in result["context"]
