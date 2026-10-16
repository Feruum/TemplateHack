import asyncio
import os

from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.engine import make_url

from agent.config.settings import Settings
from agent.infrastructure.database import Base, get_session


def _database_url(default):
    selected = os.environ.get('TEST_AGENT_DATABASE_URL')
    if selected:
        url = make_url(selected)
        if not url.drivername.startswith('postgresql') or not (url.database or '').endswith('_test'):
            raise ValueError('TEST_AGENT_DATABASE_URL must select an isolated PostgreSQL database ending in _test.')
    return selected or default


def test_postgres_fixture_refuses_the_development_database(monkeypatch):
    monkeypatch.setenv('TEST_AGENT_DATABASE_URL', 'postgresql+asyncpg://test:test@localhost/agent')
    with pytest.raises(ValueError, match='isolated PostgreSQL'):
        _database_url('sqlite+aiosqlite:///:memory:')


@pytest.mark.asyncio
async def test_notes_persist_across_connections_and_enforce_owner_on_delete(tmp_path):
    from agent.memory.notes import MemoryNotes

    url = _database_url(f'sqlite+aiosqlite:///{tmp_path / "notes.sqlite"}')
    first_engine = create_async_engine(url)
    async with first_engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(first_engine, expire_on_commit=False)
    async with sessions() as session:
        note = await MemoryNotes(session).create('a', 'Prefer concise Russian answers.')
    await first_engine.dispose()

    second_engine = create_async_engine(url)
    sessions = async_sessionmaker(second_engine, expire_on_commit=False)
    try:
        async with sessions() as session:
            notes = MemoryNotes(session)
            assert (await notes.list('a'))[0]['content'] == 'Prefer concise Russian answers.'
            assert await notes.list('b') == []
            assert not await notes.delete('b', note['id'])
            assert await notes.search('a', 'Russian')
            assert await notes.search('b', 'Russian') == []
            assert await notes.delete('a', note['id'])
            assert await notes.list('a') == []
    finally:
        await second_engine.dispose()


@pytest.mark.asyncio
async def test_memory_http_requires_auth_and_explicit_owner_scoped_writes(monkeypatch):
    from agent.memory.notes import MemoryNote
    from agent.routes.memory import router
    from agent.server_auth import get_current_user

    engine = create_async_engine(_database_url('sqlite+aiosqlite:///:memory:'))
    async with engine.begin() as connection:
        await connection.run_sync(MemoryNote.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def session_dependency():
        async with sessions() as session:
            yield session

    app = FastAPI()
    app.include_router(router, dependencies=[Depends(get_current_user)])
    app.dependency_overrides[get_session] = session_dependency
    monkeypatch.setattr(Settings, 'get_agent_api_keys', lambda self: ['notes-test-key'])
    owner = {'X-API-Key': 'notes-test-key', 'X-User-ID': 'a'}
    other = {'X-API-Key': 'notes-test-key', 'X-User-ID': 'b'}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.get('/api/v1/memories')).status_code == 401
            assert (await client.post('/api/v1/memories', headers=owner, json={'content': '   '})).status_code == 422
            assert (await client.post('/api/v1/memories', headers=owner, json={'content': 'x' * 2001})).status_code == 422
            assert (await client.post('/api/v1/memories', headers=owner, json={'content': '\U0001f600' * 1500})).status_code == 422
            assert (await client.post('/api/v1/memories', headers=owner, json={'content': 'private', 'user_id': 'b'})).status_code == 422
            created = await client.post('/api/v1/memories', headers=owner, json={'content': '  Prefer Russian.  '})
            assert created.status_code == 201
            note = created.json()
            assert note['content'] == 'Prefer Russian.'
            assert 'user_id' not in note
            assert (await client.get('/api/v1/memories', headers=other)).json() == {'memories': []}
            assert (await client.delete(f'/api/v1/memories/{note["id"]}', headers=other)).status_code == 404
            assert len((await client.get('/api/v1/memories', headers=owner)).json()['memories']) == 1
            assert (await client.delete(f'/api/v1/memories/{note["id"]}', headers=owner)).status_code == 200
            assert (await client.get('/api/v1/memories', headers=owner)).json() == {'memories': []}
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_memory_tool_overwrites_forged_owner_with_graph_identity(monkeypatch):
    import json
    from unittest.mock import AsyncMock, MagicMock
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
    from agent.graphs.workflow import create_workflow
    from agent.memory.notes import MemoryNotes
    from agent.modules.rag import RAG_MODULE

    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        notes = MemoryNotes(session)
        await notes.create('owner-a', 'Private preference of owner A.')
        await notes.create('owner-b', 'Private preference of owner B.')
    monkeypatch.setattr('agent.modules.rag.async_session', sessions)
    llm = MagicMock()
    llm.bind_tools.return_value = llm
    llm.ainvoke = AsyncMock(side_effect=[
        AIMessage(content='', tool_calls=[{'name': 'search_user_memory', 'args': {'query': 'preference', 'user_id': 'owner-a'}, 'id': 'memory-call', 'type': 'tool_call'}]),
        AIMessage(content='Done.'),
    ])
    try:
        result = await create_workflow(llm, RAG_MODULE).compile().ainvoke({'messages': [HumanMessage(content='My preferences?')], 'user_id': 'owner-b'})
        responses = [message for message in result['messages'] if isinstance(message, ToolMessage)]
        notes = json.loads(responses[0].content)['notes']
        assert [note['content'] for note in notes] == ['Private preference of owner B.']
    finally:
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get('TEST_AGENT_DATABASE_URL'), reason='Requires an isolated PostgreSQL fixture')
async def test_note_quota_is_atomic_across_postgres_connections():
    from agent.memory.notes import MemoryNote, MemoryNotes

    engine = create_async_engine(_database_url(None))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with sessions() as session:
            session.add_all([MemoryNote(user_id='quota-user', content=f'Note {number}') for number in range(99)])
            await session.commit()

        async def create_note():
            async with sessions() as session:
                return await MemoryNotes(session).create('quota-user', 'Last slot')

        results = await asyncio.gather(create_note(), create_note(), return_exceptions=True)
        assert sum(isinstance(result, dict) for result in results) == 1
        assert sum(isinstance(result, ValueError) for result in results) == 1
        async with sessions() as session:
            assert len(await MemoryNotes(session).list('quota-user')) == 100
    finally:
        await engine.dispose()
