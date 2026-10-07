"""Admission control for concurrent agent streams."""

from __future__ import annotations

import asyncio
import hashlib
import math
import time
import uuid
from dataclasses import dataclass
from typing import Protocol

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)


class AdmissionRejected(Exception):
    """Raised when a stream cannot be admitted within the bounded wait."""

    def __init__(self, retry_after_seconds: int, reason: str) -> None:
        super().__init__(reason)
        self.retry_after_seconds = retry_after_seconds
        self.reason = reason


class AdmissionBackend(Protocol):
    async def try_acquire(self, user_id: str, token: str, expires_at_ms: int) -> str:
        """Return acquired, global_limit, or user_limit."""

    async def renew(self, user_id: str, token: str, expires_at_ms: int) -> bool: ...

    async def release(self, user_id: str, token: str) -> None: ...

    async def close(self) -> None: ...


@dataclass(slots=True)
class StreamLease:
    controller: "StreamAdmissionController"
    user_id: str
    token: str
    _released: bool = False

    async def heartbeat(self, lost: asyncio.Event) -> None:
        """Refresh the lease until canceled and signal if ownership is lost."""
        try:
            while True:
                await asyncio.sleep(self.controller.refresh_seconds)
                renewed = await self.controller._renew(self)
                if not renewed:
                    lost.set()
                    logger.error(
                        "stream_admission_lease_lost",
                        user_id=self.user_id,
                        lease_id=self.token,
                    )
                    return
        except asyncio.CancelledError:
            raise
        except Exception:
            lost.set()
            logger.exception(
                "stream_admission_heartbeat_failed",
                user_id=self.user_id,
                lease_id=self.token,
            )

    async def release(self) -> None:
        if self._released:
            return
        self._released = True
        await self.controller._release(self)


class StreamAdmissionController:
    """Bounded-wait controller shared by every API replica through Redis."""

    def __init__(
        self,
        backend: AdmissionBackend,
        *,
        global_limit: int,
        per_user_limit: int,
        wait_seconds: float,
        retry_after_seconds: int,
        lease_ttl_seconds: int,
        refresh_seconds: int,
    ) -> None:
        self.backend = backend
        self.global_limit = global_limit
        self.per_user_limit = per_user_limit
        self.wait_seconds = wait_seconds
        self.retry_after_seconds = retry_after_seconds
        self.lease_ttl_seconds = lease_ttl_seconds
        self.refresh_seconds = refresh_seconds

    async def acquire(self, user_id: str) -> StreamLease:
        token = uuid.uuid4().hex
        deadline = asyncio.get_running_loop().time() + self.wait_seconds
        last_reason = "global_limit"
        attempt = 0

        while True:
            expires_at_ms = self._expires_at_ms()
            last_reason = await self.backend.try_acquire(user_id, token, expires_at_ms)
            if last_reason == "acquired":
                return StreamLease(controller=self, user_id=user_id, token=token)

            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise AdmissionRejected(
                    retry_after_seconds=self.retry_after_seconds,
                    reason=last_reason,
                )
            # Keep the admission wait short, but do not turn a full service into
            # a synchronized Redis polling storm. The delay is capped well below
            # the configured wait budget so a released lease is still admitted
            # promptly.
            backoff = min(0.025 * (2**min(attempt, 2)), 0.1)
            attempt += 1
            await asyncio.sleep(min(backoff, remaining))

    async def _renew(self, lease: StreamLease) -> bool:
        return await self.backend.renew(
            lease.user_id, lease.token, self._expires_at_ms()
        )

    async def _release(self, lease: StreamLease) -> None:
        await self.backend.release(lease.user_id, lease.token)

    async def close(self) -> None:
        await self.backend.close()

    def _expires_at_ms(self) -> int:
        return math.ceil((time.time() + self.lease_ttl_seconds) * 1000)


