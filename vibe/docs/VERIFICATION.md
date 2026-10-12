# Local verification — 2026-10-07

Scope: the active TemplateHack application in `vibe/`, as defined in [CHECKLIST.md](../CHECKLIST.md). The sibling `agentic-rag/` directory is reference source. Cloud deployment, Terraform apply, external production accounts, and mobile are outside this local audit.

The environment used Bun 1.4.2, Node.js 24.19.0, Docker Engine 29.1.2, PostgreSQL 18, and Python 3.12 in the agent container. All checks ran locally.

## Results

| Check | Result |
| --- | --- |
| Frozen Bun dependency installation | Passed |
| Type checks | Passed in all four workspaces |
| Webapp ESLint | Passed |
| Full `bun run check` pipeline | Passed with exit code 0 after the follow-up fixes |
| Bun unit and integration suites | 543 passed, 0 failed, across 84 files |
| Build-contract checks | 2 passed; all four workspace builds completed |
| Python agent tests | 34 passed, 0 failed |
| Chromium browser scenarios | 10 passed, 0 failed |
| RAG runtime scenarios with TXT and PDF | 12 passed, 0 failed, with a controlled local AI provider |
| Private configuration in frontend bundles | No JWT secret or internal agent API key found |
| Standard `bun run dev` launch | Site, workspace, and API returned HTTP 200; scheduler ran successfully |
| Dependency audit | Passed with no known application vulnerabilities; no audit exceptions |
| Pinned optional component generator | `ui:info` passed for `shadcn@4.16.1` through `bunx` |

The Bun suites include 125 infrastructure/script tests, 19 contract tests, 297 backend unit tests, 20 backend integration tests, 75 webapp tests, and 7 website tests. Backend integration tests used their own PostgreSQL instance and removed only that test instance and its storage.

The full pipeline, 34 Python tests, and 10 Chromium scenarios passed again after the dependency and environment fixes. A publication preflight checked all candidate source files, GitHub file-size limits, known credential formats, and actual local private values. It found no credentials in the publication files or frontend bundles. Local environment files and test artifacts remain ignored.

Browser scenarios covered registration, sign-in, session restoration, profile persistence, logout across tabs, recovery from temporary errors, password-reset error handling, avatar upload/replacement/removal, and user/admin permissions. They used a separate `web_app_demo_test` database and synthetic accounts. The test database was removed after the run.

## RAG runtime checks

The RAG audit used a fresh isolated Compose project, real PostgreSQL and Chroma, the built Python image, and the real Bun authentication/proxy. A local deterministic OpenAI-compatible provider supplied test embeddings and chat responses. No external AI credentials or paid model calls were used.

All 12 runtime checks passed. TXT and text-based PDF scenarios verified fresh database initialization, readiness, internal and browser authentication, module discovery, extension and size validation, text extraction, real Chroma indexing, document ownership, trusted tool identity, streaming tokens, source citations, PostgreSQL conversation checkpoints, cross-user retrieval isolation, thread access, and deletion of files and vectors. The PDF response included its page 1 citation.

The test stack and its volumes were removed after each run. The local development volumes were preserved. These checks prove service integration and access boundaries with a controlled provider; they do not measure the answer quality or compatibility of a real external model provider.

## Fixes

