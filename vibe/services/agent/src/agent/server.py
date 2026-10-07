"""Internal FastAPI service called through the Bun authenticated API."""

from contextlib import AsyncExitStack, asynccontextmanager
import time
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from agent import build_info
from agent.config.settings import settings
from agent.core.agent import Agent
from agent.infrastructure.database import engine, initialize_database
from agent.infrastructure.ingestion import resume_ingestion_jobs
from agent.infrastructure.stream_admission import create_stream_admission_controller
from agent.infrastructure.thread_ownership import ThreadOwnership  # noqa: F401
from agent.modules.registry import get_modules
from agent.routes import admin, agent, health
from agent.server_auth import get_current_user
from agent.utils.logging import configure_logging
from agent.utils.observability import (
    configure_observability,
    instrument_fastapi,
    record_http_request,
)
from agent.utils.rate_limit import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_database()
    await resume_ingestion_jobs()
    admission = await create_stream_admission_controller(
        redis_url=settings.redis_url,
        environment=settings.environment,
        global_limit=settings.stream_global_limit,
        per_user_limit=settings.stream_per_user_limit,
        wait_seconds=settings.stream_admission_wait_seconds,
        retry_after_seconds=settings.stream_retry_after_seconds,
        lease_ttl_seconds=settings.stream_lease_ttl_seconds,
        refresh_seconds=settings.stream_lease_refresh_seconds,
    )
    app.state.stream_admission = admission
    try:
        async with AsyncExitStack() as stack:
            app.state.agents = {}
            if settings.llm_base_url and settings.llm_api_key and settings.llm_model:
                for module in get_modules():
                    app.state.agents[module.id] = await stack.enter_async_context(Agent(module.id))
            else:
                import structlog

                structlog.get_logger(__name__).warning(
                    "agent_chat_disabled",
                    reason="Set AGENT_LLM_BASE_URL, AGENT_LLM_API_KEY, and AGENT_LLM_MODEL",
                )
            yield
    finally:
        await admission.close()
        await engine.dispose()


configure_logging(level="DEBUG" if settings.debug else "INFO")
configure_observability()

app = FastAPI(
    title="Hackathon Agent Service",
    version=build_info.SERVICE_VERSION,
    description="Internal modular LangGraph service. Use the Bun API as the client boundary.",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
instrument_fastapi(app)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import structlog

    logger = structlog.get_logger(__name__)
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
    logger.exception(
        "unhandled_exception",
        request_id=getattr(request.state, "request_id", "unknown"),
        path=request.url.path,
        error_type=type(exc).__name__,
    )
    return JSONResponse(status_code=500, content={"error": "Internal Server Error"})


@app.middleware("http")
async def add_headers_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    started = time.perf_counter()
    request.state.request_id = request_id
    health.increment_request_count()
    try:
        response = await call_next(request)
    except Exception:
        health.increment_error_count()
        raise
    if response.status_code >= 400:
        health.increment_error_count()
    route = request.scope.get("route")
    route_path = getattr(route, "path", request.url.path)
    record_http_request(request.method, route_path, response.status_code, time.perf_counter() - started)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = str(time.perf_counter() - started)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


app.include_router(health.router)
app.include_router(agent.router, dependencies=[Depends(get_current_user)])
app.include_router(admin.router, dependencies=[Depends(get_current_user)])


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/version")
async def version_info():
    return build_info.current_build_info(settings.environment)


@app.get("/")
async def root():
    return {"name": "Hackathon Agent Service", "status": "operational"}


def main():
    import uvicorn

    configure_logging()
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
