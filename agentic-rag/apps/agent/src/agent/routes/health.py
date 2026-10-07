"""Deep health check endpoints for the agent service.

Provides both simple liveness checks and deep readiness checks
that verify all dependencies are available.
"""

import asyncio
import time
import os
import psutil
from typing import Literal

import structlog
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from sqlalchemy import text

from agent.config.settings import settings
from agent.infrastructure.database import engine
from agent.infrastructure.stream_admission import RedisAdmissionBackend

router = APIRouter(tags=["health"])
logger = structlog.get_logger(__name__)

_start_time = time.time()
_request_count = 0
_error_count = 0


def increment_request_count():
    global _request_count
    _request_count += 1


def increment_error_count():
    global _error_count
    _error_count += 1


class ComponentHealth(BaseModel):
    """Health status for a single component."""

    status: Literal["ok", "error"]
    message: str | None = None


class HealthStatus(BaseModel):
    """Overall health status response."""

    status: Literal["healthy", "degraded", "unhealthy"]
    checks: dict[str, ComponentHealth]


class MetricsResponse(BaseModel):
    """Runtime metrics response."""

    uptime_seconds: float
    request_count: int
    error_count: int
    memory_mb: float
    cpu_percent: float
    python_version: str
    model: str
    environment: str


@router.get("/health/live")
async def liveness_check() -> dict[str, str]:
    """Simple liveness check - just confirms the service is running."""
    return {"status": "ok"}


@router.get("/health/ready", response_model=HealthStatus)
async def readiness_check(request: Request, response: Response) -> HealthStatus:
    """Bounded checks for dependencies required to accept traffic."""
    checks: dict[str, ComponentHealth] = {}
    overall: Literal["healthy", "degraded", "unhealthy"] = "healthy"

    try:
        async with asyncio.timeout(2):
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        checks["postgres"] = ComponentHealth(status="ok")
    except Exception as error:
        checks["postgres"] = ComponentHealth(status="error", message=_safe_error(error))
        overall = "unhealthy"

    try:
        backend = request.app.state.stream_admission.backend
        if isinstance(backend, RedisAdmissionBackend):
            async with asyncio.timeout(2):
                await backend.ping()
            checks["redis"] = ComponentHealth(status="ok")
        elif settings.environment == "development":
            checks["redis"] = ComponentHealth(status="ok", message="in-memory")
        else:
            raise RuntimeError("distributed admission backend is not active")
    except Exception as error:
        checks["redis"] = ComponentHealth(status="error", message=_safe_error(error))
        overall = "unhealthy"

    try:
        from agent.knowledge import get_knowledge_index

        async with asyncio.timeout(2):
            await asyncio.to_thread(get_knowledge_index().healthcheck)
        checks["knowledge_index"] = ComponentHealth(status="ok")
    except Exception as error:
        checks["knowledge_index"] = ComponentHealth(
            status="error", message=_safe_error(error)
        )
        overall = "unhealthy"

    if overall == "unhealthy":
        response.status_code = 503

    logger.info(
        "health_check_complete",
        status=overall,
        checks={k: v.status for k, v in checks.items()},
    )

    return HealthStatus(status=overall, checks=checks)


def _safe_error(error: Exception) -> str:
    if settings.environment == "development":
        return str(error)
    return type(error).__name__


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics(request: Request) -> MetricsResponse:
    """Get runtime metrics for monitoring and debugging."""
    import sys

    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()

    return MetricsResponse(
        uptime_seconds=time.time() - _start_time,
        request_count=_request_count,
        error_count=_error_count,
        memory_mb=memory_info.rss / (1024 * 1024),
        cpu_percent=process.cpu_percent(),
        python_version=sys.version.split()[0],
        model=settings.llm_model,
        environment=settings.environment,
    )


@router.get("/metrics/prometheus")
async def get_prometheus_metrics() -> str:
    """Get metrics in Prometheus text format."""
    import sys

    process = psutil.Process(os.getpid())
    memory_info = process.memory_info()
    uptime = time.time() - _start_time

    lines = [
        "# HELP agent_uptime_seconds Time since agent started",
        "# TYPE agent_uptime_seconds gauge",
        f"agent_uptime_seconds {uptime}",
        "",
        "# HELP agent_requests_total Total number of requests",
        "# TYPE agent_requests_total counter",
        f"agent_requests_total {_request_count}",
        "",
        "# HELP agent_errors_total Total number of errors",
        "# TYPE agent_errors_total counter",
        f"agent_errors_total {_error_count}",
        "",
        "# HELP agent_memory_bytes Memory usage in bytes",
        "# TYPE agent_memory_bytes gauge",
        f"agent_memory_bytes {memory_info.rss}",
        "",
        "# HELP agent_cpu_percent CPU usage percentage",
        "# TYPE agent_cpu_percent gauge",
        f"agent_cpu_percent {process.cpu_percent()}",
        "",
        "# HELP agent_info Agent information",
        "# TYPE agent_info gauge",
        f'agent_info{{python_version="{sys.version.split()[0]}",model="{settings.llm_model}",environment="{settings.environment}"}} 1',
    ]

    return "\n".join(lines)
