from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = Path(__file__).parent.parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AGENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: str = "production"
    debug: bool = False
    request_timeout: int = 60
    max_history_messages: int = 15

    # Alem OpenAI-compatible APIs. AGENT_LLM_* is the only supported LLM config.
    llm_base_url: str = "https://llm.alem.ai/v1"
    llm_api_key: str = ""
    llm_model: str = "gemma4"
    llm_temperature: float = 0.6
    llm_max_tokens: int = 2048
    llm_timeout_seconds: float = 45.0
    llm_max_retries: int = 2
    embedding_api_key: str = ""
    embedding_model: str = "text-1024"
    rerank_api_key: str = ""
    rerank_model: str = "reranker"
    use_reranker: bool = True

    knowledge_backend: str = "azure_search"
    azure_search_endpoint: str = ""
    azure_search_index: str = "deimos-knowledge-v1"
    azure_search_semantic_configuration: str = "deimos-semantic"
    embedding_dimensions: int = 1024
    azure_client_id: str = ""
    blob_account_url: str = ""
    blob_document_container: str = "private-documents"
    service_bus_fully_qualified_namespace: str = ""
    ingestion_queue: str = "document-ingestion"
    ingestion_max_file_bytes: int = 25 * 1024 * 1024
    ingestion_max_delivery_count: int = 10

    chroma_persist_directory: str = "./data/chroma"
    chroma_collection_name: str = "agent_memory"
    chroma_host: str = "chroma"
    chroma_port: int = 8000
    upload_dir: str = "./data/uploads"

    retrieval_top_k_initial: int = 8
    retrieval_top_k_after_rerank: int = 2
    use_hybrid_search: bool = True
    hybrid_rrf_k: int = 60
    tool_max_concurrency: int = 4

    agent_name: str = "Deimos"
    agent_max_iterations: int = 5
    max_tool_rounds: int = 2
    agent_api_keys: str = ""
    agent_api_key: str | None = None

    allowed_origins: str = (
        "http://localhost:3000,https://map.studyverse.app,https://admin.studyverse.app"
    )
    max_request_body_mb: int = 10
    rate_limit: str = "60/minute"
    rate_limit_per_user: str = "30/minute"

    ems_backend_url: str = "http://localhost:5555"
    kratos_public_url: str = "http://localhost:4433"

    database_url: str = "postgresql+asyncpg://postgres:postgres@postgres:5432/agent"
    postgres_url: str = (
        "postgresql://postgres:postgres@postgres:5432/agent?sslmode=disable"
    )
    redis_url: str = "redis://redis:6379/0"

    stream_global_limit: int = 100
    stream_per_user_limit: int = 3
    stream_admission_wait_seconds: float = 0.25
    stream_retry_after_seconds: int = 5
    stream_lease_ttl_seconds: int = 180
    stream_lease_refresh_seconds: int = 30

    otlp_endpoint: str = "http://otel-collector:4317"
    otlp_insecure: bool = True
    otel_trace_sample_ratio: float = 0.1

    @model_validator(mode="after")
    def _validate_production_safety(self):
        if not 1 <= self.stream_global_limit <= 100:
            raise ValueError("stream_global_limit must be between 1 and 100")
        if not 1 <= self.stream_per_user_limit <= self.stream_global_limit:
            raise ValueError(
                "stream_per_user_limit must be between 1 and stream_global_limit"
            )
        if self.stream_lease_refresh_seconds >= self.stream_lease_ttl_seconds:
            raise ValueError(
                "stream_lease_refresh_seconds must be less than stream_lease_ttl_seconds"
            )
        if not 0 <= self.otel_trace_sample_ratio <= 1:
            raise ValueError("otel_trace_sample_ratio must be between 0 and 1")
        if self.environment != "development":
            if self.database_url.startswith("sqlite"):
                raise ValueError("SQLite is prohibited outside development")
            if not self.postgres_url:
                raise ValueError("AGENT_POSTGRES_URL is required outside development")
            if not self.redis_url:
                raise ValueError("AGENT_REDIS_URL is required outside development")
            if self.knowledge_backend != "azure_search":
                raise ValueError("Azure AI Search is required outside development")
            if not self.azure_search_endpoint.startswith("https://"):
                raise ValueError(
                    "AGENT_AZURE_SEARCH_ENDPOINT must be an HTTPS endpoint outside development"
                )
            if not self.blob_account_url.startswith("https://"):
                raise ValueError(
                    "AGENT_BLOB_ACCOUNT_URL must be an HTTPS endpoint outside development"
                )
            if not self.service_bus_fully_qualified_namespace.endswith(
                ".servicebus.windows.net"
            ):
                raise ValueError(
                    "AGENT_SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE must be an Azure Service Bus namespace outside development"
                )
            if not self.kratos_public_url.startswith("https://"):
                raise ValueError(
                    "AGENT_KRATOS_PUBLIC_URL must be an HTTPS endpoint outside development"
                )
        if self.knowledge_backend not in {"azure_search", "chroma", "memory"}:
            raise ValueError(
                "knowledge_backend must be one of azure_search, chroma, or memory"
            )
        if self.embedding_dimensions < 1:
            raise ValueError("embedding_dimensions must be positive")
        if self.ingestion_max_file_bytes < 1:
            raise ValueError("ingestion_max_file_bytes must be positive")
        if self.ingestion_max_delivery_count < 1:
            raise ValueError("ingestion_max_delivery_count must be positive")
        return self

    def get_available_models(self) -> list[str]:
        return [self.llm_model]

    def get_agent_api_keys(self) -> list[str]:
        keys: list[str] = []

        if self.agent_api_key and self.agent_api_key.strip():
            keys.append(self.agent_api_key.strip())

        if self.agent_api_keys:
            keys.extend(
                key.strip() for key in self.agent_api_keys.split(",") if key.strip()
            )

        return list(dict.fromkeys(keys))

    def get_model_info(self, model: str | None = None) -> dict:
        model = model or self.llm_model
        return {
            "model": model,
            "context_window": 128000,
            "max_output": 4096,
            "input_cost": 0.0,
            "output_cost": 0.0,
            "tier": "free",
            "capabilities": ["chat"],
        }


settings = Settings()