class RedisAdmissionBackend:
    """Atomic lease accounting using Redis sorted sets and Lua."""

    _ACQUIRE = """
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local token = ARGV[3]
local global_limit = tonumber(ARGV[4])
local user_limit = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= global_limit then return 2 end
if redis.call('ZCARD', KEYS[2]) >= user_limit then return 3 end
redis.call('ZADD', KEYS[1], expires, token)
redis.call('ZADD', KEYS[2], expires, token)
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', KEYS[2], ttl)
return 1
"""

    _RENEW = """
local token = ARGV[1]
local expires = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if redis.call('ZSCORE', KEYS[1], token) == false then return 0 end
if redis.call('ZSCORE', KEYS[2], token) == false then return 0 end
redis.call('ZADD', KEYS[1], expires, token)
redis.call('ZADD', KEYS[2], expires, token)
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', KEYS[2], ttl)
return 1
"""

    _RELEASE = """
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
"""

    def __init__(
        self,
        redis: Redis,
        *,
        global_limit: int,
        per_user_limit: int,
        lease_ttl_seconds: int,
        namespace: str = "deimos",
    ) -> None:
        self.redis = redis
        self.global_limit = global_limit
        self.per_user_limit = per_user_limit
        self.lease_ttl_ms = lease_ttl_seconds * 1000
        self.global_key = f"{namespace}:{{streams}}:global"
        self.user_key_prefix = f"{namespace}:{{streams}}:user:"

    async def ping(self) -> None:
        await self.redis.ping()

    async def try_acquire(self, user_id: str, token: str, expires_at_ms: int) -> str:
        now_ms = math.floor(time.time() * 1000)
        result = await self.redis.eval(
            self._ACQUIRE,
            2,
            self.global_key,
            self._user_key(user_id),
            now_ms,
            expires_at_ms,
            token,
            self.global_limit,
            self.per_user_limit,
            self.lease_ttl_ms,
        )
        return {1: "acquired", 2: "global_limit", 3: "user_limit"}.get(
            int(result), "global_limit"
        )

    async def renew(self, user_id: str, token: str, expires_at_ms: int) -> bool:
        result = await self.redis.eval(
            self._RENEW,
            2,
            self.global_key,
            self._user_key(user_id),
            token,
            expires_at_ms,
            self.lease_ttl_ms,
        )
        return bool(result)

    async def release(self, user_id: str, token: str) -> None:
        await self.redis.eval(
            self._RELEASE,
            2,
            self.global_key,
            self._user_key(user_id),
            token,
        )

    async def close(self) -> None:
        await self.redis.aclose()

    def _user_key(self, user_id: str) -> str:
        digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
        return f"{self.user_key_prefix}{digest}"


class InMemoryAdmissionBackend:
    """Hermetic development/test substitute with the same lease semantics."""

    def __init__(self, *, global_limit: int, per_user_limit: int) -> None:
        self.global_limit = global_limit
        self.per_user_limit = per_user_limit
        self._global: dict[str, int] = {}
        self._users: dict[str, dict[str, int]] = {}
        self._lock = asyncio.Lock()

    async def try_acquire(self, user_id: str, token: str, expires_at_ms: int) -> str:
        async with self._lock:
            self._remove_expired()
            user_leases = self._users.setdefault(user_id, {})
            if len(self._global) >= self.global_limit:
                return "global_limit"
            if len(user_leases) >= self.per_user_limit:
                return "user_limit"
            self._global[token] = expires_at_ms
            user_leases[token] = expires_at_ms
            return "acquired"

    async def renew(self, user_id: str, token: str, expires_at_ms: int) -> bool:
        async with self._lock:
            if token not in self._global or token not in self._users.get(user_id, {}):
                return False
            self._global[token] = expires_at_ms
            self._users[user_id][token] = expires_at_ms
            return True

    async def release(self, user_id: str, token: str) -> None:
        async with self._lock:
            self._global.pop(token, None)
            user_leases = self._users.get(user_id)
            if user_leases is not None:
                user_leases.pop(token, None)
                if not user_leases:
                    self._users.pop(user_id, None)

    async def close(self) -> None:
        return None

    def _remove_expired(self) -> None:
        now_ms = math.floor(time.time() * 1000)
        expired = {
            token for token, expires_at in self._global.items() if expires_at <= now_ms
        }
        for token in expired:
            self._global.pop(token, None)
        for user_id, leases in list(self._users.items()):
            for token in expired:
                leases.pop(token, None)
            if not leases:
                self._users.pop(user_id, None)


async def create_stream_admission_controller(
    *,
    redis_url: str,
    environment: str,
    global_limit: int,
    per_user_limit: int,
    wait_seconds: float,
    retry_after_seconds: int,
    lease_ttl_seconds: int,
    refresh_seconds: int,
) -> StreamAdmissionController:
    if redis_url:
        redis = Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )
        backend = RedisAdmissionBackend(
            redis,
            global_limit=global_limit,
            per_user_limit=per_user_limit,
            lease_ttl_seconds=lease_ttl_seconds,
        )
        try:
            await backend.ping()
        except Exception:
            await backend.close()
            if environment != "development":
                raise
            logger.warning("redis_unavailable_using_in_memory_admission")
        else:
            logger.info(
                "redis_stream_admission_ready",
                global_limit=global_limit,
                per_user_limit=per_user_limit,
            )
            return StreamAdmissionController(
                backend,
                global_limit=global_limit,
                per_user_limit=per_user_limit,
                wait_seconds=wait_seconds,
                retry_after_seconds=retry_after_seconds,
                lease_ttl_seconds=lease_ttl_seconds,
                refresh_seconds=refresh_seconds,
            )

    if environment != "development":
        raise RuntimeError("Redis stream admission is required outside development")

    return StreamAdmissionController(
        InMemoryAdmissionBackend(
            global_limit=global_limit,
            per_user_limit=per_user_limit,
        ),
        global_limit=global_limit,
        per_user_limit=per_user_limit,
        wait_seconds=wait_seconds,
        retry_after_seconds=retry_after_seconds,
        lease_ttl_seconds=lease_ttl_seconds,
        refresh_seconds=refresh_seconds,
    )
