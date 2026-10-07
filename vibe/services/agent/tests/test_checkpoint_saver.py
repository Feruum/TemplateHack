import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from agent.infrastructure.checkpoint_saver import SQLAlchemyCheckpointSaver
from agent.infrastructure.database import Base
from agent.infrastructure.thread_ownership import ThreadOwnership  # noqa: F401


@pytest.mark.asyncio
async def test_checkpoint_and_pending_writes_are_isolated_by_owner():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    saver = SQLAlchemyCheckpointSaver(async_sessionmaker(engine, expire_on_commit=False))
    first_config = {
        "configurable": {
            "thread_id": "shared-thread-id",
            "user_id": "user-one",
            "checkpoint_ns": "",
        }
    }
    second_config = {
        "configurable": {
            "thread_id": "shared-thread-id",
            "user_id": "user-two",
            "checkpoint_ns": "",
        }
    }
    shared_checkpoint = {
        "v": 1,
        "id": "same-checkpoint-id",
        "ts": "2026-01-01T00:00:00+00:00",
        "channel_values": {"messages": ["private state"]},
        "channel_versions": {},
        "versions_seen": {},
        "pending_sends": [],
        "updated_channels": None,
    }

    first_saved = await saver.aput(first_config, shared_checkpoint, {"step": 1}, {})
    second_saved = await saver.aput(second_config, shared_checkpoint, {"step": 1}, {})
    await saver.aput_writes(first_saved, [("messages", "private pending write")], "task-one")

    first_loaded = await saver.aget_tuple(first_saved)
    second_loaded = await saver.aget_tuple(second_saved)
    assert first_loaded is not None
    assert first_loaded.checkpoint["channel_values"]["messages"] == ["private state"]
    assert first_loaded.pending_writes == [("task-one", "messages", "private pending write")]
    assert second_loaded is not None
    assert second_loaded.checkpoint["channel_values"]["messages"] == ["private state"]
    assert second_loaded.pending_writes == []
    first_owner_checkpoints = [
        item
        async for item in saver.alist({"configurable": {"user_id": "user-one"}})
    ]
    assert [item.config["configurable"]["user_id"] for item in first_owner_checkpoints] == [
        "user-one"
    ]

    await saver.adelete(first_saved)
    assert await saver.aget_tuple(first_saved) is None
    assert await saver.aget_tuple(second_saved) is not None

    async with saver.sessions() as session, session.begin():
        session.add(
            ThreadOwnership(
                thread_id="shared-thread-id",
                user_id="user-one",
                module_id="rag",
            )
        )
    await saver.adelete_thread("shared-thread-id")
    assert await saver.aget_tuple(first_saved) is None
    assert await saver.aget_tuple(second_saved) is not None

    await engine.dispose()


@pytest.mark.asyncio
async def test_checkpoint_survives_engine_restart(tmp_path):
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'agent.sqlite3'}"
    first_engine = create_async_engine(database_url)
    async with first_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    checkpoint = {
        "v": 1,
        "id": "durable-checkpoint-id",
        "ts": "2026-01-01T00:00:00+00:00",
        "channel_values": {"messages": ["persisted state"]},
        "channel_versions": {},
        "versions_seen": {},
        "pending_sends": [],
        "updated_channels": None,
    }
    saver = SQLAlchemyCheckpointSaver(
        async_sessionmaker(first_engine, expire_on_commit=False)
    )
    saved_config = await saver.aput(
        {
            "configurable": {
                "thread_id": "durable-thread",
                "user_id": "durable-user",
            }
        },
        checkpoint,
        {"source": "input", "step": 1},
        {},
    )
    await first_engine.dispose()

    second_engine = create_async_engine(database_url)
    async with second_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    reopened_saver = SQLAlchemyCheckpointSaver(
        async_sessionmaker(second_engine, expire_on_commit=False)
    )

    loaded = await reopened_saver.aget_tuple(saved_config)
    assert loaded is not None
    assert loaded.checkpoint["channel_values"]["messages"] == ["persisted state"]
    assert loaded.config["configurable"]["user_id"] == "durable-user"

    await second_engine.dispose()
