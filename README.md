# TemplateHack

A local hackathon starter with account registration, a private workspace, and modular AI agents. The initial RAG module indexes each user's PDF and TXT documents and streams answers with sources.

Repository: [Feruum/TemplateHack](https://github.com/Feruum/TemplateHack).

## Workspace

| Directory | Status | Purpose |
| --- | --- | --- |
| [vibe](vibe/README.md) | Active application | Astro site, React/Vite workspace, Bun/Hono API, and FastAPI/LangGraph agent |
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

Setup starts PostgreSQL, Chroma, and the Python agent and applies database migrations. Turbo then runs the API, scheduler, Vite app, and Astro site.

| Service | Default address |
| --- | --- |
| Public site | `http://localhost:4321` |
| Signed-in workspace | `http://localhost:5173` |
| Bun API | `http://localhost:3000` (`3100` in the local audit configuration) |
| Internal Python agent | `http://localhost:8001` |

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

The local `origin` points to `https://github.com/Feruum/TemplateHack.git`, and the initial branch is `main`. Connecting the remote does not upload files. Staging, commits, and pushing are separate actions.

`.gitignore` excludes dependencies, generated builds, local `.env` files, test artifacts, uploads, and infrastructure state. Environment examples remain versionable. Keep API keys and private data in local configuration.

## Documentation and license

Start with the [application README](vibe/README.md), [architecture](vibe/docs/ARCHITECTURE.md), and [local database guide](vibe/docs/LOCAL_DATABASE.md). Active product decisions are recorded in [CHECKLIST.md](vibe/CHECKLIST.md).

The Vibe-derived application uses Apache License 2.0. Preserve [LICENSE](vibe/LICENSE), [NOTICE](vibe/NOTICE), and the original attribution when distributing it. Reference source retains its own files and notices.
