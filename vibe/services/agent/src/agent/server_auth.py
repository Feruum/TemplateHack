"""Authentication for trusted calls from the Bun API boundary."""

import re
import secrets
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Header, HTTPException
from starlette.status import HTTP_401_UNAUTHORIZED

from agent.config.settings import settings


@dataclass(frozen=True)
class UserProfile:
    """Identity asserted by the authenticated Bun backend."""

    user_id: str
    tenant_id: str = "local"
    role: str = "user"
    scopes: list[str] = field(default_factory=list)


def _is_valid_api_key(candidate: str, valid_keys: list[str]) -> bool:
    return any(secrets.compare_digest(candidate, value) for value in valid_keys)


async def get_current_user(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    x_user_id: Annotated[str | None, Header(alias="X-User-ID")] = None,
) -> UserProfile:
    """Require both the internal secret and the identity verified by Bun."""
    configured_keys = settings.get_agent_api_keys()
    if not configured_keys:
        raise HTTPException(status_code=503, detail="Agent service API key is not configured")
    if not x_api_key or not _is_valid_api_key(x_api_key, configured_keys):
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    if not x_user_id or not x_user_id.strip() or len(x_user_id) > 255:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="A trusted user identity is required",
        )
    user_id = x_user_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9._:@-]{1,255}", user_id):
        raise HTTPException(status_code=400, detail="Invalid trusted user identity")
    return UserProfile(user_id=user_id, scopes=["agent:invoke"])
