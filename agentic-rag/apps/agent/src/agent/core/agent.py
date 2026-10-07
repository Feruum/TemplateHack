from datetime import date
from typing import AsyncGenerator

import structlog
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from agent.config.settings import settings
from agent.graphs.workflow import create_workflow
from agent.prompts.system import get_agent_prompt
from agent.utils.observability import get_tracer

tracer = get_tracer(__name__)
logger = structlog.get_logger(__name__)


class Agent:
    def __init__(self, model: str | None = None):
        self.model_name = model or settings.llm_model
        # No NVIDIA_MODELS hard dep; accept configured model (fail-open elsewhere)

        llm = ChatOpenAI(
            model=self.model_name,
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )
        self.llm = llm
        self.prompt = get_agent_prompt()
        self.workflow_builder = create_workflow(self.llm)
        self.workflow = None
        self._checkpointer = None
        self._pool = None

    async def __aenter__(self):
        if not settings.postgres_url:
            if settings.environment != "development":
                raise RuntimeError("PostgreSQL checkpointer is required in production")
            logger.info("no_postgres_url_using_sqlite")
            return await self._fallback_sqlite_init()

        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            import psycopg_pool

            logger.info(
                "initializing_postgres_checkpointer",
                url=settings.postgres_url[:50] + "...",
            )

            self._pool = psycopg_pool.AsyncConnectionPool(
                settings.postgres_url,
                min_size=0,
                max_size=10,
                kwargs={"autocommit": True},
                timeout=5,
                open=False,
            )
            await self._pool.open()

            async with self._pool.connection() as conn:
                self._checkpointer = AsyncPostgresSaver(conn)
                await self._checkpointer.setup()

            self._checkpointer = AsyncPostgresSaver(self._pool)

            self.workflow = self.workflow_builder.compile(
                checkpointer=self._checkpointer,
            )

            logger.info(
                "agent_initialized", model=self.model_name, checkpointer="postgres"
            )
            return self

        except ImportError as error:
            if settings.environment != "development":
                raise RuntimeError(
                    "PostgreSQL checkpointer package is required in production"
                ) from error
            logger.warning("postgres_checkpointer_unavailable_using_sqlite")
            return await self._fallback_sqlite_init()
        except Exception as error:
            logger.error("postgres_checkpointer_init_failed", error=str(error))
            if self._pool:
                try:
                    await self._pool.close()
                except Exception as close_error:
                    logger.warning(
                        "postgres_checkpointer_pool_close_failed",
                        error=str(close_error),
                    )
                self._pool = None
            if settings.environment != "development":
                raise RuntimeError(
                    "PostgreSQL checkpointer initialization failed"
                ) from error
            return await self._fallback_sqlite_init()

    async def _fallback_sqlite_init(self):
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
        from pathlib import Path

        db_path = Path(settings.upload_dir).parent / "checkpoints.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info("initializing_sqlite_checkpointer", path=str(db_path))

        self._sqlite_cm = AsyncSqliteSaver.from_conn_string(str(db_path))
        self._checkpointer = await self._sqlite_cm.__aenter__()
        self.workflow = self.workflow_builder.compile(
            checkpointer=self._checkpointer,
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._pool:
            await self._pool.close()
        elif hasattr(self, "_sqlite_cm") and self._sqlite_cm:
            await self._sqlite_cm.__aexit__(exc_type, exc_val, exc_tb)

    async def ainvoke(
        self, message: str, thread_id: str = "default", user_id: str = "default_user"
    ) -> str:
        config = {
            "configurable": {"thread_id": thread_id, "user_id": user_id},
            "recursion_limit": settings.agent_max_iterations * 2 + 1,
        }

        state = await self.workflow.aget_state(config)
        messages = state.values.get("messages", [])

        if state.next:
            result = await self.workflow.ainvoke(None, config)
        elif not messages:
            system_message = self.prompt.format_messages(
                agent_name=settings.agent_name,
                current_date=date.today().isoformat(),
                messages=[],
            )[0]
            result = await self.workflow.ainvoke(
                {
                    "messages": [system_message, HumanMessage(content=message)],
                    "user_id": user_id,
                },
                config,
            )
        else:
            result = await self.workflow.ainvoke(
                {"messages": [HumanMessage(content=message)], "user_id": user_id},
                config,
            )

        return result["messages"][-1].content

    async def astream(
        self,
        message: str | None,
        thread_id: str = "default",
        user_id: str = "default_user",
    ) -> AsyncGenerator[dict, None]:
        with tracer.start_as_current_span("agent_astream"):
            config = {
                "configurable": {"thread_id": thread_id, "user_id": user_id},
                "recursion_limit": settings.agent_max_iterations * 2 + 1,
            }

            if message is None:
                inputs = None
            else:
                state = await self.workflow.aget_state(config)
                history = state.values.get("messages", [])

                if not history:
                    system_message = self.prompt.format_messages(
                        agent_name=settings.agent_name,
                        current_date=date.today().isoformat(),
                        messages=[],
                    )[0]
                    inputs = {
                        "messages": [system_message, HumanMessage(content=message)],
                        "user_id": user_id,
                    }
                else:
                    inputs = {
                        "messages": [HumanMessage(content=message)],
                        "user_id": user_id,
                    }

            async for chunk in self.workflow.astream(
                inputs, config, stream_mode=["updates", "custom", "messages"]
            ):
                yield chunk

    async def get_thread_history(self, thread_id: str) -> list[dict]:
        config = {"configurable": {"thread_id": thread_id}}
        state = await self.workflow.aget_state(config)
        messages = state.values.get("messages", [])
        return [
            {"role": m.type, "content": m.content}
            for m in messages
            if hasattr(m, "content")
        ]

    async def delete_thread(self, thread_id: str) -> bool:
        try:
            if hasattr(self._checkpointer, "adelete"):
                config = {"configurable": {"thread_id": thread_id}}
                await self._checkpointer.adelete(config)
                return True
            logger.warning("delete_thread_not_supported")
            return False
        except Exception as e:
            logger.error("delete_thread_failed", thread_id=thread_id, error=str(e))
            return False
