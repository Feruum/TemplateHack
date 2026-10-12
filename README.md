# TemplateHack

A local hackathon application with a public site, account registration, a private workspace, and a modular AI-agent backend. Its initial RAG module processes each user's PDF and TXT documents and streams answers with source citations when a model provider is configured.

Repository: [Feruum/TemplateHack](https://github.com/Feruum/TemplateHack).

## What works and what still needs configuration

The active application is `vibe/`. The React/Vite migration check on **2026-10-12** passed **545 Bun tests and 2 build-contract tests**, type checks, lint, workspace builds, the website Storybook build, and the dependency audit. Public-site browser checks covered desktop/mobile navigation, FAQ controls, hydration, and static fallback behavior with JavaScript blocked, reduced motion, and WebGL disabled.

The broader **2026-10-07** audit also passed 34 Python tests, 10 account/workspace Chromium scenarios, and 12 RAG runtime checks with a controlled local AI provider. Those results retain their original date; the frontend migration did not rerun the Python or RAG suites. See the [verification report](vibe/docs/VERIFICATION.md) for scope and evidence.

The complete local stack was started and its endpoints checked again on **2026-10-12**. Implemented AI features still require real provider settings.

| Capability | Status | Evidence or remaining requirement |
| --- | --- | --- |
| Public website and signed-in workspace | Working locally | Both Vite applications start and return HTTP 200 |
| Account registration, sign-in, sessions, and logout | Working | Covered by real browser and backend integration scenarios |
| Profile editing and avatars | Working with local storage | Upload, reload, replacement, removal, and retry passed in Chromium |
| User/admin roles and protected routes | Working | Access separation and session revocation after role changes were tested; admin screens require an admin account |
| Bun API and background scheduler | Working locally | API health returns HTTP 200; the outbox scheduler starts and runs |
| Python agent service | Running | Liveness returns HTTP 200; full readiness returns HTTP 503 in the current configuration without embeddings |
| PDF/TXT ingestion, private vectors, and document isolation | Implemented and integration-tested | Text-based PDF/TXT extraction, indexing, owner isolation, and deletion passed with test embeddings; real indexing requires an embedding provider |
| AI chat, streaming, sources, and saved conversations | Implemented and integration-tested | RAG streaming, PDF page citations, PostgreSQL checkpoints, and thread isolation passed with a test provider; real chat currently returns `LLM_NOT_CONFIGURED` |
| Password-reset email | Needs configuration | Forms and error handling are covered; delivery defaults to `disabled`, so real reset emails are not sent until a mail driver is configured |
| Cloud storage and deployment | Available source; not deployed or verified against real cloud accounts | The normal launch uses local filesystem storage and Docker volumes |
| Browser payments and checkout | Not implemented in the active application | Recorded as absent in the capability registry |
| Mobile app | Inactive | Only its guide is present on this launch path; it is not started or checked here |
| Original Go auth service / Next.js dashboard | Reference source | Kept under `agentic-rag/`; not started or audited as the active product |

No external AI or email provider is configured in the current local environment. Account features work independently of those integrations. A healthy agent process does not mean that real AI indexing and answers are ready.

## Technology stack

| Layer | Technologies | Responsibility |
| --- | --- | --- |
| Languages and runtimes | TypeScript 6, Bun 1.4+, Node.js 22.12+, Python 3.12+ | Web/API development, task orchestration, and the Python service |
| Public website | React 19, Vite 8, Tailwind CSS 4, React Three Fiber / Three.js | Pre-rendered static React page and a lazy 3D scene |
| Private workspace | React 19, Vite 8, TanStack Router / Query / Form | Account routes, server state, forms, profile/admin screens, and agent UI |
| UI primitives | shadcn-style components, Radix / Base UI, Tailwind CSS 4 | Shared controls, layout, and theme; shared CSS is stored locally with its MIT license |
| Browser API | Bun, Hono 4, Zod, JOSE, Drizzle ORM | Request validation, account/session handling, permissions, storage, and trusted agent proxy |
| Relational storage | PostgreSQL 18, Drizzle migrations, SQLAlchemy, asyncpg / psycopg | Account data, document metadata, thread ownership, and conversation checkpoints |
| AI and retrieval | FastAPI, Uvicorn, LangChain, LangGraph, Chroma, pypdf | PDF/TXT processing, vector retrieval, agent orchestration, and streaming |
| Background work | Croner and the PostgreSQL task outbox | Scheduled job execution and retryable queued work |
| Local infrastructure | Docker Compose, uv / `uv.lock`, Bun workspaces, Turborepo | Local services, locked dependencies, ordered tasks, and local build caching |
| Checks and tooling | Bun test, pytest, Playwright / Chromium, ESLint, TypeScript, Storybook | Automated checks and optional component catalogs |

AI uses configurable OpenAI-compatible chat and embedding endpoints. No paid provider is automatically selected or provisioned. Go, ConnectRPC, Kratos, SpiceDB, and Next.js belong to the reference project, not the active local runtime.

## Workspace

| Directory | Status | Purpose |
| --- | --- | --- |
| [vibe](vibe/README.md) | Active application | Application commands, Compose services, shared configuration, and local development guides |
| [vibe/website](vibe/website/README.md) | Active frontend | Public React/Vite site |
| [vibe/webapp](vibe/webapp/README.md) | Active frontend | Registration, sign-in, private workspace, profile/admin pages, and agent UI |
| [vibe/backend](vibe/backend/README.md) | Active backend | Bun API, authentication, permissions, file storage, scheduler, and agent proxy |
| [vibe/services/agent](vibe/services/agent/README.md) | Active internal service | Python agent modules, RAG ingestion/retrieval, and conversation state |
| [vibe/packages/contracts](vibe/packages/contracts/README.md) | Shared package | Zod contracts and TypeScript types used by the API and workspace |
| [vibe/infra](vibe/infra/README.md) | Optional deployment source | Infrastructure definitions and release helpers; outside the verified local launch |
| [agentic-rag](agentic-rag/README.md) | Reference source | Original standalone RAG monorepo; its Go auth service and Next.js dashboard are outside the active launch path |

Run the application commands from `vibe/`. Git is configured at the parent workspace root, so both source directories belong to the same repository.

## Quick start on Windows

Requirements: Bun 1.4+, Node.js 22.12+, and Docker Desktop with its engine running. Direct Python development also requires Python 3.12+ and `uv`; the normal launch runs Python in Docker.

```powershell
Set-Location vibe
bun install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `vibe/.env`. Set a random `JWT_SECRET` of at least 32 characters and a private `AGENT_API_KEY`. The latter must be shared by the Bun API and Python service. To enable AI answers and indexing, configure `AGENT_LLM_BASE_URL`, `AGENT_LLM_API_KEY`, `AGENT_LLM_MODEL`, and `AGENT_EMBEDDING_MODEL`. Configure a separate embedding URL/key only if your provider needs one. Prompts and retrieved document text go to that provider.

If port `3000` is occupied, set both `PORT=3100` and `VITE_API_URL=http://localhost:3100`. This workspace's local `.env` uses that alternative port. See [port configuration](vibe/README.md#port-configuration) for the other services.

```powershell
bun run dev
```

Setup starts PostgreSQL, Chroma, and the Python agent and applies database migrations. Turbo then runs the API, scheduler, Vite app, and React/Vite site.

| Service | Default address |
| --- | --- |
| Public site | `http://localhost:4321` |
| Signed-in workspace | `http://localhost:5173` |
| Bun API | `http://localhost:3000` (`3100` in the local audit configuration) |
| Internal Python agent | `http://localhost:8001` |

The current local environment uses API port `3100` and PostgreSQL port `25432`; these machine-specific settings are in the ignored `vibe/.env`. A new environment copied from `.env.example` uses the defaults. Keep `PORT` aligned with `VITE_API_URL`, and `POSTGRES_PORT` aligned with `DATABASE_URL`. If Windows reserves the default database port, choose another free port as described in the [local database guide](vibe/docs/LOCAL_DATABASE.md).

Register an account, upload a PDF or TXT file up to 25 MiB, wait for `COMPLETED`, and ask a question. The browser calls the agent through the authenticated Bun API. Documents, vectors, and threads are scoped to their owner.

Without a configured model provider, the web applications and account features still start. AI chat returns `LLM_NOT_CONFIGURED`, and indexing requires valid embedding settings.

Ctrl+C stops the web applications and Bun processes. Docker services and volumes remain. To stop the infrastructure without deleting data, run `docker compose stop agent chroma postgres` from `vibe/`.

On Windows, if Turbo keeps printing `tasks shutting down`, press Ctrl+C again to finish exiting.

## Verification

Run these commands from `vibe/`:

```powershell
bun run check
bun run typecheck
bun run lint
bun run test
bun run test:build-contracts --force
bun run --cwd webapp e2e:install
$env:TEST_DATABASE_URL = "postgresql://superuser:superpassword@127.0.0.1:25433/web_app_demo_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
bun run e2e:webapp
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_URL
```

The explicit test database prevents the browser harness from inheriting the development `DATABASE_URL` from the root `.env`. Backend integration tests create and remove their own isolated test database.

The example uses port `25433`; choose another free port if needed. Windows may reserve a port even when nothing listens on it. Inspect reservations with `netsh interface ipv4 show excludedportrange protocol=tcp`.

The application dependency audit passes with no known vulnerabilities. Shared shadcn CSS is kept locally with its MIT license, so builds do not install the component generator or its vulnerable dependency tree. The pinned generator remains available on demand; see the [style provenance and tool limitation](vibe/styles/vendor/shadcn/README.md). The [verification report](vibe/docs/VERIFICATION.md) records actual results, commands, and remaining limits.

Python tests and the manual RAG scenario are documented in [TESTING.md](vibe/docs/TESTING.md). The complete command reference is [COMMANDS.md](vibe/docs/COMMANDS.md).

## Git and local files

The project is published on `main` in `https://github.com/Feruum/TemplateHack.git`. The local `origin` points to that repository. Local credentials and runtime data are not included in the published source.

`.gitignore` excludes dependencies, generated builds, local `.env` files, test artifacts, uploads, and infrastructure state. Environment examples remain versionable. Keep API keys and private data in local configuration.

## Documentation and license

Start with the [application README](vibe/README.md), [architecture](vibe/docs/ARCHITECTURE.md), and [local database guide](vibe/docs/LOCAL_DATABASE.md). Active product decisions are recorded in [CHECKLIST.md](vibe/CHECKLIST.md).

The Vibe-derived application uses Apache License 2.0. Preserve [LICENSE](vibe/LICENSE), [NOTICE](vibe/NOTICE), and the original attribution when distributing it. Reference source retains its own files and notices.
