from agent.modules.registry import get_module


def test_default_module_uses_generic_document_instructions():
    instructions = get_module("rag").instructions.casefold()

    assert "uploaded" in instructions
    assert "filename" in instructions
    assert "campus" not in instructions
    assert "studyverse" not in instructions


def test_module_uses_only_its_registered_tools():
    module = get_module("rag")

    assert [tool.name for tool in module.tools] == ["search_user_documents", "search_user_memory"]
    assert module.trusted_tool_arguments == {
        "search_user_documents": "user_id", "search_user_memory": "user_id",
    }
