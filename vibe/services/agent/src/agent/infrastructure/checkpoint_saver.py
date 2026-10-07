"""SQLAlchemy-backed LangGraph checkpoint persistence with owner isolation."""

from collections.abc import AsyncIterator, Sequence
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    ChannelVersions,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    get_serializable_checkpoint_metadata,
)
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from agent.infrastructure.database import CheckpointModel, CheckpointWriteModel
from agent.infrastructure.thread_ownership import ThreadOwnership


def _owner_id(config: RunnableConfig) -> str:
    configurable = config.get("configurable") or {}
    user_id = configurable.get("user_id")
    owner_id = configurable.get("owner_id")

    if not user_id and not owner_id:
        raise ValueError("A trusted user_id is required for checkpoint access")
    if user_id and owner_id and str(user_id) != str(owner_id):
        raise ValueError("user_id and owner_id must identify the same owner")
    return str(user_id or owner_id)


def _identity(config: RunnableConfig) -> tuple[str, str, str]:
    configurable = config.get("configurable") or {}
    thread_id = configurable.get("thread_id")
    if not thread_id:
        raise ValueError("A thread_id is required for checkpoint access")
    return _owner_id(config), str(thread_id), str(configurable.get("checkpoint_ns") or "")


def _serialized(saver: BaseCheckpointSaver, value: Any) -> tuple[str, bytes]:
    type_name, data = saver.serde.dumps_typed(value)
    return type_name, bytes(data)


def _deserialized(saver: BaseCheckpointSaver, type_name: str, data: bytes) -> Any:
    return saver.serde.loads_typed((type_name, bytes(data)))


