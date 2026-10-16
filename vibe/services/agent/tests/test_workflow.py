from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import tool

from agent.graphs.workflow import _strip_reasoning_from_message, create_workflow
from agent.modules.base import AgentModule
from agent.modules.registry import get_module


def test_strip_reasoning_from_ai_message():
    original = AIMessage(
        content=[{"type": "reasoning", "reasoning": "hidden"}, {"type": "text", "text": "ok"}],
        additional_kwargs={"reasoning_content": "hidden", "keep": "yes"},
    )

    cleaned = _strip_reasoning_from_message(original)

    assert cleaned.content == [{"type": "text", "text": "ok"}]
    assert cleaned.additional_kwargs == {"keep": "yes"}


def test_workflow_binds_only_selected_module_tools():
    llm = MagicMock()
    llm.bind_tools.return_value = llm

    create_workflow(llm, get_module("rag"))

    args, kwargs = llm.bind_tools.call_args
    tools = args[0]
    assert [item.name for item in tools] == ["search_user_documents", "search_user_memory"]
    assert kwargs == {"tool_choice": "auto"}


@pytest.mark.asyncio
async def test_workflow_basic_conversation_uses_module_prompt():
    llm = MagicMock()
    llm.bind_tools.return_value = llm
    llm.ainvoke = AsyncMock(return_value=AIMessage(content="Hello"))
    module = AgentModule(
        id="hello",
        name="Hello",
        description="A small test module",
        instructions="Reply with a greeting.",
    )

    result = await create_workflow(llm, module).compile().ainvoke(
        {"messages": [HumanMessage(content="Hi")], "user_id": "user-1"},
        {"configurable": {"thread_id": "basic"}},
    )

    assert result["messages"][-1].content == "Hello"
    assert llm.ainvoke.await_args.args[0][0].content == "Reply with a greeting."


@pytest.mark.asyncio
async def test_model_cannot_override_trusted_tool_user_id():
    captured_user_ids: list[str] = []

    @tool
    def record_user(user_id: str = "") -> str:
        """Record the effective user id for this test."""
        captured_user_ids.append(user_id)
        return "ok"

    module = AgentModule(
        id="test",
        name="Test",
        description="Trust boundary test",
        instructions="Use the tool.",
        tools=(record_user,),
        trusted_tool_arguments={"record_user": "user_id"},
    )
    llm = MagicMock()
    llm.bind_tools.return_value = llm
    llm.ainvoke = AsyncMock(
        side_effect=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "record_user",
                        "args": {"user_id": "forged-user"},
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(content="done"),
        ]
    )

    result = await create_workflow(llm, module).compile().ainvoke(
        {"messages": [HumanMessage(content="Run it")], "user_id": "trusted-user"},
        {"configurable": {"thread_id": "trusted"}},
    )

    assert result["messages"][-1].content == "done"
    assert captured_user_ids == ["trusted-user"]
