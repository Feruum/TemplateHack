"""Rate limiting utilities for the agent API.

Provides per-user and per-API-key rate limiting with configurable limits.
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from agent.config.settings import settings


def _get_api_key_from_headers(request: Request) -> str | None:
    api_key = request.headers.get("X-API-Key")
    if api_key:
        return api_key

    authorization = request.headers.get("Authorization")
    if not authorization:
        return None

    scheme, _, credentials = authorization.partition(" ")
    if scheme.lower() != "bearer" or not credentials:
        return None

    return credentials


def get_rate_limit_key(request: Request) -> str:
    """Get the rate limit key from request.

    Priority:
    1. X-API-Key header (for API clients)
    2. X-User-ID header (for authenticated users)
    3. Remote IP address (fallback)
    """
    api_key = _get_api_key_from_headers(request)
    if api_key:
        return f"api_key:{api_key}"

    user_id = request.headers.get("X-User-ID")
    if user_id:
        return f"user:{user_id}"

    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=get_rate_limit_key)


def get_rate_limit_for_request(request: Request) -> str:
    """Get the appropriate rate limit string based on request context."""
    api_key = _get_api_key_from_headers(request)
    if api_key:
        return settings.rate_limit

    user_id = request.headers.get("X-User-ID")
    if user_id:
        return settings.rate_limit_per_user

    return settings.rate_limit_per_user
