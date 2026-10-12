# Local database and storage

The local stack runs PostgreSQL 18 through Docker Compose. The Bun backend and FastAPI agent use separate databases on the same PostgreSQL server. Chroma and uploaded agent files use separate Docker volumes. A separate Compose service provides PostgreSQL for tests.

## Requirements

- Docker Desktop with its engine running on Windows or macOS.
- Docker Engine and the Docker Compose plugin on Linux.
- Bun 1.4+ for the main project.

From the application directory, `vibe/`, verify Compose and the Docker daemon:

```powershell
docker compose version
docker info
```

If Docker is unavailable, start the Docker Engine and repeat these checks. The active local path requires Compose for PostgreSQL, Chroma, and the agent.

## Configure and start

Create a local environment file in PowerShell from `vibe/`, preserving existing settings:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env`. Replace `JWT_SECRET` with a random value of at least 32 characters. To enable chat and document indexing, set compatible OpenAI-style `AGENT_LLM_*` and `AGENT_EMBEDDING_*` values. Do not commit `.env`.

Start the local apps:

```powershell
bun install --frozen-lockfile
bun run dev
```

The script starts Compose services `postgres`, `chroma`, and `agent`. It applies Drizzle migrations, then starts the Bun API and scheduler, the two Vite frontends. Default ports:

| Service | Address | Port variable |
| --- | --- | --- |
| PostgreSQL | `localhost:54329` | `POSTGRES_PORT` |
| Chroma | `localhost:8000` | `CHROMA_PORT` |
| FastAPI agent | `localhost:8001` | `AGENT_PORT` |

PostgreSQL hosts two databases: `web_app_demo` for Bun and `agent` for document metadata and LangGraph checkpoints. `scripts/docker/create-agent-database.sh` creates the agent database on the first PostgreSQL volume initialization. FastAPI initializes its SQLAlchemy tables at startup.

Data is persisted in `postgres_18_data`, `chroma_1_3_data`, and `agent_local_data`. Stopping `bun run dev` stops the app processes but leaves the containers and data. Stop only the infrastructure with:

```powershell
docker compose stop postgres chroma agent
```

## Drizzle migrations

The web app tables are defined in `backend/src/db-schema.ts`. Drizzle Kit generates migrations in `backend/drizzle/`:

```powershell
bun run --cwd backend --env-file=../.env db:generate
bun run --cwd backend --env-file=../.env db:migrate
```

`db:push` syncs the schema directly and is intended only for temporary local experiments. For normal development, generate a migration, review the SQL, and apply it with `db:migrate`.

Default Bun database connection:

```text
host: localhost
port: 54329
database: web_app_demo
user: superuser
DATABASE_URL: postgresql://superuser:superpassword@localhost:54329/web_app_demo
```

Inside the Docker network, the agent uses `postgresql+asyncpg://superuser:superpassword@postgres:5432/agent`. This address is not for the browser or host shell.

## Change ports

If a port is occupied, change `POSTGRES_PORT`, `CHROMA_PORT`, or `AGENT_PORT` in the root `.env`. Compose binds these ports to `127.0.0.1` only. If you change the PostgreSQL port, update the port in `DATABASE_URL` too. The agent connects to PostgreSQL inside Compose by the service name `postgres`, so its URL stays the same.

Also update `AGENT_SERVICE_URL` when changing `AGENT_PORT`. Windows can reserve ports that do not have listening processes. If Docker reports a forbidden socket access, inspect `netsh interface ipv4 show excludedportrange protocol=tcp` and choose a port outside those ranges. This workspace's audit used PostgreSQL port `25432` and browser-test PostgreSQL port `25433`.

## Test database

Compose defines a separate `postgres_test` service with database `web_app_demo_test`, default port `54330`, and volume `postgres_18_test_data`. Start it manually with:

```powershell
docker compose up -d postgres_test
docker compose exec postgres_test pg_isready -U superuser -d web_app_demo_test
```

Test URL:

```text
postgresql://superuser:superpassword@localhost:54330/web_app_demo_test
```

Changing `POSTGRES_TEST_PORT` in `.env` changes the published port. Do not point tests at `web_app_demo`; integration and E2E tests must use the test database. See [TESTING.md](TESTING.md) for commands and test-runner behavior.

## Stop and reset

`docker compose stop` stops containers and preserves data. `docker compose start` restarts them with the same data. Do not run `docker compose down -v` if you need to keep the database, vectors, or uploaded files.

A full reset removes all Compose volumes, including users, documents, vectors, metadata, and checkpoint state:

```powershell
docker compose down -v
```

Then `bun run dev` creates clean databases, starts FastAPI so it can create its schema, and reapplies the Drizzle migrations. The reset permanently removes local data.

## References

- [Docker Compose](https://docs.docker.com/compose/)
- [Official PostgreSQL image](https://hub.docker.com/_/postgres)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
