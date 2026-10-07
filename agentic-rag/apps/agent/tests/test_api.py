"""Integration tests for Agent API v1."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessageChunk

from agent.routes.agent import _extract_message_chunks
from agent.server_auth import UserProfile, get_current_user


def test_extract_message_chunks_reads_nvidia_reasoning_content():
    chunk = AIMessageChunk(
        content="", additional_kwargs={"reasoning_content": "thinking"}
    )

    assert _extract_message_chunks(chunk) == [("thinking", "thinking")]


def test_extract_message_chunks_reads_reasoning_and_text_blocks():
    chunk = AIMessageChunk(
        content=[
            {"type": "reasoning", "reasoning": "thinking"},
            {"type": "text", "text": "final"},
        ]
    )

    assert _extract_message_chunks(chunk) == [
        ("thinking", "thinking"),
        ("token", "final"),
    ]


@pytest.fixture
def mock_agent():
    agent = MagicMock()
    agent.get_thread_history = AsyncMock(
        return_value=[
            {"role": "human", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
    )
    agent.delete_thread = AsyncMock(return_value=True)
    agent.astream = AsyncMock()
    return agent


@pytest.fixture
def app_with_mock_agent(mock_agent):
    with (
        patch("agent.core.agent.Agent") as MockAgent,
        patch(
            "agent.routes.agent.check_thread_access", new=AsyncMock(return_value=True)
        ),
        patch(
            "agent.routes.agent.ensure_thread_ownership",
            new=AsyncMock(return_value=True),
        ),
    ):
        mock_instance = MagicMock()
        mock_instance.__aenter__ = AsyncMock(return_value=mock_agent)
        mock_instance.__aexit__ = AsyncMock(return_value=None)
        MockAgent.return_value = mock_instance

        from agent.server import app

        app.state.agent = mock_agent
        app.dependency_overrides[get_current_user] = lambda: UserProfile(
            user_id="test-user",
            tenant_id="test-tenant",
            role="admin",
        )
        try:
            yield app
        finally:
            app.dependency_overrides.clear()


class TestHealthEndpoints:
    def test_health_check(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_liveness_check(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_version_metadata(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/version")
        assert response.status_code == 200
        assert response.json()["service"] == "agent"
        assert response.json()["version"] == "1.0.0"


class TestMetricsEndpoints:
    def test_metrics_endpoint(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/metrics")
        assert response.status_code == 200
        data = response.json()
        assert "uptime_seconds" in data
        assert "memory_mb" in data
        assert "request_count" in data

    def test_prometheus_metrics(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/metrics/prometheus")
        assert response.status_code == 200
        assert "agent_uptime_seconds" in response.text


class TestModelsEndpoints:
    def test_list_all_models(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/api/v1/models")
        assert response.status_code == 200
        data = response.json()
        assert "models" in data
        assert "default_model" in data
        assert len(data["models"]) == 1

    def test_get_current_model(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/api/v1/models/current")
        assert response.status_code == 200
        data = response.json()
        assert "model" in data
        assert "temperature" in data

    def test_get_free_model(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/api/v1/models/mistral-small-latest")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "mistral-small-latest"
        assert data["tier"] == "free"

    def test_get_paid_model(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/api/v1/models/mistral-large-latest")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "mistral-large-latest"
        assert data["tier"] == "free"
        assert data["context_window"] == 128000

    def test_get_invalid_model(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/api/v1/models/nonexistent-model")
        assert response.status_code == 200


class TestThreadEndpoints:
    def test_get_thread_history(self, app_with_mock_agent, mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/api/v1/threads/test-thread-123")
        assert response.status_code == 200
        data = response.json()
        assert data["thread_id"] == "test-thread-123"
        mock_agent.get_thread_history.assert_called_once_with("test-thread-123")

    def test_delete_thread(self, app_with_mock_agent, mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.delete("/api/v1/threads/test-thread-123")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

    def test_delete_thread_failure(self, app_with_mock_agent, mock_agent):
        mock_agent.delete_thread.return_value = False
        client = TestClient(app_with_mock_agent)
        response = client.delete("/api/v1/threads/test-thread-456")
        assert response.status_code == 500


class TestTokenizeEndpoint:
    def test_tokenize(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.post("/api/v1/tokenize", json={"text": "Hello world!"})
        assert response.status_code == 200
        data = response.json()
        assert "tokens" in data
        assert data["tokens"] == 3


class TestRootEndpoint:
    def test_root_returns_api_info(self, app_with_mock_agent):
        client = TestClient(app_with_mock_agent)
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data == {"name": "Deimos", "status": "operational"}
