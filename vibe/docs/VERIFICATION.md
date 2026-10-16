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

## Datathon preparation — 2026-10-16

Scope: the new standalone `datathon/` CLI, its root command wrapper, documentation, and normal local application startup. No official competition dataset or brief was available for this preparation. No cloud checks, deployment, or paid model calls were performed.

The environment used Bun 1.4.2, Python 3.12.14 in `datathon/.venv`, and Docker Engine 29.8.2. The approved Python libraries and their transitive dependencies are pinned in `datathon/requirements.lock`: pandas 3.0.6, scikit-learn 1.9.1, and matplotlib 3.11.2. Setup installed the isolated environment successfully; `pip check` reported no broken requirements. The Bun audit does not audit these Python packages.

| Local check | Result |
| --- | --- |
| `bun run datathon:setup` | Passed; pinned installation and `pip check` |
| `bun run datathon:test` | 24 passed, 0 failed |
| `bun run datathon:demo --output=.artifacts/datathon-final-20261016` | Passed for classification and regression; reports and JSON/CSV artifacts saved |
| Full `bun run check` | Passed, exit code 0 |
| Bun suites | 547 passed, 0 failed, across 86 files |
| Build contracts | 2 passed; all four workspace builds completed with local cache reuse for unchanged outputs |
| Architecture, type checks, and lint | Passed; architecture checked 482 source files |
| Bun dependency audit | Passed with no known application vulnerabilities |
| Report charts | Embedded PNGs generated; missing-value and distribution charts inspected locally |
| Publication preflight | 27 candidate files and frontend build outputs checked; no actual local JWT secret or internal agent API key found; local inputs, reports, and environments are ignored |
| Normal full-stack launch | Site, workspace, API health, and agent liveness returned HTTP 200; outbox scheduler ran |

The Bun total comprises 127 script tests, 19 contracts, 297 backend unit tests, 20 backend integration tests, 75 webapp tests, and 9 website tests. Backend integration checks used their isolated test PostgreSQL instance. Existing agent Python tests, browser scenarios, and provider-backed RAG checks were not rerun; their earlier dated results above remain historical.

The datathon tests cover supported table loading, malformed/duplicate CSV headers and records, missing targets, invalid configuration, deterministic stratified splits, group and time isolation, train-only preprocessing, known metric arithmetic, complete class coverage, prediction schema and category/boolean types, original ID/order retention, ID/report-name collisions, escaped HTML, output ownership, multiclass prediction, and both end-to-end demo tasks. Review found and corrected CSV index inference, prediction type drift, incomplete-class validation, and root `--flag=value` path handling before publication. The final focused review found no remaining issues in those fixes.

### Synthetic demo results

Each task used 300 synthetic rows, seed 42, and a 240/60 train/validation split. The ID was excluded from model features. These figures verify the workflow on deliberately learnable synthetic data; they do not estimate performance on the competition case.

| Task and primary metric | Dummy | Linear | Selected |
| --- | --- | --- | --- |
| Classification: balanced accuracy, higher is better | 0.500000 | 0.969697 | Logistic regression |
| Regression: RMSE, lower is better | 29.691848 | 3.464802 | Ridge |

The complete reports are retained locally under ignored `.artifacts/datathon-final-20261016/{classification,regression}/report.html`. Inputs and run outputs are excluded from publication. Choose the official target, metric, valid split, and submission format when the brief arrives; confirm the rules for prepared code and external tools.

### Application launch

Docker Desktop and the normal `bun run dev` stack were started as hidden processes. The stack remains running. The launcher record and logs are retained under ignored `.artifacts/datathon-dev-20261016-145733/`. Existing development volumes were preserved.

| Endpoint | Observed result |
| --- | --- |
| `http://localhost:4321/` | HTTP 200; full public-page HTML returned |
| `http://localhost:5173/` | HTTP 200 |
| `http://localhost:3100/health` | HTTP 200 |
| `http://localhost:8001/health/live` | HTTP 200 |
| `http://localhost:8001/health/ready` | HTTP 503; embedding settings are absent |
| `http://localhost:3100/api/agent/modules` without a session | HTTP 401 |

The site needed warm-up on its first request; subsequent requests succeeded. Real LLM/embedding settings remain absent, and mail remains disabled. The datathon CLI does not require these providers or the running web stack. The existing lazy 3D chunk size warning remains non-fatal.

## RAG consolidation — 2026-10-16

