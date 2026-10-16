# Checks and tests

The active test workflow runs locally. Run these commands from the application directory, `vibe/`. Bun integration tests, Docker smoke, and Playwright use the separate PostgreSQL database `web_app_demo_test`. Do not run them against the development database `web_app_demo`.

## RAG chat interface libraries

Run `bun run --cwd webapp test` for the assistant-ui adapter/SSE regression tests. Run `bun run --cwd webapp e2e agent.spec.ts` for the existing real account/API harness with controlled RAG responses and its isolated test PostgreSQL database. The browser cases cover desktop/mobile chat, sources/tools, module selection, uploads, terminal SSE/HTTP errors, stop, and recovery. They require the installed Chromium runner and do not prove real-provider answer quality. See [CHAT_UI.md](CHAT_UI.md) for ownership and reproduction details.

## Fast checks

```powershell
bun run typecheck
bun run architecture:check
bun run test:contracts
bun run test:webapp
bun run test:website
```

After changing backend module dependencies, run `bun run architecture:check`. For a full local run, use `bun run check`. It includes template/Markdown validation, a dependency audit, type checks, lint, tests, and builds for build-contract checks. The full run needs package registry access and Docker.

## Run Drizzle migrations on a clean database

Start the separate test PostgreSQL service and check readiness:

```powershell
docker compose up -d postgres_test
docker compose exec postgres_test pg_isready -U superuser -d web_app_demo_test
```

Set `TEST_DATABASE_URL` to the test database, then point `DATABASE_URL` at the same URL for Drizzle Kit and run the backend integration suite:

```powershell
$env:TEST_DATABASE_URL = "postgresql://superuser:superpassword@localhost:54330/web_app_demo_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
bun run --cwd backend db:migrate
bun run test:backend:integration
```

The test schema contains the auth/users tables. Cover registration, sign-in, session restoration, and rejection from protected routes without a valid session. Pass a path relative to `backend/` and a test-name filter when the selected runner supports them.

Backend suites:

```powershell
bun run test:backend:unit
bun run test:backend:integration
bun run test:backend
```

Unit tests do not need services. Integration tests use Docker PostgreSQL when the runner manages it, or an explicit `TEST_DATABASE_URL`. Check `backend/scripts/test-integration.mjs` and the selected test file before running; service setup and cleanup depend on the runner.

## Datathon tests

The separate datathon environment is checked with `bun run datathon:setup`, then `bun run datathon:test`. `bun run datathon:demo` runs real local synthetic classification/regression workflows and renders EDA reports. These checks are separate from `bun run check`, which covers the web/API workspaces; the Python analytics environment is optional for web-only contributors. See [datathon/README.md](../datathon/README.md) for its data and evaluation boundaries.

## Python agent tests

The agent requires Python 3.12+. From PowerShell:

```powershell
Push-Location services/agent
uv sync --frozen
uv run pytest
Pop-Location
```

Unit tests cover the module registry, module selection, internal authentication, streaming, SQLAlchemy checkpoint persistence, and user-scoped document access. They do not replace a run with a real LLM and Chroma service.

## RAG workflow

To exercise the product flow through the UI, configure `.env`, install dependencies, and start `bun run dev`. Then:

1. Register a user and sign in to the Vite app.
2. Upload a text-based PDF or TXT file up to 25 MiB.
3. Wait for status `COMPLETED`.
4. Ask a question answered by the file. Confirm that the response streams and includes the source filename and page when available.
5. Sign in as another user. Confirm that the other account's documents and search results do not include the first user's file.
6. Check an unsupported extension, a file over the size limit, an unknown `module_id`, and an unavailable agent service.

This flow sends prompts and retrieved text snippets to the configured LLM/embedding provider. Use a valid API endpoint, chat model, and embedding model. Reranking is disabled by default.

Use the existing webapp Playwright harness for its automated scenarios:

```powershell
bun run --cwd webapp e2e:install
$env:TEST_DATABASE_URL = "postgresql://superuser:superpassword@127.0.0.1:25433/web_app_demo_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
bun run e2e:webapp -- auth.spec.ts -g "registers"
```

The harness applies Drizzle migrations and seeds only the test database after validating its name. Existing E2E scenarios are limited to files under `webapp/e2e`; the manual RAG flow is not itself automated.

Set the explicit test URL when the root `.env` defines the development `DATABASE_URL`; otherwise the harness correctly rejects that database. Port `25433` is an example. Use a free port outside Windows reserved ranges. The harness maps the chosen port into Compose automatically. Run `bun run e2e:webapp` without a file filter for all existing browser scenarios.

## Containers and local state

```powershell
docker compose logs --tail 100 agent
docker compose logs --tail 100 chroma
docker compose ps
```

Compose volumes preserve PostgreSQL, Chroma, and agent files. Do not run `docker compose down -v` if you need this data. See [LOCAL_DATABASE.md](LOCAL_DATABASE.md) for test database, port, and reset details.

## Inactive checks

Mobile Maestro, Terraform deployments, cloud smoke tests, Azure, Go auth, and external production accounts are outside this starter's local test workflow. Old scripts may remain in the repository; check them against the current local docs and package scripts before use.