- Root Turbo commands explicitly load the root `.env` through Node before starting workspaces. Previously, the backend could start without `DATABASE_URL` or `JWT_SECRET`, and frontend URL settings could be omitted. An isolated real-Turbo regression test checks propagation and reproduces the original failure.
- Standalone `dev:backend`, `dev:webapp`, `dev:website`, and `dev:seed` commands were updated to load the root `.env`. The original probes checked exit codes only. The 2026-10-12 follow-up below corrects a help-only false positive and verifies that the child program actually executes.
- The PostgreSQL initialization script now uses LF line endings. Previously, a Windows bind mount produced `/bin/sh^M: bad interpreter` and left the agent database missing. `.gitattributes` and a regression test preserve the Linux script format.
- The agent Dockerfile installs dependencies directly from `uv.lock` with `uv sync --frozen`. It no longer resolves and downloads newer versions before reverting to locked versions.
- Compatible overrides and `bun.lock` were updated for the affected dependencies. Critical findings in `proxy-addr` and `seroval` were resolved along with the other available fixes.
- Both frontends import an unchanged local copy of the CSS from `shadcn@4.16.1`, with its MIT license and provenance. The component generator and its vulnerable dependency tree are outside the application lockfile. Existing `ui` commands run the pinned generator on demand. Turbo hashes the shared CSS as a global build input.
- The reusable-checklist test factory now resets the recorded validation scope as well as intake answers and checkboxes. This fixes five test failures after project installation without weakening production checklist validation.
- Local settings use API port `3100` and PostgreSQL port `25432`. Windows reserved ports `54329` and `54330` on this machine. Browser tests used `25433`; the RAG fixture used its own separate ports.
- The workspace has a Git repository on `main` and `origin` points to `https://github.com/Feruum/TemplateHack.git`. Local secrets, test artifacts, and persistent data are ignored. The initial publication includes the active application and the clearly marked reference source.

## Remaining limits

The optional `shadcn` generator still reaches `braces@3.0.3` through `fast-glob` and `micromatch`, with the unpatched advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). It is not installed by the normal application dependency workflow. Use trusted component names and registry inputs if running this separate development tool; its advisory is not covered by the clean application audit. See the [style provenance and maintenance instructions](../styles/vendor/shadcn/README.md).

No audit exception was added. All 27 original application audit findings were addressed: 26 through dependency updates, and the remaining `braces` exposure by removing the unused generator dependency tree from application installation and builds.

The normal local `.env` has no external LLM or embedding credentials. Agent liveness works, but full readiness and indexing require a configured embedding provider, and chat returns `LLM_NOT_CONFIGURED` without chat settings. The controlled runtime fixture supplies those settings only to its separate test stack.

The checks also reported dependency deprecation notices and a large lazy Astro JavaScript chunk. These did not fail compilation or the functional scenarios.

On Windows, Turbo needed a second Ctrl+C to finish shutting down after the app listeners had stopped. No application listeners remained on ports `3100`, `5173`, or `4321`. Bun also warns that shared contract files outside the backend directory are not watched; restart the backend after editing `packages/contracts`.

## Repeat the checks

From `vibe/`:

```powershell
bun install --frozen-lockfile
bun run template:check
bun run architecture:check
bun run audit
bun run typecheck
bun run lint
bun run test
bun run test:build-contracts

bun run --cwd webapp e2e:install
$env:TEST_DATABASE_URL = "postgresql://superuser:superpassword@127.0.0.1:25433/web_app_demo_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
bun run e2e:webapp
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:DATABASE_URL
```

Choose another test port if `25433` is occupied or reserved. Python tests and the manual provider-backed RAG flow are described in [TESTING.md](TESTING.md). Root environment loading and explicit standalone migration commands are documented in [COMMANDS.md](COMMANDS.md).

## Follow-up launch — 2026-10-08

The README update changed documentation only. The full test results above remain the 2026-10-07 run. Markdown/link validation and the documentation diff check passed after the update.

`bun run dev` was started as a hidden background process on Windows and left running at the user's request. It uses the existing local `.env` and preserves the development Docker volumes. The outbox scheduler runs normally. Startup logs and the launcher record are kept under the ignored `.artifacts/dev-session-*` directory.

| Endpoint | Observed result |
| --- | --- |
| Public site, `http://localhost:4321/` | HTTP 200 |
| Workspace, `http://localhost:5173/` | HTTP 200 |
| Bun API, `http://localhost:3100/health` | HTTP 200 |
| Agent, `http://localhost:8001/health/live` | HTTP 200 |
| Agent, `http://localhost:8001/health/ready` | HTTP 503 without embedding settings |
| Agent module API without a session | HTTP 401 |

