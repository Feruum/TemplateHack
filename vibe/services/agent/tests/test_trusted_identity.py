import pytest
from fastapi import HTTPException

from agent.config.settings import Settings
from agent.routes.agent import ChatRequest, ChatMessage
from agent.server_auth import get_current_user


@pytest.mark.asyncio
async def test_valid_internal_key_uses_forwarded_user_id(monkeypatch):
    monkeypatch.setattr(Settings, "get_agent_api_keys", lambda self: ["internal-test-key"])

    user = await get_current_user("internal-test-key", "user-123")

    assert user.user_id == "user-123"


@pytest.mark.asyncio
async def test_invalid_key_and_missing_identity_are_rejected(monkeypatch):
    monkeypatch.setattr(Settings, "get_agent_api_keys", lambda self: ["internal-test-key"])

    with pytest.raises(HTTPException) as invalid_key:
        await get_current_user("wrong-key", "user-123")
    assert invalid_key.value.status_code == 401

    with pytest.raises(HTTPException) as missing_identity:
        await get_current_user("internal-test-key", None)
    assert missing_identity.value.status_code == 401


def test_client_user_id_field_is_ignored():
    body = ChatRequest(
        messages=[ChatMessage(type="human", content="hello")],
        module_id="rag",
        user_id="forged-user",
    )

    assert not hasattr(body, "user_id")
