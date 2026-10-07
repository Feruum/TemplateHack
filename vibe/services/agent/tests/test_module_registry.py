import json

from langchain_core.documents import Document

from agent.config.settings import settings
from agent.modules.base import AgentModule
from agent.modules.rag import search_user_documents
from agent.modules import registry


def test_auto_routing_selects_best_matching_module(monkeypatch):
    documents = AgentModule(
        id="rag",
        name="Documents",
        description="Document questions",
        instructions="Use docs",
        routing_keywords=("pdf", "document"),
        default_for_auto=True,
    )
    planner = AgentModule(
        id="planner",
        name="Planner",
        description="Plans work",
        instructions="Plan work",
        routing_keywords=("plan", "schedule"),
    )
    monkeypatch.setattr(registry, "get_modules", lambda: (documents, planner))

    assert registry.select_module("make a schedule from this plan").id == "planner"
    assert registry.select_module("summarize this PDF").id == "rag"


def test_explicit_module_overrides_auto_routing(monkeypatch):
    documents = AgentModule(
        id="rag",
        name="Documents",
        description="Document questions",
        instructions="Use docs",
        routing_keywords=("pdf",),
    )
    planner = AgentModule(
        id="planner",
        name="Planner",
        description="Plans work",
        instructions="Plan work",
        routing_keywords=("plan",),
    )
    monkeypatch.setattr(registry, "get_modules", lambda: (documents, planner))

    assert registry.select_module("summarize this PDF", "planner").id == "planner"


def test_unknown_explicit_module_is_rejected():
    try:
        registry.select_module("hello", "missing")
    except registry.UnknownModuleError as error:
        assert str(error) == "missing"
    else:
        raise AssertionError("unknown module was accepted")


def test_document_search_scopes_results_to_forwarded_user(monkeypatch):
    calls = {}

    class FakeIndex:
        def search(self, **kwargs):
            calls.update(kwargs)
            return [
                Document(
                    page_content="Private answer",
                    metadata={"source": "notes.txt", "page": 0, "document_id": "doc-1"},
                )
            ]

    monkeypatch.setattr("agent.modules.rag.get_knowledge_index", lambda: FakeIndex())
    monkeypatch.setattr(settings, "use_reranker", False)

    result = json.loads(
        search_user_documents.invoke({"query": "question", "user_id": "user-a"})
    )

    assert calls["filter"] == {"owner_id": "user-a"}
    assert result["sources"][0]["filename"] == "notes.txt"
    assert result["sources"][0]["page"] == 1
