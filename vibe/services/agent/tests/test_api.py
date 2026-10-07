from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from agent.routes.agent import _sse, router
from agent.server_auth import UserProfile, get_current_user
from agent.utils.rate_limit import limiter


def make_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, dependencies=[Depends(get_current_user)])
    app.dependency_overrides[get_current_user] = lambda: UserProfile(user_id="test-user")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    return app


def test_modules_endpoint_lists_enabled_modules():
    response = TestClient(make_test_app()).get("/api/v1/modules")

    assert response.status_code == 200
    modules = response.json()["modules"]
    assert modules[0]["id"] == "rag"
    assert modules[0]["name"] == "Document Q&A"


def test_invalid_module_is_rejected_before_starting_a_chat():
    response = TestClient(make_test_app()).post(
        "/api/v1/chat/stream",
        json={
            "messages": [{"type": "human", "content": "hello"}],
            "module_id": "unknown-module",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "UNKNOWN_MODULE"


def test_sse_uses_named_events_and_json_data():
    assert _sse("token", {"content": "ответ"}) == (
        'event: token\ndata: {"content": "ответ"}\n\n'
    )
