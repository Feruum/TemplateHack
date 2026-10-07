# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-06
**Commit:** c307f16
**Branch:** development

## OVERVIEW

Polyglot Turborepo monorepo: LangGraph RAG agent (Python/FastAPI) + Go auth service (ConnectRPC/Kratos/SpiceDB) + Next.js 16 admin dashboard. Proto-first RPC design with Buf code generation. Traefik reverse proxy for local `*.localhost` routing.

## STRUCTURE

```
agentic-rag-monorepo/
├── apps/
│   ├── admin-dashboard/   # Next.js 16 + React 19 + Tailwind 4
│   ├── agent/             # Python 3.12 + FastAPI + LangGraph
│   └── auth-service/      # Go 1.23 + ConnectRPC + Kratos
├── libs/
│   └── shared-protos/     # Protobuf schemas (auth/v1, admin/v1)
├── infra/                 # Kratos, SpiceDB, PostgreSQL, Traefik configs
├── envs/                  # Environment configs (dev/prod)
├── square-ui/             # UI template collection (reference only)
├── ai-chatbot/            # Standalone chat prototype (not integrated)
├── docker-compose.yaml    # Multi-profile orchestration
├── turbo.json             # Turborepo pipeline
└── package.json           # Workspace root (bun@1.2.4)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint (agent) | `apps/agent/src/agent/routes/` | FastAPI routers, register in `server.py` |
| Add RPC service | `libs/shared-protos/` → `bun run codegen` | Proto-first: define schema, generate code |
| Add UI component | `apps/admin-dashboard/src/components/` | Radix + CVA + Tailwind |
| Add UI page | `apps/admin-dashboard/src/app/` | Next.js App Router, route groups with `()` |
| Auth middleware | `apps/auth-service/internal/middleware/` | Kratos session validation + SpiceDB authz |
| Authorization rules | `infra/spicedb/schema.zed` | Zanzibar-style ReBAC |
| Agent tools | `apps/agent/src/agent/tools/` | LangGraph @tool definitions |
| Vector retrieval | `apps/agent/src/agent/retrieval/` | HybridRetriever (BM25 + dense + reranker) |
| Agent graph workflow | `apps/agent/src/agent/graphs/workflow.py` | StateGraph: fetch_memory → agent → tools → summarize |
| Chat streaming (frontend) | `apps/admin-dashboard/src/hooks/use-agent-chat.ts` | SSE parsing, tool call tracking |
| Configuration | `apps/{app}/` → settings.py, config.go, constants.ts | App-specific |
| Environment vars | `envs/{dev,prod}/.env` | Docker Compose loads via `APP_ENV` |
| Infrastructure | `infra/{service}/` | Kratos, SpiceDB, PostgreSQL, Traefik |

## CONVENTIONS

### Proto-First RPC
1. Define schemas in `libs/shared-protos/{service}/v1/{service}.proto`
2. Each app has `buf.gen.yaml` with language-specific plugins
3. Run `bun run codegen` → regenerates all apps
4. Generated code lands in `apps/{app}/**/gen/`
5. Services: AdminService (documents), IdentityService (login), PermissionService (authz)

### Turborepo Tasks
- `bun run dev` → all dev servers
- `bun run build` → build all (codegen runs first)
- `bun run test` → all tests
- `bun run lint` → all linters (biome for TS, ruff for Python)
- `bun run codegen` → regenerate protobuf code
- Filter: `bunx turbo build --filter=admin-dashboard`

### TypeScript (admin-dashboard)
- `verbatimModuleSyntax: true` — explicit `import type`
- `noUncheckedIndexedAccess: true` — strict array/object access
- Path alias: `@/*` → `src/*`
- Linter/formatter: **Biome** (not ESLint/Prettier) — double quotes, 100 line width
- Styling: **Tailwind 4** only (no CSS modules)
- Icons: HugeIcons (`@hugeicons/react`) + Lucide

### Python (agent)
- Package manager: **uv** (not pip), PyTorch CPU index for torch deps
- Structured logging: **structlog** with JSON in prod — `from agent.utils import get_logger`
- Observability: **OpenTelemetry** (FastAPIInstrumentor)
- Testing: pytest with `asyncio_mode = "auto"`
- Settings: Pydantic with `AGENT_` env prefix
- Barrel exports: `__init__.py` with `__all__` for every module

### Go (auth-service)
- Standard `cmd/server/main.go` + `internal/` layout
- Logging: **slog** with JSON handler
- ConnectRPC handlers implement generated interfaces
- Compile-time checks: `var _ Interface = (*Handler)(nil)`
- Domain errors in `internal/domain/errors.go`
- h2c (cleartext HTTP/2) for internal communication

### Docker Compose
- Profiles: `dev`, `staging`, `prod`
- Env files: `envs/${APP_ENV:-dev}/.env`
- Internal networking via container names (e.g., `http://auth-service:8081`)
- External routing via Traefik `*.localhost` labels

## ANTI-PATTERNS (THIS PROJECT)

- **NO** `as any`, `@ts-ignore`, `@ts-expect-error` in TypeScript
- **NO** `print()` in Python (use structlog logger)
- **NO** editing files in `**/gen/` (auto-generated, will be overwritten)
- **NO** hardcoding service URLs (use environment variables)
- **NO** committing `.env` files (only `.env.example`)
- **NO** CSS modules in dashboard (Tailwind only)
- **NO** direct ChromaDB access in agent (use HybridRetriever)
- **NO** panics in Go handlers (return connect errors)
- **NO** broad exception catches without logging in Python
- **NO** ESLint/Prettier in dashboard (use Biome)

## SERVICE DEPENDENCIES

```
PostgreSQL → Kratos-migrate → Kratos ──┐
           └→ SpiceDB ─────────────────┼→ auth-service ──┐
           └→ Dragonfly ───────────────┼→ agent ─────────┼→ admin-dashboard
           └→ Chroma ──────────────────┘                 │
                                                         └→ Traefik (reverse proxy)
