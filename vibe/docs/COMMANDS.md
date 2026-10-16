# Project commands

The primary workflow runs on localhost. Run Bun commands from the active application directory, `vibe/`.

## Datathon data commands

With Python 3.12+ installed, `bun run datathon:setup` creates an isolated pinned environment. `bun run datathon:test` runs its unittest suite; `bun run datathon:demo` verifies classification/regression on synthetic data. `bun run datathon:eda --help` and `bun run datathon --help` describe real-data options. No Docker or LLM is needed for data analysis. See [the workflow guide](../datathon/README.md) for target/metric selection, group/time splits, artifacts, and privacy.

## Start the stack

```powershell
bun install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Set JWT_SECRET and, for AI, chat and embedding provider settings in .env.
bun run dev
```

`bun run dev` uses Turborepo to run the shared `dev:setup` task once. Setup starts PostgreSQL, Chroma, and FastAPI through Docker Compose and applies Drizzle migrations. After setup succeeds, Turbo starts the Bun API/scheduler, the two Vite frontends in parallel. `bun run dev:local` is an alias for the same workflow. See the [README quick start](../README.md#quick-start) and [LOCAL_DATABASE.md](LOCAL_DATABASE.md).

Ctrl+C stops the application processes. Docker services remain running. To stop those services while preserving their volumes, run `docker compose stop agent chroma postgres`.

## Main commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Full local stack through Turbo |
| `bun run dev:setup` | Start Docker services and apply migrations, without starting the web apps or Bun API |
| `bun run dev:backend` | Standalone Bun API and scheduler; no infrastructure setup |
| `bun run dev:webapp` | Standalone signed-in Vite app; no infrastructure setup |
| `bun run dev:website` | Standalone public React/Vite site; no infrastructure setup |
| `bun run build` | Build workspace apps through Turbo with local caching |
| `bun run typecheck` | Type-check workspace projects through Turbo |
| `bun run architecture:check` | Check module import boundaries |
| `bun run template:check` | Check Markdown and the capability registry |
| `bun run lint` | Run workspace lint tasks through Turbo; currently ESLint for webapp |

Local addresses: site `http://localhost:4321`, app `http://localhost:5173`, API `http://localhost:3000`, internal FastAPI `http://localhost:8001`.

## Turborepo

The root `turbo.json` defines task dependencies and cache behavior. Bun still installs packages and runs workspace scripts. Docker Compose owns the Python agent and stores.

Root Turbo commands start its installed CLI through Node with `--env-file-if-exists=.env`. This loads the root settings before Turbo forwards them to workspace processes. It is required because a bare Turbo command does not load `.env` for applications in other working directories. Node.js 22.12+ is required.

```powershell
# Build one app and its workspace dependencies.
bun run build --filter=@web-app-demo/webapp

# Preview the build task graph without running tasks.
bun run build --dry=json

# Rebuild even when a local cache entry exists.
bun run build --force

# Run the shared infrastructure setup and then only the Vite dev server.
bun run dev --filter=@web-app-demo/webapp
```

`build:webapp`, `build:website`, and `build:backend` are shortcuts for filtered Turbo builds. For a standalone dev server without setup, use the `dev:<workspace>` commands in the table above. Such commands require any services they use to be running already.

Turbo stores its cache under `.turbo`; remote caching is disabled. Frontend build cache keys include their `VITE_*` or `PUBLIC_*` variables, `NODE_ENV`, and root/workspace `.env` files. Dev processes and infrastructure setup are never cached. Migrations run on every full-stack start.

`bun run test` retains the sequential test runners. `bun run test:build-contracts` uses Turbo to build or restore each frontend's `dist` before checking it. The build-contract tests themselves always run.

## Drizzle and seed data

Run backend commands from the root:

```powershell
bun run --cwd backend --env-file=../.env db:generate
bun run --cwd backend --env-file=../.env db:migrate
bun run --cwd backend --env-file=../.env db:push
bun run --cwd backend --env-file=../.env db:studio
bun run --cwd backend --env-file=../.env db:seed
```

`db:generate` creates a migration from `backend/src/db-schema.ts` in `backend/drizzle/`. Review the generated SQL before applying it. `db:migrate` applies migrations to the local PostgreSQL database. `db:push` changes the schema directly and is for local experiments. The development seed creates demo accounts when backend seed values are configured.

These examples explicitly load the root `.env` after selecting `backend/`. Omit `--env-file=../.env` when supplying the settings through your shell or using a separate `backend/.env`. Keep `run` before the workspace and environment flags so Bun executes the requested script. Root `dev:<workspace>` and `dev:seed` shortcuts also load the shared `.env`; they do not start infrastructure. Direct workspace commands such as `bun run --cwd backend dev` require their own workspace environment or exported settings.

The agent uses a separate `agent` database. FastAPI creates its document and LangGraph checkpoint tables at startup. See [LOCAL_DATABASE.md](LOCAL_DATABASE.md) to reset these stores.

## Tests

```powershell
bun run test:contracts
bun run test:backend
bun run test:webapp
bun run test:website
bun run test:infra
bun run test:build-contracts
```

Backend tests that need PostgreSQL use the separate `web_app_demo_test` database, not the development database. See [TESTING.md](TESTING.md) for requirements and limits.

Python agent tests:

```powershell
Push-Location services/agent
uv sync
uv run pytest
Pop-Location
```

The Python package requires Python 3.12+. The complete agent dependencies include AI and vector libraries and may take time to install the first time. The Compose quick start builds the agent service automatically.

## Inactive paths

Terraform, cloud release, Yandex/DigitalOcean, S3, Azure, Go authorization, and Expo helper scripts remain in the repository. They are outside the local stack and are not supported deployment instructions for this product setup.
