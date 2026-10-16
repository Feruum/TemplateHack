# Assistant UI and Arc Free integration

The user approved assistant-ui for the existing RAG chat, Arc Free for interface components, local verification, README updates, and push. Only this UI work may be published. Pre-existing RAG/memory changes must remain uncommitted.

## Design and boundaries

The existing `/app/assistant` feature keeps its application shell, authenticated transport, module selection, PDF/TXT upload limits, document polling, source citations, and backend-owned tools. Use `@assistant-ui/react` LocalRuntime and primitives for chat messages, composer, scrolling, and cancellation. A feature-local model adapter converts the existing SSE protocol into incremental runtime results; it does not contact a model provider or assistant-ui Cloud. This replaces the handwritten message/composer state rather than adding a second chat store.

The existing handwritten chat is a credible alternative, but the user selected assistant-ui to own the difficult client lifecycle. ExternalStoreRuntime would retain a competing message/composer owner; LocalRuntime fits our simple authenticated fetch API. Preserve plain-text rendering and expose server-side source/tool metadata through typed message metadata. Do not enable editing, regeneration, client tools, Cloud persistence, or attachments in the composer: their corresponding backend contracts are not implemented here.

Copy the official Arc Free EmptyState and Badge source, CSS modules, and motion tokens with the MIT license and provenance. Use the project's Hugeicons and existing light/dark theme tokens through scoped Arc aliases. Motion is a required Arc component dependency. Arc controls serve empty chat/document states and document/tool badges; existing shared buttons, cards, selects, and alerts retain their owners.

## Implementation and validation

- [x] Add failing adapter tests for authenticated payloads, incremental text, sources, tools, errors, interrupted streams, cancellation, and bounded conversation history. Extend the SSE tests for cancellation and callback failures.
- [x] Implement iterable SSE parsing and the feature-local model adapter. Preserve the existing callback reader API for callers.
- [x] Install exact assistant-ui/Motion versions and vendor only the selected Arc Free sources. Retain license and document adaptations.
- [x] Compose `AgentThread.tsx` from assistant-ui primitives; integrate it into `AgentWorkspace.tsx` without changing upload/module behavior. Keep the local MemoryCard integration in the working tree only.
- [x] Run focused tests, architecture validation, type checks, lint, dependency audit, builds, and browser interaction checks. Cover success, source/tool events, stop, error/recovery, module selection, uploads, keyboard input, and a narrow viewport using an isolated test environment or controlled external-provider boundary.
- [x] Update README, capability registry, architecture/testing guides, and verification evidence. Stage only owned changes; stage the shared workspace without the two pre-existing MemoryCard additions. Confirm the staged tree has no dependency on unpublished memory code and check private values.

Publication is authorized as a UI-only commit and push on the existing `main` branch after these checks. Results are recorded in [VERIFICATION.md](../VERIFICATION.md#assistant-ui-and-arc-free--2026-10-16).

## Acceptance

The real UI uses assistant-ui, not a demonstration page. Arc Free is visible on the existing chat/document surface. Chat requests still use the authenticated Bun proxy with a stable server thread ID. Stop cancels the stream; server/network failures remain visible and a new question can be sent. Sources and tool statuses survive incremental updates. Browser checks use controlled responses and do not claim real-provider model quality. Unrelated work remains unchanged and unstaged.
