# Hackathon Starter Architecture

The active project mode is local development. React/Vite serves the pre-rendered public site, the Vite app serves the signed-in workspace, Bun/Hono owns authentication and API access, and FastAPI/LangGraph hosts modular AI agents. `bun run dev` starts the applications and local stores on loopback addresses. Cloud infrastructure, Azure, the Go authorization service, and the mobile app are outside this launch path.

## Components

| Component | Responsibility | Local address |
| --- | --- | --- |
| `website` | Public React/Vite site | `http://localhost:4321` |
| `webapp` | Signed-in React/Vite workspace | `http://localhost:5173` |
| `backend` | Bun/Hono, sessions, API, trusted agent proxy | `http://localhost:3000` |
| `services/agent` | FastAPI/LangGraph, module registry, document processing | `http://localhost:8001` |
| PostgreSQL | App account data and agent metadata in separate databases | `localhost:54329` |
| Chroma | RAG vector index | `localhost:8000` |

Compose publishes service ports on the local machine. The browser must call `/api/agent` on the Bun API; it must not call the internal agent service directly.

## Workspace tasks

Bun workspaces manage the JavaScript packages and their dependencies. Turborepo schedules their tasks through the root `turbo.json`. The Python agent remains a Compose service and uses its own Python dependency lockfile.

`bun run dev` runs the root `dev:setup` task once before any workspace dev server starts. That task calls `scripts/dev-local.mjs` to start PostgreSQL, Chroma, and the agent through Compose, then apply Drizzle migrations. After setup succeeds, Turbo starts the Bun backend, the two Vite frontends in parallel. The backend's own runner continues to supervise its API and scheduler together. Ctrl+C stops the app processes; Docker services remain running and their volumes retain local state.

Build and type-check tasks follow workspace dependency order. Backend and webapp depend on the shared contracts package. Frontend builds cache their `dist` output locally under `.turbo`; backend and contracts builds only type-check and emit no build artifacts. Remote caching is disabled. Build cache keys account for public frontend environment variables and `.env` files. Dev, setup, and build-contract test tasks are uncached. See [COMMANDS.md](COMMANDS.md#turborepo) for filters and cache controls.

## Contracts and web apps

`packages/contracts` defines shared Zod request schemas, DTOs, and API errors. Add endpoint schemas there so the Bun API and Vite client share a contract instead of maintaining duplicate shapes.

`website` owns public pages and SEO. `webapp` owns registration, sign-in, and private workspace screens. The agent UI lives in `webapp/src/features/agent`; it uses the shared HTTP client and does not know the internal FastAPI URL.

Keep each feature's behavior in its owner. Backend contexts live in `backend/src/modules/<context>`, and client contexts live in `webapp/src/features/<context>`. Connect backend contexts through their public `index.ts` or an explicit application port.

## Bun backend

The backend validates the user's session and forms the trust boundary in front of the agent. After authentication, it calls FastAPI with the internal `AGENT_API_KEY` and the authenticated user's `X-User-ID`. Do not accept document ownership from a browser request. The agent checks both internal values and scopes documents, tools, threads, and checkpoint state to the trusted owner.

Browser-facing routes:

| Bun API | Purpose |
| --- | --- |
| `GET /api/agent/modules` | List enabled modules |
| `GET /api/agent/documents` | List the current user's documents |
| `POST /api/agent/documents` | Upload PDF/TXT multipart file, up to 25 MiB |
| `GET /api/agent/documents/:documentId` | Read indexing status |
| `DELETE /api/agent/documents/:documentId` | Delete a document and its vectors |
| `POST /api/agent/chat/stream` | Stream chat; accepts optional `thread_id` and `module_id` |

Chat uses SSE events for tokens, tool status, sources, and errors. The backend relays the stream. Never expose the internal key in the client bundle.

Follow the existing context boundaries: `transport` handles HTTP, `application` coordinates use cases and permissions, `domain` contains pure rules, and `infrastructure` uses Drizzle and external adapters. Do not import Hono, environment variables, or provider SDKs into pure rules.

## Drizzle and PostgreSQL

Drizzle owns the Bun app schema. The table definitions are in `backend/src/db-schema.ts`; reviewed SQL migrations are in `backend/drizzle/`. Change the schema, generate a migration with `bun run --cwd backend db:generate`, review the SQL, and apply it with `bun run --cwd backend db:migrate`. Use PostgreSQL enums only for closed value sets. PostgreSQL 18 provides the UUIDv7 default used by this schema.

The Python service uses a separate `agent` database on the same local PostgreSQL server. SQLAlchemy owns document metadata and LangGraph checkpoints. FastAPI creates missing tables from SQLAlchemy metadata on startup. Vectors live in Chroma; uploaded files live in the agent's local volume. Do not mix these tables into the Drizzle schema for the web app.

## Agent modules

The shared orchestrator builds the LangGraph workflow and selects a module through `services/agent/src/agent/modules/registry.py`. An explicit `module_id` must match a registered module. Otherwise, routing scores the message against each module's keywords and uses the default module when no keywords match.

An `AgentModule` definition owns its instructions, tools, and routing keywords. Add modules under `services/agent/src/agent/modules/` and register each one in `get_modules()`. A tool must not decide which user owns its data: the backend-trusted `user_id` is injected by the orchestrator. Return structured tool status and sources so the API can stream them over SSE.

The first module, `rag`, accepts PDF and TXT files. It stores files in the agent's local storage, metadata and progress in the `agent` database, and embeddings/chunks in local Chroma. Search filters by user ID. Docker volumes preserve this data across local restarts.

## LLM settings and privacy

Set `AGENT_LLM_BASE_URL`, `AGENT_LLM_API_KEY`, and `AGENT_LLM_MODEL` in the root `.env` to enable chat responses. Indexing also requires a compatible embedding API and `AGENT_EMBEDDING_MODEL`; when embedding URL and key are blank, the service reuses the chat URL and key. Reranking is off by default (`AGENT_USE_RERANKER=false`).

Without chat settings, the service and the other local apps still start, but chat returns `LLM_NOT_CONFIGURED`. Do not begin indexing until embeddings are configured. Prompts and retrieved document text are sent to the configured provider, so this setup is not fully offline.

Compose ports bind to `127.0.0.1`. Do not expose FastAPI to a network or send the internal key to the browser. Keep `.env` local and out of Git.

## Background work

Bun stores retryable one-off work in a PostgreSQL outbox and defines scheduled jobs in `backend/src/jobs.ts`. `bun run --cwd backend dev` starts the API and scheduler together. See [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md). Document ingestion has its own SQLAlchemy-backed state in FastAPI and resumes pending local jobs after agent startup.

## Checks and infrastructure

See [TESTING.md](TESTING.md) for local check commands and [LOCAL_DATABASE.md](LOCAL_DATABASE.md) for database connections and data reset. Bun commands are listed in [COMMANDS.md](COMMANDS.md).

The repository may still contain Terraform, cloud email/storage adapters, Azure Search, and Go code. They are not part of the active local launch, Compose stack, authentication flow, or quick-start guide. Do not enable them in local configuration without a separate request and an updated deployment plan.

## Official documentation

- [Bun](https://bun.sh/docs)
- [Hono](https://hono.dev/docs)
- [Drizzle ORM](https://orm.drizzle.team/docs/overview)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
- [Chroma](https://docs.trychroma.com/)
- [Zod](https://zod.dev/)
