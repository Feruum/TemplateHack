# Agentic RAG Monorepo

This directory is reference source in the TemplateHack workspace. The active local application is in [../vibe](../vibe/README.md); use the [workspace quick start](../README.md#quick-start-on-windows). The commands below describe the original standalone project and are not part of the active launch path.

## Development Workflow

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Python 3.11+
- Go 1.22+

### Quick Start (Development)
The project uses **Docker Compose Profiles** to manage environments.

1. **Start Development Environment**:
   ```bash
   # Starts all services with 'dev' profile (includes maildev, etc.)
   APP_ENV=dev docker compose --profile dev up --build
   ```

2. **Environment Configuration**:
   - Configurations are managed in `envs/`.
   - `envs/dev/.env`: Development variables (auto-loaded in dev profile).
   - `envs/prod/.env`: Production variables.
   
   Secrets should **not** be committed to git.

### Production Deployment
For production, use the `prod` profile:

```bash
APP_ENV=prod docker compose --profile prod up -d
```

### Profiles
- `dev`: Includes development tools (MailDev) and debug modes.
- `staging`: Staging environment parity.
- `prod`: Optimized for production, secure defaults.

## Branching Strategy
- `main`: Production-ready code.
- `staging`: Pre-production testing.
- `feature/*`: Feature branches (merge to staging).
