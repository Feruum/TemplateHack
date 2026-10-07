"""Durable user memory facade backed by PostgreSQL in production."""

from __future__ import annotations

from dataclasses import dataclass
import json
from threading import RLock
from typing import Any, Protocol
import uuid

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from agent.config.settings import settings


class MemoryStore(Protocol):
    def add(
        self, content: str, user_id: str, metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]: ...

    def search(self, query: str, user_id: str, limit: int) -> list[dict[str, Any]]: ...

    def get_all(self, user_id: str) -> list[dict[str, Any]]: ...

    def delete(self, memory_id: str) -> bool: ...

    def delete_all(self, user_id: str) -> bool: ...


class PostgresMemoryStore:
    def __init__(self) -> None:
        self._pool = ConnectionPool(
            conninfo=settings.postgres_url,
            min_size=0,
            max_size=5,
            kwargs={"row_factory": dict_row},
            open=False,
        )
        self._pool.open(wait=True)

    def add(
        self, content: str, user_id: str, metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        memory_id = str(uuid.uuid4())
        with self._pool.connection() as connection:
            connection.execute(
                """
                INSERT INTO agent_memories (id, user_id, content, metadata)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
                (memory_id, user_id, content, json.dumps(metadata or {})),
            )
        return {"id": memory_id, "memory": content, "metadata": metadata or {}}

    def search(self, query: str, user_id: str, limit: int) -> list[dict[str, Any]]:
        with self._pool.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, content AS memory, metadata, created_at
                FROM agent_memories
                WHERE user_id = %s
                ORDER BY
                  ts_rank(
                    to_tsvector('simple', content),
                    plainto_tsquery('simple', %s)
                  ) DESC,
                  created_at DESC
                LIMIT %s
                """,
                (user_id, query, max(1, min(limit, 50))),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_all(self, user_id: str) -> list[dict[str, Any]]:
        with self._pool.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, content AS memory, metadata, created_at
                FROM agent_memories WHERE user_id = %s
                ORDER BY created_at DESC LIMIT 1000
                """,
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete(self, memory_id: str) -> bool:
        with self._pool.connection() as connection:
            result = connection.execute(
                "DELETE FROM agent_memories WHERE id = %s", (memory_id,)
            )
        return result.rowcount > 0

    def delete_all(self, user_id: str) -> bool:
        with self._pool.connection() as connection:
            connection.execute(
                "DELETE FROM agent_memories WHERE user_id = %s", (user_id,)
            )
        return True


@dataclass
class _MemoryRecord:
    id: str
    content: str
    metadata: dict[str, Any]


class InMemoryMemoryStore:
    def __init__(self) -> None:
        self._records: dict[str, list[_MemoryRecord]] = {}
        self._lock = RLock()

    def add(
        self, content: str, user_id: str, metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        record = _MemoryRecord(str(uuid.uuid4()), content, metadata or {})
        with self._lock:
            self._records.setdefault(user_id, []).append(record)
        return {"id": record.id, "memory": content, "metadata": record.metadata}

    def search(self, query: str, user_id: str, limit: int) -> list[dict[str, Any]]:
        terms = query.casefold().split()
        with self._lock:
            records = list(self._records.get(user_id, []))
        records.sort(
            key=lambda record: sum(
                record.content.casefold().count(term) for term in terms
            ),
            reverse=True,
        )
        return [
            {"id": record.id, "memory": record.content, "metadata": record.metadata}
            for record in records[:limit]
        ]

    def get_all(self, user_id: str) -> list[dict[str, Any]]:
        return self.search("", user_id, 1000)

    def delete(self, memory_id: str) -> bool:
        with self._lock:
            for user_id, records in self._records.items():
                retained = [record for record in records if record.id != memory_id]
                if len(retained) != len(records):
                    self._records[user_id] = retained
                    return True
        return False

    def delete_all(self, user_id: str) -> bool:
        with self._lock:
            self._records.pop(user_id, None)
        return True


class AgentMemory:
    _instance: "AgentMemory | None" = None
    _store: MemoryStore | None = None

    def __new__(cls) -> "AgentMemory":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if AgentMemory._store is None:
            AgentMemory._store = (
                InMemoryMemoryStore()
                if settings.environment == "development"
                else PostgresMemoryStore()
            )

    @property
    def memory(self) -> MemoryStore:
        if AgentMemory._store is None:
            raise RuntimeError("Memory store is not initialized")
        return AgentMemory._store

    def add(
        self, content: str, user_id: str, metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self.memory.add(content, user_id, metadata)

    def search(self, query: str, user_id: str, limit: int = 5) -> list[dict[str, Any]]:
        return self.memory.search(query, user_id, limit)

    def get_all(self, user_id: str) -> list[dict[str, Any]]:
        return self.memory.get_all(user_id)

    def delete(self, memory_id: str) -> bool:
        return self.memory.delete(memory_id)

    def delete_all(self, user_id: str) -> bool:
        return self.memory.delete_all(user_id)
