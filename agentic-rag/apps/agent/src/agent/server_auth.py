"""Security middleware for the API."""

import secrets
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import HTTPException, Security
from fastapi import Request
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
import httpx
from starlette.status import HTTP_401_UNAUTHORIZED

from agent.config.settings import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_security = HTTPBearer(auto_error=False)


def _is_valid_api_key(candidate: str, valid_keys: list[str]) -> bool:
    return any(secrets.compare_digest(candidate, valid_key) for valid_key in valid_keys)


@dataclass
class UserProfile:
    """User profile information."""

    user_id: str
    tenant_id: str
    role: str = "user"
    scopes: list[str] = field(default_factory=list)


def _resolve_request_api_key(
    api_key: str | None,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if api_key:
        return api_key

    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    return None


async def get_current_user(
    request: Request,
    api_key: Annotated[str | None, Security(api_key_header)] = None,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Security(bearer_security),
    ] = None,
) -> UserProfile:
    configured_keys = settings.get_agent_api_keys()

    if not configured_keys:
        if settings.environment != "development":
            raise HTTPException(
                status_code=503,
                detail="Server misconfigured: no API keys set",
            )
        return UserProfile(user_id="dev-user", tenant_id="dev-tenant", role="admin")

    if api_key and not _is_valid_api_key(api_key, configured_keys):
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )

    provided_key = _resolve_request_api_key(api_key=api_key, credentials=credentials)
    if provided_key and _is_valid_api_key(provided_key, configured_keys):
        return UserProfile(
            user_id="internal-api-client",
            tenant_id="default-tenant",
            role="service",
            scopes=["agent:invoke"],
        )

    cookie = request.headers.get("cookie", "")
    session_token = provided_key or request.headers.get("x-session-token", "")
    if not cookie and not session_token:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )

    headers: dict[str, str] = {}
    if cookie:
        headers["Cookie"] = cookie
    if session_token:
        headers["X-Session-Token"] = session_token

    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
            response = await client.get(
                f"{settings.kratos_public_url.rstrip('/')}/sessions/whoami",
                headers=headers,
            )
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503, detail="Identity provider is unavailable"
        ) from error

    if response.status_code != 200:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )

    payload = response.json()
    identity = payload.get("identity") if isinstance(payload, dict) else None
    if not isinstance(identity, dict) or not isinstance(identity.get("id"), str):
        raise HTTPException(status_code=503, detail="Identity response is invalid")
    traits = identity.get("traits") if isinstance(identity.get("traits"), dict) else {}
    return UserProfile(
        user_id=identity["id"],
        tenant_id=str(traits.get("tenant_id") or "default-tenant"),
        role=str(traits.get("role") or "user"),
    )
