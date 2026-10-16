"""Configuration for the local, Bun-proxied agent service."""

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AGENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: str = "development"
    debug: bool = False
    request_timeout: int = 60
    max_history_messages: int = 15

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_temperature: float = 0.3
    llm_max_tokens: int = 2048
    llm_timeout_seconds: float = 45.0
    llm_max_retries: int = 2
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = ""
    embedding_dimensions: int = 1024

    use_reranker: bool = False
    use_hybrid_search: bool = True
    retrieval_lexical_max_chunks: int = Field(default=2000, ge=1, le=10000)
    rerank_base_url: str = ""
    rerank_api_key: str = ""
    rerank_model: str = "reranker"
    retrieval_top_k_initial: int = 8
    retrieval_top_k_after_rerank: int = 4
    tool_max_concurrency: int = 4
    max_tool_rounds: int = 2
    agent_max_iterations: int = 5

    knowledge_backend: str = "chroma"
    chroma_host: str = "chroma"
    chroma_port: int = 8000
    chroma_collection_name: str = "hackathon_documents"
    chroma_persist_directory: str = "/data/chroma"
    upload_dir: str = "/data/uploads"
    ingestion_max_file_bytes: int = 25 * 1024 * 1024

    database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/agent"
    postgres_url: str = "postgresql://postgres:postgres@postgres:5432/agent?sslmode=disable"

    api_key: str = ""
    api_keys: str = ""
    max_request_body_mb: int = 30
    rate_limit: str = "60/minute"
    rate_limit_per_user: str = "30/minute"

    stream_global_limit: int = 100
    stream_per_user_limit: int = 3
    stream_admission_wait_seconds: float = 0.25
    stream_retry_after_seconds: int = 5
    stream_lease_ttl_seconds: int = 180
    stream_lease_refresh_seconds: int = 30
    redis_url: str = ""

    otlp_endpoint: str = ""
    otlp_insecure: bool = True
    otel_trace_sample_ratio: float = 0.0

    @model_validator(mode="after")
    def validate_local_configuration(self):
        if self.knowledge_backend != "chroma":
            raise ValueError("AGENT_KNOWLEDGE_BACKEND must be 'chroma'")
        if self.environment not in {"development", "test"}:
            raise ValueError("This starter agent service only supports local environments")
        if not 1 <= self.stream_global_limit <= 100:
            raise ValueError("stream_global_limit must be between 1 and 100")
        if not 1 <= self.stream_per_user_limit <= self.stream_global_limit:
            raise ValueError("stream_per_user_limit must be within the global limit")
        if self.stream_lease_refresh_seconds >= self.stream_lease_ttl_seconds:
            raise ValueError("stream lease refresh must be shorter than its TTL")
        if not 0 <= self.otel_trace_sample_ratio <= 1:
            raise ValueError("otel_trace_sample_ratio must be between 0 and 1")
        if self.ingestion_max_file_bytes < 1:
            raise ValueError("ingestion_max_file_bytes must be positive")
        return self

    def get_available_models(self) -> list[str]:
        return [self.llm_model] if self.llm_model else []

    def get_agent_api_keys(self) -> list[str]:
        values = [self.api_key.strip()] if self.api_key.strip() else []
        values.extend(
            key.strip() for key in self.api_keys.split(",") if key.strip()
        )
        return list(dict.fromkeys(values))

    def get_model_info(self, model: str | None = None) -> dict:
        model = model or self.llm_model
        return {
            "model": model,
            "context_window": 128000,
            "max_output": self.llm_max_tokens,
            "input_cost": 0.0,
            "output_cost": 0.0,
            "tier": "configured",
            "capabilities": ["chat"],
        }


settings = Settings()
