# Python agent service

This service hosts the local modular agent runtime. FastAPI exposes internal endpoints, LangGraph runs registered modules, SQLAlchemy stores document metadata and graph checkpoints, and Chroma stores RAG vectors. The first module answers questions over private PDF and TXT uploads.

For the complete stack, use the root [README quick start](../../README.md#quick-start). The normal path builds and starts this service with Docker Compose as part of `bun run dev`.

## Local runtime

Requirements for direct Python development: Python 3.12+ and `uv`. Docker Compose supplies PostgreSQL and Chroma for the complete local scenario.

Service address: `http://localhost:8001`. The container listens on port `8000` and Compose publishes it on loopback only. Do not expose this internal service to the network or call it from the browser. Use the authenticated Bun API at `http://localhost:3000/api/agent`.

Bun validates the user's session before forwarding a request. It adds `X-API-Key` and the authenticated user's `X-User-ID`. FastAPI requires both headers on chat, module, and document endpoints. It uses the trusted user ID to scope documents, vector retrieval, thread ownership, and checkpoint state. Never accept a user ID from a model tool or browser payload as an owner assertion.

The following env values come from the root `.env.example` and `docker-compose.yml`:

| Setting | Purpose |
| --- | --- |
| `AGENT_API_KEY` | Internal shared key between Bun and FastAPI |
| `AGENT_LLM_BASE_URL` | OpenAI-compatible chat API origin |
| `AGENT_LLM_API_KEY` | Chat API credential |
| `AGENT_LLM_MODEL` | Chat model name |
| `AGENT_EMBEDDING_BASE_URL` | Optional embedding API origin; defaults to chat URL |
| `AGENT_EMBEDDING_API_KEY` | Optional embedding API credential; defaults to chat key |
| `AGENT_EMBEDDING_MODEL` | Embedding model name used when indexing/searching |
| `AGENT_USE_RERANKER` | Optional reranking; defaults to `false` |
| `AGENT_USE_HYBRID_SEARCH` | Owner-filtered BM25 keyword + dense retrieval; defaults to `true` |
| `AGENT_RETRIEVAL_LEXICAL_MAX_CHUNKS` | Maximum owner corpus for local lexical ranking; defaults to `2000`, allowed range `1..10000` |

The chat API origin, key, and model must all be configured to enable responses. Without them, FastAPI still starts but chat returns `LLM_NOT_CONFIGURED`. Indexing also needs a compatible embedding model configured. Requests and retrieved text snippets are sent to the configured model provider.

Inside Compose, PostgreSQL is reached at `postgres:5432`, database `agent`; Chroma is reached at `chroma:8000`. The Postgres service creates the `agent` database on its first initialization. FastAPI creates its own missing SQLAlchemy tables at startup. Chroma keeps vectors in its `chroma_1_3_data` volume; uploaded files and related local state use `agent_local_data`.

## API shape

The web application talks to the Bun proxy, not these internal routes:

| Bun route | Internal FastAPI route | Purpose |
| --- | --- | --- |
| `GET /api/agent/modules` | `GET /api/v1/modules` | List registered modules |
| `GET /api/agent/documents` | `GET /admin/documents` | List the current user's documents |
| `POST /api/agent/documents` | `POST /admin/ingest` | Upload a PDF/TXT file, up to 25 MiB |
| `GET /api/agent/documents/:id` | `GET /admin/documents/:id` | Read indexing status |
| `DELETE /api/agent/documents/:id` | `DELETE /admin/documents/:id` | Remove one owned document |
| `POST /api/agent/chat/stream` | `POST /api/v1/chat/stream` | Stream chat events as SSE |
| `GET /api/agent/memories` | `GET /api/v1/memories` | List the user's explicit private notes |
| `POST /api/agent/memories` | `POST /api/v1/memories` | Save `{ "content": "..." }`; owner comes from Bun |
| `DELETE /api/agent/memories/:id` | `DELETE /api/v1/memories/:id` | Delete one owned note |

The streaming route emits module/thread information, token chunks, tool status, sources, and errors. Health endpoints are available at `/health/live` and `/health/ready` for local process checks.

## Retrieval and explicit memory

The RAG module merges Chroma dense retrieval with BM25L keyword matches through reciprocal rank fusion. Both paths use the authenticated owner filter. Existing vectors need no reindex. If the owner has more chunks than the configured lexical bound, the query uses dense-only results and logs `lexical_corpus_limit`; it does not rank a partial corpus. Optional reranking remains independent.

The **Your memory** card in the workspace saves explicit user notes in PostgreSQL. Notes survive restarts and can be deleted by their owner. The agent has a read-only `search_user_memory` tool; it cannot save/delete notes or copy uploaded content into memory. Notes supply context/preferences and are not document sources. Saving and managing notes needs no AI provider; using them in generated answers requires chat configuration.

The canonical implementation is here. The outer original project was removed after source reconciliation. See [RAG consolidation](../../docs/RAG_CONSOLIDATION.md) for provenance, limits, tests, and rebuilding an already-running agent image.

## Add a module

Each module defines its own prompt, tools, routing keywords, and source reporting. Add a module definition under `src/agent/modules/` using `AgentModule` from `agent.modules.base`, then return it from `get_modules()` in `agent.modules.registry`.

```python
from agent.modules.base import AgentModule

MY_MODULE = AgentModule(
    id="my-module",
    name="My module",
    description="A short description shown in the module catalog.",
    instructions="Module-specific system instructions.",
    tools=(my_tool,),
    routing_keywords=("keyword", "ключевое слово"),
)
```

Add the module to the registry. Explicit `module_id` values are validated against that registry. Automatic routing scores each module's keywords and uses the module marked `default_for_auto` when no keywords match. Keep one default module.

For tools that need a user identity, list the trusted argument name in `trusted_tool_arguments`. The orchestrator overwrites that tool argument with the authenticated `user_id` from graph state. Never use a model-provided owner ID. For tools that return citations, add their names to `source_tools` and return JSON containing `context` and `sources` so the streaming API can emit citation events.

## Develop and verify

Install dependencies and run the Python service tests from this directory:

```powershell
uv sync --frozen
uv run pytest
```

The project targets Python 3.12+. Integration-marked tests are excluded by default (`pytest.ini_options.addopts`); provision and select their external services explicitly when adding integration coverage.

To inspect local service logs from the application directory, `vibe/`:

```powershell
docker compose logs --tail 100 agent
docker compose logs --tail 100 chroma
```

To stop local infrastructure while keeping state, run `docker compose stop agent chroma postgres` from `vibe/`. `docker compose down -v` removes the persistent database, vector index, and uploads.

## Scope

This service accepts development/test configuration only and requires the Chroma backend. Azure Search and Azure identity/storage/Service Bus adapters remain inactive legacy source. The separate original Go authorization server and Next.js dashboard were retired; Bun and React own those application boundaries. Cloud deployment is not part of this local setup.
