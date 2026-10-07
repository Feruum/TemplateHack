import asyncio

import pytest

from agent.infrastructure.stream_admission import (
    AdmissionRejected,
    InMemoryAdmissionBackend,
    StreamAdmissionController,
)


def make_controller(
    *, global_limit: int = 100, per_user_limit: int = 3
) -> StreamAdmissionController:
    return StreamAdmissionController(
        InMemoryAdmissionBackend(
            global_limit=global_limit,
            per_user_limit=per_user_limit,
        ),
        global_limit=global_limit,
        per_user_limit=per_user_limit,
        wait_seconds=0,
        retry_after_seconds=7,
        lease_ttl_seconds=180,
        refresh_seconds=30,
    )


async def test_enforces_global_100_stream_limit() -> None:
    controller = make_controller(per_user_limit=100)
    leases = [await controller.acquire(f"user-{index}") for index in range(100)]

    with pytest.raises(AdmissionRejected) as exc_info:
        await controller.acquire("overflow-user")

    assert exc_info.value.reason == "global_limit"
    assert exc_info.value.retry_after_seconds == 7

    await asyncio.gather(*(lease.release() for lease in leases))


async def test_enforces_per_user_limit_and_release_is_idempotent() -> None:
    controller = make_controller(global_limit=10, per_user_limit=2)
    first = await controller.acquire("same-user")
    second = await controller.acquire("same-user")

    with pytest.raises(AdmissionRejected) as exc_info:
        await controller.acquire("same-user")
    assert exc_info.value.reason == "user_limit"

    await first.release()
    await first.release()
    replacement = await controller.acquire("same-user")

    await asyncio.gather(second.release(), replacement.release())


async def test_heartbeat_detects_lost_lease() -> None:
    controller = StreamAdmissionController(
        InMemoryAdmissionBackend(global_limit=1, per_user_limit=1),
        global_limit=1,
        per_user_limit=1,
        wait_seconds=0,
        retry_after_seconds=1,
        lease_ttl_seconds=1,
        refresh_seconds=0.01,
    )
    lease = await controller.acquire("user")
    await controller.backend.release(lease.user_id, lease.token)
    lost = asyncio.Event()

    heartbeat = asyncio.create_task(lease.heartbeat(lost))
    await asyncio.wait_for(lost.wait(), timeout=0.2)
    await heartbeat

    assert lost.is_set()
