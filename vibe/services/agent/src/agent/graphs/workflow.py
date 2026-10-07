"""Build one isolated LangGraph workflow for an agent module."""

import asyncio
import json
from typing import Literal, NotRequired

import structlog
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, MessagesState, StateGraph

from agent.config.settings import settings
from agent.modules.base import AgentModule
from agent.modules.registry import get_modules
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)
logger = structlog.get_logger(__name__)

_REASONING_KEYS = {"reasoning", "reasoning_content", "_reasoning_api_fields"}
_REASONING_BLOCK_TYPES = {"reasoning", "thinking"}


def _strip_reasoning_from_message(message):
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
    user_id: NotRequired[str]


def _count_tool_rounds(messages) -> int:
    rounds = 0
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            break
        if isinstance(message, ToolMessage):
            rounds += 1
    return rounds


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    messages = state["messages"]
    last_message = messages[-1]
    if getattr(last_message, "tool_calls", None):
        if _count_tool_rounds(messages) >= settings.max_tool_rounds:
            logger.warning("tool_loop_breaker", limit=settings.max_tool_rounds)
            return END
        return "tools"
    return END


def create_workflow(llm, module: AgentModule | None = None) -> StateGraph:
    if module is None:
        modules = get_modules()
        if not modules:
            raise RuntimeError("No agent modules are enabled")
        module = next((item for item in modules if item.default_for_auto), modules[0])
    tools = list(module.tools)
    llm_with_tools = llm.bind_tools(tools, tool_choice="auto") if tools else llm
    tool_map = {tool.name: tool for tool in tools}

    async def tools_node(state: AgentState) -> dict:
        writer = get_stream_writer()
        messages = state.get("messages", [])
        if not messages:
            return {"messages": []}
        calls = getattr(messages[-1], "tool_calls", None) or []
        if not calls:
            return {"messages": []}
        semaphore = asyncio.Semaphore(settings.tool_max_concurrency)

        async def run_tool(call: dict) -> ToolMessage:
            name = call.get("name", "")
            arguments = dict(call.get("args", {}) or {})
            call_id = call.get("id", "")
            trusted_name = (module.trusted_tool_arguments or {}).get(name)
            if trusted_name:
                arguments[trusted_name] = state.get("user_id", "")
            writer({"type": "tool_call_start", "tool": name, "id": call_id})

            tool = tool_map.get(name)
            try:
                if tool is None:
                    result = f"Tool '{name}' is not registered in module '{module.id}'."
                    status = "error"
                else:
                    async with semaphore:
                        result = await tool.ainvoke(arguments)
                    status = "ok"
                    if name in module.source_tools:
                        try:
                            payload = json.loads(str(result))
                        except (TypeError, ValueError):
                            payload = None
                        if isinstance(payload, dict):
                            sources = payload.get("sources")
                            if isinstance(sources, list):
                                writer({"type": "sources", "sources": sources})
                            result = payload.get("context", result)
                writer({
                    "type": "tool_call_end",
                    "tool": name,
                    "id": call_id,
                    "status": status,
                })
                return ToolMessage(content=str(result), tool_call_id=call_id, name=name)
            except Exception as error:
                logger.exception("module_tool_failed", module_id=module.id, tool=name)
                writer({
                    "type": "tool_call_end",
                    "tool": name,
                    "id": call_id,
                    "status": "error",
                    "error": "Tool execution failed",
                })
                return ToolMessage(
                    content=f"Tool '{name}' failed: {error}",
                    tool_call_id=call_id,
                    name=name,
                )

        return {"messages": await asyncio.gather(*(run_tool(call) for call in calls))}

    async def agent_node(state: AgentState) -> dict:
        with tracer.start_as_current_span("agent_node"):
            messages = [
                _strip_reasoning_from_message(message)
                for message in state["messages"]
                if not isinstance(message, SystemMessage)
            ]
            messages = messages[-settings.max_history_messages :]
            final_messages = [SystemMessage(content=module.instructions), *messages]
            force_text = _count_tool_rounds(state["messages"]) >= settings.max_tool_rounds
            if force_text:
                final_messages.append(
                    SystemMessage(content="Use the available tool results and finish without calling tools.")
                )
            response = await (llm if force_text else llm_with_tools).ainvoke(final_messages)
            return {"messages": [response]}

    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    if tools:
        workflow.add_node("tools", tools_node)
    workflow.add_edge(START, "agent")
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", END: END} if tools else {"tools": END, END: END},
    )
    if tools:
        workflow.add_edge("tools", "agent")
    return workflow