The user approved one Python agent inside `vibe`, useful search/memory features, verification, and removal of the outer reference directory. The canonical service now includes owner-filtered dense/BM25L retrieval with reciprocal rank fusion and explicit PostgreSQL-backed personal notes. Bun owns authentication and proxies note management; React provides the memory card. Models get a read-only memory tool whose owner is injected by the graph.

| Local check | Result |
| --- | --- |
| Full Python agent suite in an isolated container | 43 passed, 1 skipped; the skipped PostgreSQL concurrency scenario ran separately below |
| Separate PostgreSQL memory suite | 5 passed, including HTTP owner isolation, persistence across connections, forged model-owner rejection, database fixture guard, and atomic concurrent quota |
| Full FastAPI startup without model credentials | Passed; liveness, authenticated note creation/list/delete, and unauthenticated rejection verified through HTTP |
| Real ephemeral Chroma with controlled embeddings | Exact-code and Unicode keyword recovery, owner filtering, chunk deduplication, deletion, and bounded-corpus dense fallback passed |
| Full `bun run check` | Passed with 550 Bun tests and 2 build contracts; type checks, lint, architecture, dependency audit, and workspace builds completed |
| Final frontend compatibility checks | Webapp type check and targeted ESLint for `MemoryCard.tsx` / `api.ts` passed after concurrent UI changes |
| Outer reference removal preflight | 263 tracked files; no modified, untracked, ignored, or nested Git files |
| Private configuration scan | 100 candidate source/doc files scanned; no actual local private values found |

The full Bun result covers the checkout snapshot during that run. A separate ongoing UI task subsequently changed the chat/components and dependencies. Its temporary missing `motion-tokens` import blocked one repeat type check; the later type check passed. Those UI edits were preserved. This consolidation's targeted lint used Bun to execute the existing ESLint installation.

Python tests used the current service source mounted read-only into the already-built locked agent image. Chroma fixtures used deterministic deliberately weak embeddings to distinguish vector-only and keyword recovery. Memory tests used temporary SQLite and a fresh PostgreSQL 18 container on a private test network with no host port or persistent volume. The portable `services/agent/scripts/test-memory-postgres.ps1` helper passed and removed its own PostgreSQL container/network. Development containers and volumes were not restarted or removed.

These tests establish retrieval behavior, persistence, and access boundaries. They do not measure real-provider answer accuracy, semantic retrieval quality, or calibration. No paid/external model calls were made. The existing LangChain/python-json-logger deprecation warnings and lazy 3D chunk warning remain non-fatal.

The original source remains recoverable through Git history, including `daa06fe`. The [consolidation guide](RAG_CONSOLIDATION.md) records the capability disposition, local search limits, memory controls, and the command to rebuild an already-running old agent image. Source changes in this side conversation were left local; staging, commit, push, and restarting the main conversation's running stack were outside its scope.

## assistant-ui and Arc Free — 2026-10-16

Scope: the existing signed-in RAG chat and selected Arc Free components. The user explicitly requested publication of UI changes only. Separate RAG/memory/consolidation changes were present and continued in the working tree; they remain unpublished by this commit. Shared Markdown and AgentWorkspace changes were staged selectively, preserving the other work.

assistant-ui 0.15.29 LocalRuntime replaces the handwritten chat/composer lifecycle. A feature-local adapter retains the authenticated SSE proxy, stable server thread ID, selected module, text, source citations, and server tool statuses. Arc Free EmptyState/Badge source, motion tokens, and the MIT license are checked in with scoped theme aliases, Hugeicons, and Typography. Motion 14.3.0 is pinned. assistant-ui Cloud is not configured.

| Local check | Observed result |
| --- | --- |
| Full working-tree bun run check | Passed, exit code 0: template validation, architecture, Bun audit, types, lint, suites, and builds |
| Working-tree Bun suites | 561 passed, 0 failed, across 87 files; includes 3 tests from the separate unpublished RAG work |
| Webapp suite | 86 passed, 0 failed; includes 9 model-adapter tests and 4 SSE tests |
| Build contracts | 2 passed; all four workspace builds completed with local cache reuse |
| UI-only publication TypeScript | Passed against 196 indexed webapp source files, with unpublished MemoryCard excluded |
| UI-only publication production build | Passed using indexed AgentWorkspace, agent API, and contracts; unpublished memory dependencies excluded |
| Chromium RAG UI scenarios | 4 passed: 1440px desktop, 390px mobile/reduced-motion/dark theme, SSE error/stop/recovery, and HTTP 503 error message |
| Review | Two lifecycle/error findings reproduced and fixed; focused follow-up found no remaining significant issues |

