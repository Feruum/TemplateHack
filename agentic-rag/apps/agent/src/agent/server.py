"""Agent API Server - Production FastAPI application."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
import time
import secrets
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "gen"))

from agent.core.agent import Agent
from agent.build_info import SERVICE_VERSION, current_build_info
from agent.routes import admin, agent, health
from agent.server_auth import get_current_user
from agent.config.settings import settings
from agent.utils.logging import configure_logging
from agent.utils.observability import (
    configure_observability,
    instrument_fastapi,
    record_http_request,
)
from agent.utils.rate_limit import limiter
from agent.routes.health import increment_request_count, increment_error_count
from agent.gen.admin.v1.admin_connect import AdminServiceASGIApplication
from agent.services.admin import AdminService as AdminServiceImpl
from agent.infrastructure.stream_admission import create_stream_admission_controller


@asynccontextmanager
async def lifespan(app: FastAPI):
    stream_admission = await create_stream_admission_controller(
        redis_url=settings.redis_url,
        environment=settings.environment,
        global_limit=settings.stream_global_limit,
        per_user_limit=settings.stream_per_user_limit,
        wait_seconds=settings.stream_admission_wait_seconds,
        retry_after_seconds=settings.stream_retry_after_seconds,
        lease_ttl_seconds=settings.stream_lease_ttl_seconds,
        refresh_seconds=settings.stream_lease_refresh_seconds,
    )
    app.state.stream_admission = stream_admission
    try:
        async with Agent() as initialized_agent:
            app.state.agent = initialized_agent
            yield
    finally:
        await stream_admission.close()


configure_logging(level="DEBUG" if settings.debug else "INFO")
configure_observability()

app = FastAPI(
    title="Agent API",
    version=SERVICE_VERSION,
    description="Deimos LangGraph RAG agent",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
)
instrument_fastapi(app)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import structlog

    logger = structlog.get_logger(__name__)

    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
        )

    logger.exception(
        "unhandled_exception",
        request_id=getattr(request.state, "request_id", "unknown"),
        path=request.url.path,
        error_type=type(exc).__name__,
    )

    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error"},
    )


@app.middleware("http")
async def add_headers_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start_time = time.perf_counter()
    request.state.request_id = request_id
    increment_request_count()

    # Protect Connect-RPC admin mount
    if request.url.path.startswith("/admin.v1."):
        api_key = request.headers.get("X-API-Key") or ""
        auth_header = request.headers.get("Authorization", "")
        token = (
            auth_header.replace("Bearer ", "")
            if auth_header.startswith("Bearer ")
            else ""
        )
        candidate = api_key or token
        configured_keys = settings.get_agent_api_keys()
        if configured_keys and (
            not candidate
            or not any(secrets.compare_digest(candidate, k) for k in configured_keys)
        ):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    # Protect metrics in production
    if (
        request.url.path.startswith("/metrics")
        and settings.environment != "development"
    ):
        api_key = request.headers.get("X-API-Key") or ""
        auth_header = request.headers.get("Authorization", "")
        token = (
            auth_header.replace("Bearer ", "")
            if auth_header.startswith("Bearer ")
            else ""
        )
        candidate = api_key or token
        configured_keys = settings.get_agent_api_keys()
        if configured_keys and (
            not candidate
            or not any(secrets.compare_digest(candidate, k) for k in configured_keys)
        ):
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    try:
        response = await call_next(request)
    except Exception:
        increment_error_count()
        raise

    if response.status_code >= 400:
        increment_error_count()

    process_time = time.perf_counter() - start_time
    route = request.scope.get("route")
    route_path = getattr(route, "path", request.url.path)
    record_http_request(request.method, route_path, response.status_code, process_time)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = str(process_time)
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'"

    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "X-Request-ID",
    ],
    expose_headers=["X-Request-ID", "X-Process-Time"],
)

app.include_router(health.router)
app.include_router(agent.router, dependencies=[Depends(get_current_user)])
app.include_router(admin.router, dependencies=[Depends(get_current_user)])

admin_rpc_app = AdminServiceASGIApplication(AdminServiceImpl())
app.mount(admin_rpc_app.path, admin_rpc_app)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/version")
async def version_info():
    return current_build_info(settings.environment)


@app.get("/")
async def root():
    return {
        "name": "Deimos",
        "status": "operational",
    }


def main():
    import uvicorn

    configure_logging()
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
