# INFRASTRUCTURE

Configuration files for external services. Not application code — declarative configs only.

## STRUCTURE

```
infra/
├── kratos/
│   ├── kratos.yaml              # Ory Kratos config (DSN, CORS, SMTP courier, hooks)
│   └── identity.schema.json     # Identity schema (email trait for registration)
├── postgres/
│   └── init-db.sql              # Creates databases: kratos, spicedb, agent + documents table
├── spicedb/
│   └── schema.zed               # Zanzibar-style ReBAC: user, organization, document, agent_session
└── traefik/
    └── traefik.yaml             # Reverse proxy: Docker provider, web/websecure/grpc entrypoints
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add authorization rule | `spicedb/schema.zed` — define relations + permissions |
| Add identity field | `kratos/identity.schema.json` — JSON Schema traits |
| Change Kratos behavior | `kratos/kratos.yaml` — flows, hooks, courier |
| Add new database | `postgres/init-db.sql` — CREATE DATABASE statement |
| Change routing | `traefik/traefik.yaml` + Docker labels in `docker-compose.yaml` |

## KEY DETAILS

### SpiceDB Schema (Zanzibar ReBAC)
- `user` → base definition
- `organization` → admin/member relations, can_manage/can_view permissions
- `document` → owner/editor/viewer + org relation, inherited permissions
- `agent_session` → owner-only access

### PostgreSQL
Single instance, three databases: `kratos`, `spicedb`, `agent`.
Agent DB has `documents` table (UUID PK, filename, status, metadata JSONB).

### Traefik
Routes `*.localhost` → services via Docker labels. Entrypoints: web (80), websecure (443), grpc (50051).
Uses `traefik-public` network for external routing.

### Kratos
DSN from environment. SMTP courier for email verification (MailDev in dev).
Hooks: `session` after login, `show_verification_ui` after registration.
