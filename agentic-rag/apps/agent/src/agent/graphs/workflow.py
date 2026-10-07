"""LangGraph workflow definitions.

This module defines the agent workflow graph with:
- Conditional routing based on tool calls
- Query rewriting for improved retrieval
- Conversation summarization for long-term memory
- Durable state via SqliteSaver checkpointing
"""

import asyncio
from typing import Literal, NotRequired

import structlog
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.config import get_stream_writer
from langgraph.graph import StateGraph, START, END, MessagesState

from agent.config.settings import settings
from agent.tools.registry import get_tools
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)
logger = structlog.get_logger(__name__)

_REASONING_KEYS = {"reasoning", "reasoning_content", "_reasoning_api_fields"}
_REASONING_BLOCK_TYPES = {"reasoning", "thinking"}


def _strip_reasoning_from_message(message):
    """Remove provider reasoning payloads before replaying message history."""
    if not isinstance(message, AIMessage):
        return message

    additional_kwargs = dict(message.additional_kwargs or {})
    response_metadata = dict(message.response_metadata or {})
    for key in _REASONING_KEYS:
        additional_kwargs.pop(key, None)
        response_metadata.pop(key, None)

    content = message.content
    if isinstance(content, list):
        content = [
            block
            for block in content
            if not (
                isinstance(block, dict)
                and (
                    block.get("type") in _REASONING_BLOCK_TYPES
                    or any(key in block for key in _REASONING_KEYS)
                )
            )
        ]

    return message.model_copy(
        update={
            "content": content,
            "additional_kwargs": additional_kwargs,
            "response_metadata": response_metadata,
        }
    )


class AgentState(MessagesState):
    """Custom state with long-term memory support."""

    summary: NotRequired[str]  # Conversation summary for LTM
    user_id: NotRequired[str]  # ID for Mem0 personal memory isolation
    memory_context: NotRequired[str]  # Context injected from memory search


# Helper functions for the graph nodes


def _count_tool_rounds(messages) -> int:
    """Count tool-call round-trips in the current turn (after the last HumanMessage)."""
    rounds = 0
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            break
        if isinstance(msg, ToolMessage):
            rounds += 1
    return rounds


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """Determine if the agent should continue or end."""
    messages = state["messages"]
    last_message = messages[-1]

    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        tool_rounds = _count_tool_rounds(messages)
        if tool_rounds >= settings.max_tool_rounds:
            logger.warning(
                "tool_loop_breaker",
                rounds=tool_rounds,
                limit=settings.max_tool_rounds,
            )
            return END
        return "tools"

    return END


def create_workflow(llm) -> StateGraph:
    """Create the agent workflow graph (uncompiled).

    Args:
        llm: The language model to use.

    Returns:
        Uncompiled StateGraph for the agent.
    """
    tools = get_tools()
    llm_with_tools = llm.bind_tools(tools, tool_choice="auto")
    llm_no_tools = llm

    # Build tool name -> callable map for custom tool execution
    tool_map = {t.name: t for t in tools}

    async def tools_node(state: AgentState) -> dict:
        """Execute tool calls and emit status events via stream writer."""
        writer = get_stream_writer()
        messages = state.get("messages", [])
        if not messages:
            return {"messages": []}

        last_msg = messages[-1]
        tool_calls = getattr(last_msg, "tool_calls", None) or []

        if not tool_calls:
            return {"messages": []}

        semaphore = asyncio.Semaphore(settings.tool_max_concurrency)

        async def run_tool(tc: dict) -> ToolMessage:
            name = tc.get("name", "")
            args = tc.get("args", {}) or {}
            call_id = tc.get("id", "")

            writer(
                {
                    "type": "tool_call_start",
                    "tool": name,
                    "id": call_id,
                    "args": args,
                }
            )

            func = tool_map.get(name)
            try:
                if func is None:
                    result = f"Tool '{name}' not found"
                    status = "error"
                else:
                    async with semaphore:
                        result = await func.ainvoke(args)
                    status = "ok"

                writer(
                    {
                        "type": "tool_call_end",
                        "tool": name,
                        "id": call_id,
                        "status": status,
                        "result_preview": str(result)[:500],
                    }
                )

                return ToolMessage(
                    content=str(result),
                    tool_call_id=call_id,
                    name=name,
                )

            except Exception as e:
                logger.exception("tool_execution_failed", tool=name, error=str(e))
                writer(
                    {
                        "type": "tool_call_end",
                        "tool": name,
                        "id": call_id,
                        "status": "error",
                        "error": str(e),
                    }
                )

                return ToolMessage(
                    content=f"Tool '{name}' failed: {e}",
                    tool_call_id=call_id,
                    name=name,
                )

        result_messages = await asyncio.gather(*(run_tool(tc) for tc in tool_calls))

        return {"messages": result_messages}

    async def agent_node(state: AgentState) -> dict:
        """Call the LLM with the current state. Run summarization silently when history is long."""
        from agent.prompts.system import get_agent_prompt
        from datetime import date

        with tracer.start_as_current_span("agent_node"):
            messages = state["messages"]

            prompt_template = get_agent_prompt()
            system_msg = prompt_template.format_messages(
                agent_name=settings.agent_name,
                current_date=date.today().isoformat(),
                messages=[],
            )[0]
            base_instruction = system_msg.content

            memory_context = state.get("memory_context", "")
            if memory_context:
                combined_system = (
                    f"{base_instruction}\n\n### USER PERSONAL CONTEXT\n{memory_context}"
                )
            else:
                combined_system = base_instruction

            history = [
                _strip_reasoning_from_message(m)
                for m in messages
                if not isinstance(m, SystemMessage)
            ]

            if len(history) > settings.max_history_messages:
                history = history[-settings.max_history_messages :]

            final_messages = [SystemMessage(content=combined_system)] + history

            tool_rounds = _count_tool_rounds(messages)
            force_text = tool_rounds >= settings.max_tool_rounds

            if force_text:
                logger.info(
                    "forcing_text_response",
                    tool_rounds=tool_rounds,
                    limit=settings.max_tool_rounds,
                )
                final_messages.append(
                    SystemMessage(
                        content="You have already called tools. You MUST now respond to the user using the tool results you have. Do NOT call any more tools. Generate your final OpenUI Lang response now."
                    )
                )

            active_llm = llm_no_tools if force_text else llm_with_tools

            logger.debug(
                "agent_node_invoking",
                message_count=len(final_messages),
                has_memory=bool(memory_context),
                force_text=force_text,
                tool_rounds=tool_rounds,
            )

            response = await active_llm.ainvoke(final_messages)
            result = {"messages": [response]}
            return result

    # Build the graph using our custom AgentState
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", tools_node)

    # Orchestrate the flow
    # Start immediately with agent node
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges(
        "agent", should_continue, {"tools": "tools", END: END}
    )

    # After tools, go back to agent
    workflow.add_edge("tools", "agent")

    return workflow