```

## COMMANDS

```bash
# Development
APP_ENV=dev docker compose --profile dev up --build

# Production
APP_ENV=prod docker compose --profile prod up -d

# Individual services
bun run agent          # turbo dev --filter=agent
bun run auth           # turbo serve --filter=auth-service
bun run dashboard      # turbo dev --filter=admin-dashboard

# Build/Test
bun run build          # turbo build
bun run test           # turbo test
bun run lint           # turbo lint
bun run codegen        # regenerate protobuf code
bun run typecheck      # type-check TypeScript
```

## LOCAL DEVELOPMENT URLS (via Traefik)

| Service | URL |
|---------|-----|
| Dashboard | http://dashboard.localhost |
| Agent API | http://agent.localhost |
| Auth Service | http://auth.localhost |
| Kratos Public | http://kratos.localhost |
| Kratos Admin | http://kratos-admin.localhost |
| ChromaDB | http://chroma.localhost |
| SpiceDB | http://spicedb.localhost |
| Maildev | http://mail.localhost |
| Traefik Dashboard | http://traefik.localhost:8080 |

## NOTES

- **Traefik**: Reverse proxy handles all HTTP routing; services don't expose ports directly (except Traefik 80/443, Dragonfly 6379)
- **Ollama**: Runs on host, accessed via `host.docker.internal:11434`
- **PostgreSQL**: Single instance, multiple databases (kratos, spicedb, agent)
- **Branching**: main (prod) → staging → feature/*
- **Default git base**: `main`
- **No CI/CD**: No GitHub Actions workflows; testing/linting is manual
- **square-ui/**: UI template reference library — not part of build pipeline
- **ai-chatbot/**: Standalone prototype — not in workspace or turbo tasks
- **Nested gen/ dirs**: `apps/agent/apps/` and `apps/auth-service/apps/` contain duplicate gen paths from buf misconfiguration — ignore these
- **Testing**: Only agent has tests (pytest). No tests for admin-dashboard or auth-service yet
- **Multilingual**: Agent prompts include Russian/Kazakh query expansion