The full Bun total comprises 127 script tests, 21 contracts, 298 backend unit tests, 20 backend integration tests, 86 webapp tests, and 9 website tests. It describes the working tree during the check, not a claim that unpublished RAG work is part of this UI release. Published UI-specific TypeScript, production, and browser checks read the actual indexed candidate for the shared files.

Browser scenarios used the existing real account/API harness and isolated test PostgreSQL database. RAG responses were controlled at the browser network boundary; requests still carried the real test access token. Tests verified automatic/explicit module selection, stable server thread identity, citations/page/snippet retention, server tool status, unsupported upload rejection, valid TXT upload UI, stop, and sending after failure. They also reproduced the structured HTTP 503 error before its fix. These scenarios do not test real-provider answer quality, real document indexing, or retrieval. Earlier agent/RAG evidence remains dated separately above. Development volumes were preserved; the harness removed only its test database.

Regression checks also prove incremental text, legacy event compatibility, bounded/filtered history, source deduplication, callback error propagation, cancellation of an idle reader, missing-end interruption, and recovery after an individual server tool fails. Individual tool failures no longer terminate a recoverable server run. Structured AssistantError messages remain actionable in the UI.

Production build warning: the existing shared vendor grouping produces a roughly 942 kB minified webapp vendor chunk (286 kB gzip) with these libraries. The build succeeds; loading performance on slow devices/networks was not benchmarked. Motion emits its expected development warning when reduced motion is enabled. Real LLM/embedding configuration is still required for AI answers and indexing; UI dependency installation does not supply credentials. No cloud deployment or cloud checks were performed.

## Combined RAG memory and interface publication — 2026-10-16

The user subsequently authorized committing all remaining work. This publication combines the RAG consolidation and explicit private memory with the already-published assistant-ui/Arc Free integration. The application [design.md](../design.md) now records library versions, responsibilities, visual conventions, and maintenance rules; the root, application, and webapp READMEs link to it.

Review reproduced a private-client-cache defect: memory notes remained in QueryClient after sign-out because their keys were outside the shared session namespace. Module, document, and memory queries now use session-scoped, owner-specific keys and forward cancellation signals. Changing accounts remounts the workspace to clear chat and drafts. Four regression checks failed before the correction; all five new cache checks passed afterward. Focused follow-up review found no remaining significant issues in the correction.

| Local check | Observed result |
| --- | --- |
| Full `bun run check` | Passed, exit 0; template validation, architecture (490 source files), dependency audit, types, lint, suites, and builds |
| Bun suites | 566 passed, 0 failed, across 88 files |
| Webapp suite | 91 passed, including five new session-cache/cancellation checks |
| Build contracts | 2 passed; webapp production build completed against the combined source |
| Python agent suite | 43 passed, 1 PostgreSQL-only case skipped; read-only source mount, isolated fixtures, no network |
| Isolated PostgreSQL agent suite | 5 passed, including concurrent quota enforcement, persistence, HTTP ownership, and trusted tool identity |
| Combined-source Chromium suite | 4 passed in 49.7 seconds; real account/API harness, separate test PostgreSQL, controlled RAG responses |
| Updated local agent | `docker compose up -d --build agent` passed; existing development PostgreSQL/Chroma volumes preserved |
| Local endpoint checks | Site, workspace, Bun API health, and agent liveness returned 200; agent readiness remained 503 without embedding configuration |
| Final Markdown validation | Passed after placing `design.md` inside the application and correcting its local links |
| Publication preflight | 39 staged source/doc files and 28 frontend outputs scanned; no actual local JWT/internal-agent secrets, private/generated paths, or files of 100 MiB or more |

The Bun total comprises 127 script tests, 21 contract tests, 298 backend unit tests, 20 backend integration tests, 91 webapp tests, and 9 website tests. The browser scenarios exercise both desktop and narrow dark/reduced-motion viewports, sources/tools, module choice, uploads, note save/reload/delete, HTTP/SSE errors, cancellation, and recovery. Desktop/mobile screenshots of the combined page were inspected. Browser RAG responses are controlled and do not establish real-model quality or indexing. The isolated PostgreSQL helper removes only its own containers/network; the browser harness removes its own test database.

Logs remain in ignored `.artifacts/combined-check-20261016.log`, `.artifacts/combined-browser-20261016.log`, and `.artifacts/combined-agent-rebuild-20261016.log`. The normal development applications remain running at `http://localhost:4321/` and `http://localhost:5173/app/assistant`; login is required for the workspace. This is a local launch. External chat/embedding credentials and representative labeled questions remain necessary before making real RAG-quality claims. The previously recorded bundle/deprecation warnings remain non-fatal.

