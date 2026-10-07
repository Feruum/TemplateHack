# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim@sha256:e5b65587bce7de595f299855d7385fe7fca39b8a74baa261ba1b7147afa78e58 AS builder

WORKDIR /app

COPY pyproject.toml ./

ENV UV_HTTP_TIMEOUT=300
ENV UV_EXTRA_INDEX_URL="https://download.pytorch.org/whl/cpu"
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-install-project --index-strategy unsafe-best-match

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b

WORKDIR /app

ARG SERVICE_VERSION=1.0.0
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

LABEL org.opencontainers.image.source="https://github.com/StudyVerseApp/agentic-rag" \
      org.opencontainers.image.version="${SERVICE_VERSION}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.created="${BUILD_TIME}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src /app/src
COPY --from=builder /app/alembic.ini /app/alembic.ini
COPY --from=builder /app/migrations /app/migrations

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src:/app/src/agent/gen"
ENV SERVICE_VERSION=${SERVICE_VERSION}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_TIME=${BUILD_TIME}

RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/data/uploads && \
    chown -R appuser:appuser /app/data
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

CMD ["uvicorn", "agent.server:app", "--host", "0.0.0.0", "--port", "8000"]