class SQLAlchemyCheckpointSaver(BaseCheckpointSaver):
    """Persist checkpoints and pending writes through the service's SQLAlchemy DB."""

    def __init__(self, sessions: async_sessionmaker[AsyncSession]):
        super().__init__()
        self.sessions = sessions

    @staticmethod
    def _config(owner_id: str, thread_id: str, checkpoint_ns: str, checkpoint_id: str):
        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint_id,
                "user_id": owner_id,
                "owner_id": owner_id,
            }
        }

    async def aput(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> RunnableConfig:
        del new_versions  # The full serialized checkpoint stores every channel value.
        owner_id, thread_id, checkpoint_ns = _identity(config)
        configurable = config["configurable"]
        checkpoint_id = str(checkpoint["id"])
        checkpoint_type, checkpoint_data = _serialized(self, checkpoint)
        metadata_type, metadata_data = _serialized(
            self,
            get_serializable_checkpoint_metadata(config, metadata),
        )
        parent_checkpoint_id = configurable.get("checkpoint_id")

        async with self.sessions() as session, session.begin():
            insert = (
                sqlite_insert
                if session.get_bind().dialect.name == "sqlite"
                else postgresql_insert
            )
            values = {
                "owner_id": owner_id,
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint_id,
                "parent_checkpoint_id": parent_checkpoint_id,
                "checkpoint_type": checkpoint_type,
                "checkpoint_data": checkpoint_data,
                "metadata_type": metadata_type,
                "metadata_data": metadata_data,
            }
            statement = insert(CheckpointModel).values(**values)
            statement = statement.on_conflict_do_update(
                index_elements=[
                    CheckpointModel.owner_id,
                    CheckpointModel.thread_id,
                    CheckpointModel.checkpoint_ns,
                    CheckpointModel.checkpoint_id,
                ],
                set_={
                    "parent_checkpoint_id": parent_checkpoint_id,
                    "checkpoint_type": checkpoint_type,
                    "checkpoint_data": checkpoint_data,
                    "metadata_type": metadata_type,
                    "metadata_data": metadata_data,
                },
            )
            await session.execute(statement)

        return self._config(owner_id, thread_id, checkpoint_ns, checkpoint_id)

    async def aput_writes(
        self,
        config: RunnableConfig,
        writes: Sequence[tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        if not writes:
            return
        owner_id, thread_id, checkpoint_ns = _identity(config)
        checkpoint_id = (config.get("configurable") or {}).get("checkpoint_id")
        if not checkpoint_id:
            raise ValueError("A checkpoint_id is required for pending writes")

        async with self.sessions() as session, session.begin():
            bind = session.get_bind()
            dialect_name = bind.dialect.name
            insert = sqlite_insert if dialect_name == "sqlite" else postgresql_insert

            for index, (channel, value) in enumerate(writes):
                write_type, write_data = _serialized(self, value)
                statement = insert(CheckpointWriteModel).values(
                    owner_id=owner_id,
                    thread_id=thread_id,
                    checkpoint_ns=checkpoint_ns,
                    checkpoint_id=str(checkpoint_id),
                    task_id=task_id,
                    write_idx=WRITES_IDX_MAP.get(channel, index),
                    task_path=task_path,
                    channel=channel,
                    value_type=write_type,
                    value_data=write_data,
                )
                conflict = [
                    CheckpointWriteModel.owner_id,
                    CheckpointWriteModel.thread_id,
                    CheckpointWriteModel.checkpoint_ns,
                    CheckpointWriteModel.checkpoint_id,
                    CheckpointWriteModel.task_id,
                    CheckpointWriteModel.write_idx,
                ]
                if all(item[0] in WRITES_IDX_MAP for item in writes):
                    statement = statement.on_conflict_do_update(
                        index_elements=conflict,
                        set_={
                            "task_path": task_path,
                            "channel": channel,
                            "value_type": write_type,
                            "value_data": write_data,
                        },
                    )
                else:
                    statement = statement.on_conflict_do_nothing(index_elements=conflict)
                await session.execute(statement)

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        owner_id, thread_id, checkpoint_ns = _identity(config)
        configurable = config.get("configurable") or {}
        checkpoint_id = configurable.get("checkpoint_id")

        async with self.sessions() as session:
            query = select(CheckpointModel).where(
                CheckpointModel.owner_id == owner_id,
                CheckpointModel.thread_id == thread_id,
                CheckpointModel.checkpoint_ns == checkpoint_ns,
            )
            if checkpoint_id:
                query = query.where(CheckpointModel.checkpoint_id == str(checkpoint_id))
            else:
                query = query.order_by(CheckpointModel.checkpoint_id.desc()).limit(1)
            row = await session.scalar(query)
            if row is None:
                return None
            return await self._make_tuple(session, row)

    async def alist(
        self,
        config: RunnableConfig | None,
        *,
        filter: dict[str, Any] | None = None,
        before: RunnableConfig | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[CheckpointTuple]:
        if config is None:
            raise ValueError("Owner-scoped configuration is required to list checkpoints")
        owner_id = _owner_id(config)
        configurable = config.get("configurable") or {}
        thread_id = configurable.get("thread_id")
        checkpoint_ns = str(configurable.get("checkpoint_ns") or "")
        if limit is not None and limit <= 0:
            return
        query = select(CheckpointModel).where(CheckpointModel.owner_id == owner_id)
        if thread_id:
            query = query.where(CheckpointModel.thread_id == str(thread_id))
            query = query.where(CheckpointModel.checkpoint_ns == checkpoint_ns)
        elif "checkpoint_ns" in configurable:
            query = query.where(CheckpointModel.checkpoint_ns == checkpoint_ns)
        if before is not None:
            before_owner, before_thread, before_ns = _identity(before)
            if before_owner != owner_id or (thread_id and before_thread != thread_id):
                raise ValueError(
                    "before configuration must use the same checkpoint owner and thread"
                )
            if "checkpoint_ns" in (before.get("configurable") or {}):
                query = query.where(CheckpointModel.checkpoint_ns == before_ns)
            before_id = (before.get("configurable") or {}).get("checkpoint_id")
            if before_id:
                query = query.where(CheckpointModel.checkpoint_id < str(before_id))
        query = query.order_by(CheckpointModel.checkpoint_id.desc())

        async with self.sessions() as session:
            rows = (await session.scalars(query)).all()
            matched = 0
            for row in rows:
                item = await self._make_tuple(session, row)
                if filter and any(item.metadata.get(key) != value for key, value in filter.items()):
                    continue
                yield item
                matched += 1
                if limit is not None and matched >= limit:
                    break

    async def _make_tuple(
        self,
        session: AsyncSession,
        row: CheckpointModel,
    ) -> CheckpointTuple:
        checkpoint = _deserialized(self, row.checkpoint_type, row.checkpoint_data)
        metadata = _deserialized(self, row.metadata_type, row.metadata_data)
        pending_rows = (
            await session.scalars(
                select(CheckpointWriteModel)
                .where(
                    CheckpointWriteModel.owner_id == row.owner_id,
                    CheckpointWriteModel.thread_id == row.thread_id,
                    CheckpointWriteModel.checkpoint_ns == row.checkpoint_ns,
                    CheckpointWriteModel.checkpoint_id == row.checkpoint_id,
                )
                .order_by(CheckpointWriteModel.task_id, CheckpointWriteModel.write_idx)
            )
        ).all()
        pending_writes = [
            (
                pending.task_id,
                pending.channel,
                _deserialized(self, pending.value_type, pending.value_data),
            )
            for pending in pending_rows
        ]
        parent_config = None
        if row.parent_checkpoint_id:
            parent_config = self._config(
                row.owner_id,
                row.thread_id,
                row.checkpoint_ns,
                row.parent_checkpoint_id,
            )
        return CheckpointTuple(
            config=self._config(
                row.owner_id,
                row.thread_id,
                row.checkpoint_ns,
                row.checkpoint_id,
            ),
            checkpoint=checkpoint,
            metadata=metadata,
            parent_config=parent_config,
            pending_writes=pending_writes,
        )

    async def adelete(self, config: RunnableConfig) -> None:
        owner_id, thread_id, _checkpoint_ns = _identity(config)
        async with self.sessions() as session, session.begin():
            await session.execute(
                delete(CheckpointWriteModel).where(
                    CheckpointWriteModel.owner_id == owner_id,
                    CheckpointWriteModel.thread_id == thread_id,
                )
            )
            await session.execute(
                delete(CheckpointModel).where(
                    CheckpointModel.owner_id == owner_id,
                    CheckpointModel.thread_id == thread_id,
                )
            )

    async def adelete_thread(self, thread_id: str) -> None:
        # LangGraph's saver interface supplies only the thread ID. Resolve its trusted owner from
        # the service-owned registry, then keep deletion owner-scoped as a second guard.
        async with self.sessions() as session:
            owner_id = await session.scalar(
                select(ThreadOwnership.user_id).where(
                    ThreadOwnership.thread_id == thread_id
                )
            )
        if owner_id is None:
            return
        await self.adelete(
            {"configurable": {"thread_id": thread_id, "user_id": owner_id}}
        )
