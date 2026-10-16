# One agent implementation inside Vibe

The active agent lives in `services/agent`. The React workspace calls it through the authenticated Bun/Hono proxy. `docker-compose.yml` is the one local application launch definition. The outer `agentic-rag/` reference project was retired after source reconciliation on 2026-10-16.

## Source reconciliation

Before consolidation, the original Python subtree had only seven files without a counterpart inside `services/agent`: its `.env.example`, `.gitignore`, `AGENTS.md`, `buf.gen.yaml`, `langgraph.json`, `package.json`, and root-level `test_memory.py`. The active environment, instructions, package configuration, and API contracts replace the first six. The new memory persistence, owner-isolation, HTTP, and concurrent-quota tests replace the final integration smoke test.

The outer reference directory contained 263 tracked files and no modified, untracked, ignored, or nested Git files at the removal preflight. Its original sources remain recoverable in Git history, including commit `daa06fe`:

```powershell
git show daa06fe:agentic-rag/apps/agent/src/agent/graphs/workflow.py
git show daa06fe:agentic-rag/docker-compose.yaml
```

The original project is not reproduced feature for feature. The following table records the deliberate disposition.

| Original area | Disposition inside Vibe |
| --- | --- |
| Python/FastAPI/LangGraph agent | Active under `services/agent`; isolated module tools, trusted owner identity, streaming, citations, and PostgreSQL checkpoints |
| PDF/TXT ingestion and Chroma | Active; owner-scoped files, vectors, status, retry, and deletion |
| Hybrid retrieval | Active local BM25 keyword ranking plus dense retrieval, combined with reciprocal rank fusion; optional reranking remains available |
| Personal memory | Explicit private notes in the existing PostgreSQL `agent_memories` table; authenticated list/create/delete API and React controls; read-only agent tool |
| Go/ConnectRPC, Kratos, SpiceDB | Replaced by Bun/Hono sessions, roles, and owner checks; organization sharing and Zanzibar relations were not part of this consolidation |
| Next.js admin dashboard, chat prototype, UI reference collection | Retired; the React/Vite workspace owns the application interface |
| Original Traefik/Dragonfly and multi-profile Compose stack | Retired; use the existing Vibe Compose services |
| Campus/events/booking tools and domain-specific prompts | Excluded from the active generic module; no external campus API calls are enabled |
| Azure deployment, identity, search, storage, Service Bus | Inactive legacy source; not enabled, deployed, or advertised as working local features |
| Automatic memory writes and old shared/default-user memory facade | Removed; document text and model tool calls cannot create/delete personal notes |

No additional dependency was installed for these features. The existing `rank-bm25`, Chroma, SQLAlchemy, FastAPI, and React/TanStack dependencies supply them. No second authentication service or frontend was introduced. The datathon environment remains separate.

## Retrieval behavior

`AGENT_USE_HYBRID_SEARCH=true` enables local keyword retrieval. Both the dense query and the Chroma candidate read use the same owner filter. Unicode words are case-folded; BM25L ranks lexical matches. Reciprocal rank fusion merges rankings and deduplicates chunks by their identity. This improves exact-code/name retrieval in the controlled fixtures without assigning comparable numeric units to vector distances and lexical scores.

Keyword candidates are read from the existing Chroma collection. Existing documents work without a reindex, and deletion removes both retrieval paths. To bound local CPU and memory, the default maximum is 2,000 chunks per filtered corpus, configurable from 1 to 10,000 with `AGENT_RETRIEVAL_LEXICAL_MAX_CHUNKS`. If the owner corpus exceeds the limit, the entire query uses dense-only retrieval and logs `lexical_corpus_limit`; a partial corpus is not scored as if it were complete. This bound is a local starter limit, not a scalable full-text service.

Set `AGENT_USE_HYBRID_SEARCH=false` to compare the dense baseline. `AGENT_USE_RERANKER` remains independent. The local tests use deterministic deliberately weak embeddings to prove keyword recovery, Unicode handling, deduplication, owner isolation, and deletion. They do not measure real embedding-model or generated-answer quality. Before making accuracy claims, evaluate both settings on representative labeled questions using the same documents and configured providers.

## Memory behavior

The workspace's **Your memory** card lists, saves, and deletes personal notes. Each note contains 1–2,000 characters. An owner can save up to 100 notes; PostgreSQL serializes concurrent quota checks for that owner. Notes survive process/database reconnections. Only the authenticated user identity from Bun determines the owner. Foreign note IDs return 404 when deleted.

The model has `search_user_memory` and no memory write/delete tools. A query ranks notes by keywords and can fall back to the five most recent explicit notes when wording differs. Notes provide preferences/context and are not PDF/TXT evidence or citation sources. Conversation checkpoints and uploaded files keep their existing storage behavior and are not automatically copied into personal memory. Notes selected by the tool go to the configured model provider as context.

Browser note and document caches are scoped to both the authenticated session and owner. Sign-out or a replacement login clears those caches and cancels pending reads. A changed account resets the local chat, upload notices, and memory drafts.

The existing Alembic revision `20260716_0002` already defines `agent_memories`; the matching SQLAlchemy model is now registered in local startup's `create_all`. Existing documents and checkpoints are unchanged. No destructive migration or development-data reset is needed.

| Browser API | Internal agent API |
| --- | --- |
| `GET /api/agent/memories` | `GET /api/v1/memories` |
| `POST /api/agent/memories` with `{ "content": "..." }` | `POST /api/v1/memories` |
| `DELETE /api/agent/memories/:id` | `DELETE /api/v1/memories/:id` |

## Run and verify

For a new launch, run the normal `bun run dev` from `vibe/`. If an old agent image is already running, rebuild it when that development session can be restarted:

```powershell
docker compose up -d --build agent
```

This consolidation's checks use separate containers and databases. They do not restart another task's development processes or remove its volumes. Python tests run from `services/agent` with `uv run pytest`. The PostgreSQL concurrency test additionally requires `TEST_AGENT_DATABASE_URL` pointing to a fresh isolated PostgreSQL test database whose name ends in `_test`; the fixture refuses the normal `agent` database. Bun contracts, proxy tests, type checks, lint, and builds run through `bun run check`.

The PowerShell helper provisions and removes its own PostgreSQL container and network, with no host port or shared volume. It requires Docker and the normal `postgres:18-alpine` development image. From `vibe/`, build a test image once and run:

```powershell
docker build -t templatehack-agent-check:local services/agent
& .\services\agent\scripts\test-memory-postgres.ps1 -AgentImage templatehack-agent-check:local
```

The helper mounts the current service source read-only and uses the image's locked dependencies. It does not rebuild or restart the running development agent.
