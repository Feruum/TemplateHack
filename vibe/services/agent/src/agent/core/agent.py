"""LangGraph agent runner for one registered module."""

from collections.abc import AsyncGenerator

import structlog
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from agent.config.settings import settings
from agent.graphs.workflow import create_workflow
from agent.infrastructure.checkpoint_saver import SQLAlchemyCheckpointSaver
from agent.infrastructure.database import async_session, initialize_database
from agent.modules.registry import get_module
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)
logger = structlog.get_logger(__name__)


class Agent:
    def __init__(self, module_id: str = "rag", model: str | None = None):
        self.module = get_module(module_id)
        self.model_name = model or settings.llm_model
        if not settings.llm_base_url or not settings.llm_api_key or not self.model_name:
            raise RuntimeError("Set AGENT_LLM_BASE_URL, AGENT_LLM_API_KEY, and AGENT_LLM_MODEL")
        self.llm = ChatOpenAI(
            model=self.model_name,
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )
        self.workflow_builder = create_workflow(self.llm, self.module)
        self.workflow = None
        self._checkpointer = None

    async def __aenter__(self):
        if not settings.database_url:
            raise RuntimeError("AGENT_DATABASE_URL is required for persistent threads")
        await initialize_database()
        self._checkpointer = SQLAlchemyCheckpointSaver(async_session)
        self.workflow = self.workflow_builder.compile(checkpointer=self._checkpointer)
        logger.info("agent_module_initialized", module_id=self.module.id)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None

    def _thread_config(self, thread_id: str, user_id: str) -> dict:
        return {
            "configurable": {"thread_id": thread_id, "user_id": user_id},
            "recursion_limit": settings.agent_max_iterations * 2 + 1,
        }

    async def astream(
        self,
        message: str,
        thread_id: str,
        user_id: str,
    ) -> AsyncGenerator[dict, None]:
        with tracer.start_as_current_span("agent_astream"):
            config = self._thread_config(thread_id, user_id)
            async for chunk in self.workflow.astream(
                {"messages": [HumanMessage(content=message)], "user_id": user_id},
                config,
                stream_mode=["updates", "custom", "messages"],
            ):
                yield chunk

    async def get_thread_history(self, thread_id: str, user_id: str) -> list[dict]:
        state = await self.workflow.aget_state(self._thread_config(thread_id, user_id))
        return [
            {"role": message.type, "content": message.content}
            for message in state.values.get("messages", [])
            if hasattr(message, "content")
        ]

    async def delete_thread(self, thread_id: str, user_id: str) -> bool:
        try:
            if not hasattr(self._checkpointer, "adelete"):
                return False
            await self._checkpointer.adelete(self._thread_config(thread_id, user_id))
            return True
        except Exception:
            logger.exception("agent_thread_delete_failed", module_id=self.module.id)
            return False
