# SHARED PROTOS

Protobuf schemas for all inter-service RPC. Source of truth for service contracts.

## STRUCTURE

```
shared-protos/
├── admin/v1/admin.proto   # AdminService: document management + ingestion
├── auth/v1/auth.proto     # IdentityService (login) + PermissionService (authz)
├── buf.yaml               # Buf module config (depends on googleapis)
└── package.json           # Workspace package with buf lint script
```

## SERVICES

| Service | Proto | Methods |
|---------|-------|---------|
| AdminService | `admin/v1` | ListDocuments, UploadDocument, DeleteDocument, GetIngestionStatus |
| IdentityService | `auth/v1` | Login, WhoAmI |
| PermissionService | `auth/v1` | CheckPermission |

## WORKFLOW

1. Edit `.proto` files here
2. Run `bun run codegen` (triggers `buf generate` in each app)
3. Generated code lands in:
   - `apps/auth-service/gen/` (Go + ConnectRPC)
   - `apps/agent/src/agent/gen/` (Python + connect-python)
   - `apps/admin-dashboard/src/gen/` (TypeScript + ConnectRPC)

## CONVENTIONS

- Package naming: `{service}.v1` (e.g., `admin.v1`, `auth.v1`)
- Each app has its own `buf.gen.yaml` with language-specific plugins
- Auth-service `buf.yaml` enables lint + breaking change detection
- Proto3 syntax with Google Timestamp imports

## ANTI-PATTERNS

- **NO** editing `**/gen/` directories — always edit protos here and regenerate
- **NO** adding protos outside `{service}/v1/` versioning structure
