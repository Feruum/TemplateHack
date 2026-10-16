from fastapi.testclient import TestClient

from agent.config.settings import Settings


def test_full_service_starts_with_memory_without_a_model_provider(monkeypatch):
    from agent.server import app

    monkeypatch.setattr(Settings, 'get_agent_api_keys', lambda self: ['startup-test-key'])
    headers = {'X-API-Key': 'startup-test-key', 'X-User-ID': 'startup-user'}
    with TestClient(app) as client:
        assert client.get('/health/live').status_code == 200
        assert client.get('/api/v1/memories').status_code == 401
        created = client.post('/api/v1/memories', headers=headers, json={'content': 'Prefer concise answers.'})
        assert created.status_code == 201
        note = created.json()
        assert client.get('/api/v1/memories', headers=headers).json()['memories'] == [note]
        assert client.delete(f'/api/v1/memories/{note["id"]}', headers=headers).status_code == 200
