import pytest
import httpx
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request

from agent.config.settings import settings
from agent.server_auth import get_current_user


def make_request(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request({"type": "http", "headers": headers or []})


@pytest.fixture(autouse=True)
def reset_agent_api_keys(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "agent_api_key", None)
    monkeypatch.setattr(settings, "agent_api_keys", "")


@pytest.mark.asyncio
async def test_get_current_user_dev_mode_without_keys(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "environment", "development")

    user = await get_current_user(make_request(), api_key=None, credentials=None)
    assert user.user_id == "dev-user"
    assert user.role == "admin"


@pytest.mark.asyncio
async def test_get_current_user_accepts_x_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "agent_api_key", "primary-key")

    user = await get_current_user(
        make_request(), api_key="primary-key", credentials=None
    )

    assert user.user_id == "internal-api-client"
    assert user.role == "service"


@pytest.mark.asyncio
async def test_get_current_user_accepts_bearer_token(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "agent_api_key", "primary-key")

    user = await get_current_user(
        make_request(),
        api_key=None,
        credentials=HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="primary-key",
        ),
    )

    assert user.user_id == "internal-api-client"


@pytest.mark.asyncio
async def test_get_current_user_accepts_rotated_keys(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "agent_api_key", "primary-key")
    monkeypatch.setattr(settings, "agent_api_keys", "secondary-key, tertiary-key")

    user = await get_current_user(
        make_request(), api_key="tertiary-key", credentials=None
    )

    assert user.user_id == "internal-api-client"


@pytest.mark.asyncio
async def test_get_current_user_resolves_kratos_cookie(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "agent_api_key", "internal-key")

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url: str, headers: dict[str, str]):
            assert url.endswith("/sessions/whoami")
            assert headers["Cookie"] == "ory_session=browser-session"
            return httpx.Response(
                200,
                json={
                    "identity": {
                        "id": "kratos-user-id",
                        "traits": {"tenant_id": "studyverse", "role": "user"},
                    }
                },
            )

    monkeypatch.setattr(
        "agent.server_auth.httpx.AsyncClient", lambda **kwargs: FakeClient()
    )
    user = await get_current_user(
        make_request([(b"cookie", b"ory_session=browser-session")]),
        api_key=None,
        credentials=None,
    )
    assert user.user_id == "kratos-user-id"
    assert user.tenant_id == "studyverse"


@pytest.mark.asyncio
async def test_get_current_user_rejects_missing_credentials(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "agent_api_key", "primary-key")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(make_request(), api_key=None, credentials=None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing authentication credentials"


@pytest.mark.asyncio
async def test_get_current_user_rejects_invalid_credentials(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "agent_api_key", "primary-key")

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(make_request(), api_key="wrong-key", credentials=None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid authentication credentials"
