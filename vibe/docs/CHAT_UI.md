# RAG chat interface

The signed-in `/app/assistant` screen uses React 19 and Vite. `@assistant-ui/react` **0.15.29** owns the conversation runtime, composer, message rendering, scrolling, and cancellation. Arc Free **EmptyState** and **Badge** provide empty conversation/knowledge-base states and document/tool status badges. **Motion 14.3.0** is their animation dependency. Exact versions are recorded in `webapp/package.json` and `bun.lock`.

## Responsibilities

| Owner | Responsibility |
| --- | --- |
| `webapp/src/features/agent/AgentWorkspace.tsx` | Existing module selection, private document query/polling, PDF/TXT validation, upload, and layout |
| `webapp/src/features/agent/AgentThread.tsx` | assistant-ui provider, LocalRuntime, thread/message/composer primitives, and presentation of RAG metadata/errors |
| `webapp/src/features/agent/runtime.ts` | Feature-local model adapter from the existing authenticated SSE API into incremental runtime results |
| `webapp/src/features/agent/stream.ts` | SSE framing, UTF-8/chunk handling, iterable events, reader cancellation, and the compatible callback API |
| `webapp/src/components/arc/` | Selected Arc Free source, CSS modules, scoped theme aliases, shared motion tokens, MIT license, and provenance |
| Existing Bun/Python backend | Authentication, authorization, module routing, retrieval, tools, document ownership, and conversation checkpoints |

The browser still sends `POST /api/agent/chat/stream` through `useAuth().transport`. The adapter supplies a stable server `thread_id`, the selected module when explicit, and at most 49 nonempty text messages. API contracts validate the payload. Provider credentials stay on the server. assistant-ui Cloud is not configured; no Cloud account or Cloud API key is needed.

LocalRuntime replaces the handwritten chat/composer state. It is the sole owner of that client lifecycle. TanStack Query owns module/document/memory queries and upload/note mutations. Agent query keys include the account ID under the shared session namespace; logout and replacement login remove private cache and cancel pending reads. The workspace remounts when the account changes to reset local conversation and drafts. The existing shared cards, buttons, selects, alerts, and Typography remain in use. See the [design guide](../design.md) for library responsibilities and visual conventions.

## Behavior and limits

- Send with the button or Ctrl/Cmd+Enter; plain Enter inserts a newline. Stop cancels the current fetch and SSE reader.
- Text remains plain text and React-escaped. PDF/TXT citations retain filename, page, and snippet. Server tool events are display metadata, not instructions to execute browser tools.
- A tool can fail while the agent continues with a recovery answer. Only a terminal SSE error finishes the response as an error. A connection that closes without `end` is reported as interrupted.
- HTTP/network errors and terminal stream errors remain visible. A new question can be sent after failure or cancellation.
- PDF/TXT uploads remain in the knowledge-base panel with the 25 MiB limit and existing indexing polling. Composer attachment handling is not enabled.
- Editing, regeneration, conversation branching, a history browser, and Cloud persistence are not exposed. The backend owns checkpoints; refreshing the page still starts a new client conversation, as before this integration.
- Model settings are still required for real AI replies and indexing. Installing UI libraries does not configure an LLM or measure RAG answer quality.

## Arc Free maintenance

Arc Free now supplies the active interface around the assistant-ui chat as well as its empty states/badges. Retain [the license and adaptation record](../webapp/src/components/arc/README.md). Namespaced aliases map Arc variables to the existing light/dark theme through portals. The global reset is not imported. Hugeicons and Typography are reused. Upstream reduced-motion and outgoing-content accessibility behavior is retained. The conversation/composer and its supporting controls stay with assistant-ui as requested; [ARC_MIGRATION.md](ARC_MIGRATION.md) lists the shadcn fallbacks elsewhere.

Review upstream changes before replacing source. Do not use a generator to overwrite all shared UI. Run types, lint, adapter tests, and browser checks after changing the components or updating the pinned libraries.

## Local checks

From `vibe/`:

```powershell
bun run --cwd webapp typecheck
bun run --cwd webapp lint
bun run --cwd webapp test
bun run architecture:check
bun run audit
bun run --cwd webapp build
bun run --cwd webapp e2e agent.spec.ts
```

The browser suite uses the normal real account/API harness and its separate `web_app_demo_test` PostgreSQL database. RAG endpoint responses are controlled at the browser network boundary, so it verifies client wiring, authenticated requests, source/tool rendering, errors, cancellation, module selection, uploads, and explicit note save/reload/delete without an external model. It does not prove real embeddings, extraction, retrieval, or model quality. Existing backend and agent tests own those service boundaries. See [TESTING.md](TESTING.md) for database safety and [VERIFICATION.md](VERIFICATION.md) for dated observed results.

Primary references: [assistant-ui runtimes](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime), [Arc introduction](https://uiarc.dev/docs/introduction), and [Arc licensing](https://uiarc.dev/license).
