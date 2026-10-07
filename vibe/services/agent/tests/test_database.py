from agent.infrastructure.database import normalize_asyncpg_url


def test_normalize_asyncpg_url_translates_sslmode_without_losing_query() -> None:
    url, connect_args = normalize_asyncpg_url(
        "postgresql+asyncpg://user:pass@db.example/agent?sslmode=require&application_name=deimos"
    )
    assert "sslmode" not in url
    assert "application_name=deimos" in url
    assert connect_args == {"ssl": "require"}


def test_normalize_asyncpg_url_disables_tls_for_local_tests() -> None:
    url, connect_args = normalize_asyncpg_url(
        "postgresql+asyncpg://user:pass@localhost/agent?sslmode=disable"
    )
    assert url == "postgresql+asyncpg://user:pass@localhost/agent"
    assert connect_args == {"ssl": False}
