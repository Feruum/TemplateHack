# TemplateHack — Hackathon Starter

<p align="center">
  <img src="docs/assets/vibe_tmpl_schema.png" alt="Vibe Coding Template architecture diagram" width="100%">
</p>

A local-first starter for hackathon projects. React/Vite serves the pre-rendered public site, Vite provides the signed-in workspace, Bun/Hono owns authentication and API access, and a Python/LangGraph service hosts pluggable agent modules. The first module answers questions from private PDF and TXT uploads. Bun workspaces manage JavaScript dependencies, and Turborepo coordinates development tasks and caches builds locally.

[AGENTS.md](AGENTS.md) defines the development rules. The active launch path is local. Cloud infrastructure and the mobile branch are not part of this starter's first run.

This application is stored under `vibe/` in [Feruum/TemplateHack](https://github.com/Feruum/TemplateHack). Run the commands below from `vibe/`. Git is configured in its parent workspace. The sibling `agentic-rag/` directory is reference source and is not started by these commands.

## Current status and stack

The React/Vite migration check passed on 2026-10-12: 545 Bun tests, 2 build-contract checks, workspace type checks, lint, builds, the website Storybook build, and the application dependency audit. Public-site browser checks passed for desktop/mobile navigation, FAQ controls, hydration, and JavaScript/reduced-motion/WebGL fallbacks. The public site and workspace now use the same React/Vite framework stack.

The broader 2026-10-07 audit also passed 34 Python tests and 10 account/workspace Chromium scenarios. Registration, sessions, profile/avatars, user/admin access, and the local API/scheduler were covered by that audit. These older results retain their date; the migration did not rerun the Python or RAG suites.

The complete local stack was restarted on 2026-10-12. The site, workspace, API health, and agent liveness returned HTTP 200. Agent readiness still returned HTTP 503 without embedding settings. Development data volumes were preserved.

The RAG module is implemented and passed 12 runtime checks for PDF/TXT, indexing, streaming, citations, conversation persistence, and owner isolation with a controlled AI provider. The current local `.env` has no real LLM or embedding settings: chat returns `LLM_NOT_CONFIGURED`, and full agent readiness returns HTTP 503 until embeddings are configured. Password-reset mail defaults to disabled. Real cloud integrations, payments, and mobile are outside this verified local launch.

The active stack is TypeScript/Bun/Hono/Drizzle/PostgreSQL for the API; React 19/Vite 8/TanStack/Tailwind 4 for the workspace; React 19/Vite 8/Three.js for the public site; and Python 3.12/FastAPI/LangChain/LangGraph/SQLAlchemy/Chroma for the agent. Docker Compose, uv, Bun workspaces, and Turborepo manage the local environment. The [workspace README](https://github.com/Feruum/TemplateHack#technology-stack) contains the complete stack and capability-status tables; [VERIFICATION.md](docs/VERIFICATION.md) contains the check details.

## Applications

| Path and guide | Purpose |
| --- | --- |
| [backend](backend/README.md) | Bun/Hono, Drizzle/PostgreSQL, sessions, and the trusted agent proxy |
| [webapp](webapp/README.md) | React/Vite, TanStack; CSR with registration and sign-in |
| [website](website/README.md) | React/Vite with pre-rendered HTML; public pages and content |
| [services/agent](services/agent/README.md) | FastAPI/LangGraph, module registry, RAG, local Chroma and file storage |
| [mobile/README.md](mobile/README.md) | Guide to the Expo application on the `mobile` branch |
| [packages/contracts](packages/contracts/README.md) | Shared Zod schemas and TypeScript API types |

## Choose between `webapp` and `website`

- `website`: public pages, SEO, link previews, and catalog. Use React/Vite with pre-rendered HTML by default. Use SSR or hybrid rendering when needed.
- `webapp`: screens after sign-in, user accounts, administration, and checkout without SEO.

A marketplace usually needs both. Do not move SEO into CSR or the entire account area into the public website. See [ARCHITECTURE.md](docs/ARCHITECTURE.md#contracts-and-web-apps) for framework selection.

Before work on data, carts, orders, or payments, read [WEB_SURFACES.md](docs/WEB_SURFACES.md). The authenticated webapp and backend own the single browser checkout. Website can pass an anonymous selection. Backend is the data source. Mobile has separate native payments. Store subscriptions are disabled on the `mobile` branch. Add other payment methods according to product needs and platform rules.

## Quick start

Requirements: Bun 1.4+, Node.js 22.12+, and Docker Desktop with the engine running. An OpenAI-compatible chat and embedding provider is required for AI answers and document indexing. Direct Python development requires Python 3.12+ and `uv`.

From PowerShell in `vibe/`:

```powershell
bun install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env`. Set a random `JWT_SECRET` of at least 32 characters and a private `AGENT_API_KEY`. Set `AGENT_LLM_BASE_URL`, `AGENT_LLM_API_KEY`, `AGENT_LLM_MODEL`, and `AGENT_EMBEDDING_MODEL` to enable AI. Set separate embedding URL/key values only if your provider needs them. Keep this file local. The chat and embedding requests, including retrieved text snippets, go to that provider.

Without model settings, the applications and account features still start, but chat returns `LLM_NOT_CONFIGURED`. Indexing also needs valid embedding settings.

```powershell
bun run dev
```

Turborepo first runs the shared setup task once: Docker Compose starts PostgreSQL, Chroma, and the Python agent, then Drizzle applies migrations. After setup succeeds, Turbo starts the Bun API/scheduler, Vite app, and React/Vite site in parallel. Ctrl+C stops the app processes. The Docker services stay running, and Docker volumes retain the database, vectors, and uploaded files between runs.

Open the local apps here:

- Public React/Vite site: <http://localhost:4321>
- Signed-in workspace: <http://localhost:5173>
- Bun API: <http://localhost:3000>
- Internal agent service: <http://localhost:8001> (called by Bun; the browser uses `/api/agent`)

Register an account from the workspace. Upload a PDF or TXT file up to 25 MiB, wait for indexing, then ask a question. The agent module is selected automatically by default; the selector also supports explicit module choice.

Use `bun run build` to build the workspaces with dependency ordering and a local `.turbo` cache. Remote caching is disabled. See [COMMANDS.md](docs/COMMANDS.md#turborepo) for filtered tasks, cache controls, and standalone development commands.

## Port configuration

Keep each public URL aligned with the service port in `.env`:

| Service | Settings |
| --- | --- |
| Bun API | `PORT` and `VITE_API_URL` must use the same port |
| Python agent | `AGENT_PORT` and the port in `AGENT_SERVICE_URL` must match |
| PostgreSQL | `POSTGRES_PORT` and the port in `DATABASE_URL` must match |
| Workspace link on the public site | `PUBLIC_WEBAPP_URL` must point to the Vite app |

For example, use `PORT=3100` and `VITE_API_URL=http://localhost:3100` when another project occupies port `3000`. The local audit configuration uses this alternative. Change only this project's settings; keep other projects running.

To stop infrastructure and preserve data, run `docker compose stop agent chroma postgres`. Do not use `docker compose down -v` unless you intend to delete the database, document index, and uploaded files.

## Checks

Select focused checks using [AGENTS.md](AGENTS.md#testing-and-verification) and [TESTING.md](docs/TESTING.md). Open a browser only on explicit request. Run full `bun run check` for a release, a system-wide audit, or a change across the system. It requires Docker and package registry access. Check Terraform separately.

See [VERIFICATION.md](docs/VERIFICATION.md) for the local audit results and remaining limits. The application dependency audit passes with no known vulnerabilities. Both frontends use the unchanged shared [shadcn CSS and MIT license](styles/vendor/shadcn/README.md). The pinned component generator runs separately on demand; its unpatched `braces` advisory remains relevant when using that optional development tool.

## Documentation

The guides contain implementation details:

| Area | Guide |
| --- | --- |
| Development, build, test, database, and release commands | [COMMANDS.md](docs/COMMANDS.md) |
| Dependency updates and temporary audit exceptions | [TESTING.md](docs/TESTING.md#inactive-checks) |
| Modules, processes, authentication, clients, and Drizzle | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Schedules, jobs, and outbox | [BACKGROUND_JOBS.md](docs/BACKGROUND_JOBS.md) |
| PostgreSQL, test databases, and resets | [LOCAL_DATABASE.md](docs/LOCAL_DATABASE.md) |
| Email and files | [EMAIL.md](docs/EMAIL.md), [STORAGE.md](docs/STORAGE.md) |
| Agent modules and local configuration | [services/agent/README.md](services/agent/README.md) |

## License

Apache License 2.0. When distributing a copy, fork, or derived project, keep [LICENSE](LICENSE) and [NOTICE](NOTICE). Preserve the attribution to Dima Sukharev, his GitHub account, and the source repository.
