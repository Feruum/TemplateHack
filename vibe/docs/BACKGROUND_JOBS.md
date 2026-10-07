# Local background jobs

This guide covers Bun backend background processes included in the local stack. Older instructions about DigitalOcean and Yandex timers and deployments do not apply to the active Hackathon Starter workflow.

## Backend scheduler

The job registry is `backend/src/jobs.ts`; schedules are in `backend/src/job-schedules.json`. During development, `bun run --cwd backend dev` starts the API and scheduler as separate processes. The root `bun run dev` uses this command. The scheduler uses PostgreSQL advisory locks to prevent two scheduler processes from running the same job at the same time.

| Job | Schedule | Purpose |
| --- | --- | --- |
| `outbox:drain` | Every minute | Process durable one-off tasks from PostgreSQL |
| `uploads:pending:cleanup` | Hourly at minute 15 | Remove abandoned avatar uploads |
| `auth:sessions:cleanup` | Daily at 03:00 UTC | Remove expired sessions, reset tokens, and rate-limit windows |

Run a single job or start only the scheduler with:

```powershell
bun run --cwd backend start:cron -- outbox:drain
bun run --cwd backend start:scheduler
```

Do not run these commands without a local `.env` and a working PostgreSQL service.

## Add a scheduled job

1. Add the operation to `backend/src/jobs.ts`, using the Drizzle dependency from the runtime.
2. Add a schedule to `backend/src/job-schedules.json`. The file validates job names and defines the interval.
3. Make the operation safe to repeat: a process crash causes another run on the next tick.
4. Add a test next to the behavior owner and a backend integration scenario if the job changes data.

Scheduled jobs must not depend on which API instance accepted a request.

## Durable one-off work

Use the outbox for work that must survive an API response and a process restart. Rows are stored in the PostgreSQL `task_outbox` table. Add the handler to the `taskHandlers` registry in `backend/src/outbox/handlers.ts`. Enqueue work at the point where the business decision is made; use the same business transaction when the code supports it.

Make handlers idempotent. A process can stop after an external side effect but before it records success. Ordinary errors schedule a retry; invalid input should use the existing terminal error mechanism. Do not put secrets or personal data in error logs.

Use a deterministic deduplication key for repeated requests. A new task type does not require a schema change; the type is registered in code.

## Agent documents

PDF/TXT ingestion is handled separately by FastAPI. It stores metadata and job state in its own SQLAlchemy database, files in local storage, and embeddings in Chroma. The service resumes unfinished local jobs after startup. This path does not use the Bun outbox or scheduler.

Indexing requires a configured embedding endpoint and model. If indexing fails, inspect the document status in the workspace and the Docker logs:

```powershell
docker compose logs --tail 100 agent
docker compose logs --tail 100 chroma
```

## Local operations

Compose applies restart policies to infrastructure containers as defined in `docker-compose.yml`. App processes stop with `bun run dev`. Persistent data remains in Docker volumes until removed. Cloud timers, worker deployments, production alerts, Azure Service Bus, and Redis are outside the current setup. Design and verify those separately before enabling them.