## Active Arc Free interface — 2026-10-16

The active public site and workspace now use official copied MIT Arc Free components through presentation adapters. assistant-ui retains the conversation and composer. No Arc Pro source is included. [ARC_MIGRATION.md](ARC_MIGRATION.md) records the exact shadcn fallbacks, catalog tier evidence, source provenance, and compatibility boundaries. [design.md](../design.md) and the root/application/webapp/website READMEs record the stack and maintenance rules.

| Local check | Observed result |
| --- | --- |
| Full `bun run check` | Exit 0: template/Markdown, architecture, dependency audit, types, lint, 570 Bun tests at that run, both builds, and 2 build-contract checks |
| Final webapp source | Types, lint, 97 tests, production build, and production CSS contract passed after the final UserMenu/NavMain corrections |
| Website source | Types/build passed after accessible menu-name correction; 9 website tests and the static build contract passed in the full check |
| Workspace Chromium coverage | 18 distinct scenarios covered across the full run and targeted reruns; real account/API/isolated PostgreSQL, with controlled RAG responses |
| Final mobile regression | 6 passed: the expanded 390px and 700px scenarios each repeated three times, including exit pointer events, focus preservation, first/second Escape, Settings navigation, and logout |
| Public production Chromium | 7 passed: desktop/mobile/tablet with JS enabled/disabled, plus desktop with WebGL disabled; anchors, multiple FAQ panels, keyboard controls, reduced motion, static hero fallback, and no page/console errors |
| Invalid-field focus | Real empty login submission marked email/password invalid; each retained a visible 2px keyboard focus outline in Chromium |
| Runtime screenshot review | All 20 workspace/auth/admin route captures inspected at desktop/mobile, plus public hydrated/native and FAQ captures |
| Normal local launch | Public site, webapp, Bun API health (configured port 3100), and agent liveness returned 200; agent readiness remained 503 without embeddings |

The full Bun total was 127 script, 21 contract, 298 backend unit, 20 backend integration, 95 webapp, and 9 website tests. Two additional local-avatar checks were present in the subsequent final webapp suite, which passed all 97. The workspace browser set covers registration, session restoration/concurrency, role separation/change/revocation, profile/avatars, appearance, admin routes, and controlled RAG upload/memory/sources/tools/error/cancel flows. The initial full browser run passed 17 of 18; the role scenario stopped on an ambiguous `Search` locator after Arc added `Clear search`. An exact submit locator fixed the test, and both RBAC scenarios passed on rerun. The final result is combined coverage, not a claim that the initial full browser command exited 0.

Review and runtime checks also found and repaired: lost semantic headings through the EmptyState adapter; Select labels forwarded to the wrong Radix node; mobile account-menu portals outside the actual Sheet dialog; Escape reaching the outer layer first; invalid borders hiding field focus; exit pointer/autofocus handlers stealing restored focus; and Radix `aria-labelledby` overriding the public menu label. A repeated mobile run reproduced the exit-focus race before its live-state correction. The expanded regression then exposed hidden Sidebar tooltips registering dismissal layers; NavMain now creates tooltips only in collapsed desktop mode. All six unchanged expanded cases passed after that correction. Source re-review found no remaining significant concerns in these fixes.

MIT notices remain in both copied-source folders. Foundation tokens are namespaced without importing a global reset. Motion 14.3.0 is used in both apps, and the existing Radix aggregate is pinned to 1.6.7. Existing local Blobatar identity work was preserved and verified with the integrated UI. No model provider, cloud account, deployment, or external messaging was added.

Builds retain non-fatal size warnings: the webapp vendor chunk is about 935 kB minified / 288 kB gzip; the website main chunk is about 532 kB / 168 kB gzip, and its optional lazy Three.js canvas is about 884 kB / 235 kB gzip. Slow-device/network performance was not benchmarked. Motion's reduced-motion development warning is expected.

Logs and screenshot evidence are retained locally under ignored `.artifacts/arc-interface-20261016/`. Test harnesses removed only their isolated test containers and state. Development PostgreSQL/Chroma volumes and the normal running applications were preserved. Python agent/datathon source did not change in this UI task; their earlier dated checks were not rerun. Real LLM answers, embeddings/indexing, and generated-answer quality still require provider configuration and representative evaluation data.

Publication preflight passed: frozen-lockfile installation made no changes; 124 staged source/documentation files and 30 frontend outputs contained no actual local JWT/internal-agent secrets, private/generated staged paths, files of 100 MiB or more, or whitespace errors. No local `.env`, datasets, screenshots, caches, or build output is published.