The first site request timed out during cold startup. A subsequent request after warm-up returned HTTP 200. The current configuration still has no real AI provider; account and workspace functionality starts independently of it. Email delivery uses the schema default, `disabled`.

## React/Vite migration — 2026-10-12

The user requested removal of Astro. All thirteen landing sections are React components, and Vite builds the public site. React DOM renders the full landing page to static HTML before publication; the browser hydrates it when idle. The existing page structure, theme, native disclosures, links, metadata, public environment names, and port 4321 are preserved. Astro dependencies, configuration, types, source templates, and generated cache were removed. Static release source now uses `assets/`; no cloud deployment was performed.

| Local check | Result |
| --- | --- |
| Full `bun run check` | Passed, exit code 0 |
| Bun suites | 545 passed, 0 failed, across 85 files |
| Website tests | 9 passed, including metadata escaping and URL validation |
| Root environment propagation | 6 passed; each successful case proves execution with a child-output marker |
| Build contracts and workspace builds | 2 contracts passed; all four workspace builds passed, with local Turbo cache reuse for unchanged outputs |
| Website Storybook production build | Passed with its isolated Vite configuration |
| Architecture validation | Passed for 482 source files |
| Dependency audit | Passed with no known application vulnerabilities and no exceptions |
| Private configuration scan | No actual local JWT secret or internal agent API key in candidate source or frontend bundles |
| Development and production-preview HTTP | `/` and `/index.html` returned 200; HEAD returned 200 with no body; an unknown route returned 404 |

The Bun total comprises 125 script tests, 19 contracts, 297 backend unit tests, 20 backend integration tests, 75 webapp tests, and 9 website tests. Backend integration checks used their isolated PostgreSQL test instance. Python tests, account/workspace Chromium scenarios, and provider-backed RAG scenarios were not rerun for this frontend migration; their results above remain dated 2026-10-07.

The installed agent-browser adapter and Chromium checked the local development server and final production preview. Desktop (1440 × 900) hydration and lazy canvas rendering passed without page errors. Mobile (390 × 844) keyboard menu toggles, section navigation, pointer FAQ toggles, and keyboard FAQ closure passed. Initial content and native disclosures also worked with JavaScript requests blocked. Reduced-motion and WebGL-disabled browsers retained the static scene without requesting the canvas chunk; the fresh disabled-WebGL session had no page or console errors. These are local smoke checks, not production-provider or comprehensive accessibility certification.

Runtime verification found and fixed four defects: Bun flags before `run` printed help and exited 0 without launching a workspace; unconditional custom Vite application handling made production preview return 404; dev middleware initially omitted HEAD; and an unclipped launch-kit halo caused four pixels of mobile overflow. A WebGL2 probe also prevents the existing canvas initializer from producing an uncaught rejection when GPU support is disabled. The strengthened environment tests reproduced the help-only failure before the command fix.

The desktop canvas still emits the existing `THREE.Clock` deprecation warning. Vite reports its large lazy 3D chunk; the build contract confirms that this chunk remains separate and is not eagerly preloaded. Both warnings are non-fatal. Real AI and email configuration requirements remain unchanged.

### Full-stack launch after migration

The normal `bun run dev` command rebuilt the agent image, started local Compose services, applied database migrations, and started both Vite servers, Bun API, and scheduler. The first build reported the pinned uv image as missing. Registry inspection confirmed the exact pinned digest, and retrying its pull succeeded; no Dockerfile or dependency version change was needed. The second normal launch succeeded and remains running as a hidden background process. Its launcher record and logs are under the ignored `.artifacts/dev-session-20261012-124646-53d9dc` directory. Development Docker volumes were preserved.

| Endpoint | Observed result |
| --- | --- |
| `http://localhost:4321/` | HTTP 200 |
| `http://localhost:5173/` | HTTP 200 |
| `http://localhost:3100/health` | HTTP 200 |
| `http://localhost:8001/health/live` | HTTP 200 |
| `http://localhost:8001/health/ready` | HTTP 503; embedding settings are still absent |
| `http://localhost:3100/api/agent/modules` without a session | HTTP 401 |
