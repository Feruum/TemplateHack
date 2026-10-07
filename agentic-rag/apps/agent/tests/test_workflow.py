"""Integration tests for the agent workflow."""

import pytest
import time
from unittest.mock import MagicMock, AsyncMock
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import tool
from agent.graphs.workflow import create_workflow, _strip_reasoning_from_message


@pytest.fixture
def mock_llm():
    """Mock the LLM."""
    llm = MagicMock()
    # Mock bind_tools and ainvoke
    llm.bind_tools.return_value = llm
    llm.ainvoke = AsyncMock()
    return llm


def test_strip_reasoning_from_ai_message_preserves_tool_calls():
    """Reasoning metadata must not be replayed into the post-tool LLM turn."""
    tool_call = {
        "name": "fetch_events",
        "args": {"status": "upcoming"},
        "id": "call_1",
        "type": "tool_call",
    }
    message = AIMessage(
        content=[
            {"type": "reasoning", "reasoning": "hidden"},
            {"type": "text", "text": ""},
        ],
        tool_calls=[tool_call],
        additional_kwargs={
            "reasoning_content": "hidden",
            "reasoning": "hidden",
            "keep": "ok",
        },
        response_metadata={"reasoning_content": "hidden", "model_name": "nemotron"},
    )

    cleaned = _strip_reasoning_from_message(message)

    assert cleaned.tool_calls == [tool_call]
    assert cleaned.additional_kwargs == {"keep": "ok"}
    assert cleaned.response_metadata == {"model_name": "nemotron"}
    assert cleaned.content == [{"type": "text", "text": ""}]


def test_workflow_binds_tools_with_auto_tool_choice(mock_llm):
    create_workflow(mock_llm)

    _tools, kwargs = mock_llm.bind_tools.call_args
    assert kwargs == {"tool_choice": "auto"}


@pytest.mark.asyncio
async def test_workflow_basic_conversation(mock_llm):
    """Test basic conversation flow."""
    # Setup
    mock_llm.ainvoke.return_value = AIMessage(content="Hello!")

    # Compile the workflow for testing
    workflow = create_workflow(mock_llm).compile()

    # Run
    # Use ainvoke since the nodes are now async
    result = await workflow.ainvoke(
        {"messages": [HumanMessage(content="Hi")]},
        {"configurable": {"thread_id": "test"}},
    )

    # Assertions
    assert "messages" in result
    assert result["messages"][-1].content == "Hello!"


@pytest.mark.asyncio
async def test_workflow_tool_routing(mock_llm):
    """Test that the workflow routes to tools when needed."""
    # Setup: LLM returns a tool call
    tool_call = {
        "name": "search_knowledge",
        "args": {"query": "test query"},
        "id": "1",
        "type": "tool_call",
    }
    mock_llm.ainvoke.return_value = AIMessage(content="", tool_calls=[tool_call])

    workflow = create_workflow(mock_llm).compile()

    # Run: We interrupt before tools to check state
    config = {"configurable": {"thread_id": "test_tools"}}
    await workflow.ainvoke(
        {"messages": [HumanMessage(content="search for something")]}, config
    )

    # Verify ainvoke was called
    assert mock_llm.ainvoke.called


@pytest.mark.asyncio
async def test_workflow_executes_multiple_tool_calls_concurrently(monkeypatch):
    """Multiple independent tool calls should not run serially."""

    @tool
    async def slow_alpha() -> str:
        """Slow alpha tool."""
        import asyncio

        await asyncio.sleep(0.2)
        return "alpha"

    @tool
    async def slow_beta() -> str:
        """Slow beta tool."""
        import asyncio

        await asyncio.sleep(0.2)
        return "beta"

    monkeypatch.setattr(
        "agent.graphs.workflow.get_tools", lambda: [slow_alpha, slow_beta]
    )

    llm = MagicMock()
    llm.bind_tools.return_value = llm
    llm.ainvoke = AsyncMock(
        side_effect=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "slow_alpha",
                        "args": {},
                        "id": "alpha",
                        "type": "tool_call",
                    },
                    {
                        "name": "slow_beta",
                        "args": {},
                        "id": "beta",
                        "type": "tool_call",
                    },
                ],
            ),
            AIMessage(content="done"),
        ]
    )

    workflow = create_workflow(llm).compile()

    started = time.perf_counter()
    result = await workflow.ainvoke(
        {"messages": [HumanMessage(content="run tools")]},
        {"configurable": {"thread_id": "parallel_tools"}},
    )
    elapsed = time.perf_counter() - started

    assert result["messages"][-1].content == "done"
    assert elapsed < 0.35
