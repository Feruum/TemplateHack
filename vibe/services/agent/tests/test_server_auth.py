import pytest
from fastapi import HTTPException

from agent.config.settings import Settings
from agent.server_auth import get_current_user


@pytest.mark.asyncio
async def test_server_auth_requires_valid_key_and_forwarded_identity(monkeypatch):
    monkeypatch.setattr(Settings, "get_agent_api_keys", lambda self: ["service-key"])

    user = await get_current_user("service-key", "vibe-user-12")
    assert user.user_id == "vibe-user-12"

    with pytest.raises(HTTPException) as invalid_key:
        await get_current_user("wrong-key", "vibe-user-12")
    assert invalid_key.value.status_code == 401

    with pytest.raises(HTTPException) as missing_identity:
        await get_current_user("service-key", None)
    assert missing_identity.value.status_code == 401
