# Bun API

The Bun/Hono backend owns registration, sign-in, session verification, and the browser API. It is the trust boundary between the signed-in web app and the internal Python agent service.

## Local development

The recommended command from the application directory, `vibe/`, starts the API, website, web app, PostgreSQL, Chroma, and the agent together:

```powershell
bun run dev
```

Create `vibe/.env` from its `.env.example` if it does not already exist. Set `JWT_SECRET` and `AGENT_API_KEY`; configure chat and embedding values when enabling AI. See the application [README](../README.md) for the complete setup and URLs.

To work on the backend alone with the shared `vibe/.env`, run these commands from `vibe/`:

```powershell
docker compose up -d postgres
bun run --cwd backend --env-file=../.env db:migrate
bun run dev:backend
```

## Database

Application tables are defined in `src/db-schema.ts`. Create a migration after changing the schema, then apply it:

```powershell
bun run --cwd backend --env-file=../.env db:generate
bun run --cwd backend --env-file=../.env db:migrate
```

Use `db:studio` to inspect local rows. `db:push` is for disposable experiments only. Do not use it as a replacement for a committed migration.

Drizzle owns Bun API data: users, sessions, reset tokens, uploads, rate limits, and the task outbox. The Python service owns document metadata, thread ownership, and LangGraph checkpoint state in its own PostgreSQL database through SQLAlchemy. It stores vectors in Chroma and uploaded documents on a Docker volume.

This starter expects a new local database. It does not import the old Prisma migration history or migrate a production database.

## Agent API boundary

All `/api/agent/*` routes require the same verified session as account routes. The backend passes the authenticated user ID and `AGENT_API_KEY` to the internal service. The browser must use the Bun API and must not call port `8001` directly.

| Bun route | Agent operation |
| --- | --- |
| `GET /api/agent/modules` | List enabled modules |
| `POST /api/agent/chat/stream` | Stream module, token, tool status, source, error, and end events |
| `POST /api/agent/documents` | Upload a PDF or TXT file (maximum 25 MiB) |
| `GET /api/agent/documents` | List the signed-in user's documents and indexing status |
| `GET /api/agent/documents/:id` | Read one owned document's status |
| `DELETE /api/agent/documents/:id` | Delete one owned document and its vector chunks |

The backend sets `X-User-ID` from the verified principal. It never trusts an identity supplied by the browser. The agent applies owner filters to document queries, vector search, threads, and checkpoint access.

## Commands

```powershell
bun run --cwd backend typecheck
bun run --cwd backend test:unit
bun run --cwd backend test:integration
bun run --cwd backend --env-file=../.env db:generate
bun run --cwd backend --env-file=../.env db:migrate
bun run dev:seed
```

The development seed is optional; account registration works without it. Keep local `.env` files and provider keys out of Git.

See [background jobs](../docs/BACKGROUND_JOBS.md), [file storage](../docs/STORAGE.md), and [agent service](../services/agent/README.md) for module details.
