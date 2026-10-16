# Interface design and library decisions

This document describes the current TemplateHack interface. It is an implementation guide for maintaining a consistent UI, not a request to redesign every screen. See [architecture](docs/ARCHITECTURE.md), [chat behavior](docs/CHAT_UI.md), and the [capability registry](CHECKLIST.md) for their respective contracts.

## Current frontend stack

| Library or system | Current role |
| --- | --- |
| React 19, TypeScript, Vite 8 | Both browser applications; the public site is pre-rendered and the signed-in workspace is a client application |
| Tailwind CSS 4 and existing CSS variables | Shared spacing, typography, colors, light/dark themes, and responsive layout |
| Existing shadcn-style, Radix/Base UI controls | Buttons, cards, selects, alerts, dialogs, and other established shared controls |
| [assistant-ui](https://www.assistant-ui.com/) (`@assistant-ui/react` 0.15.29) | LocalRuntime and primitives for the RAG conversation, composer, scrolling, messages, and cancellation |
| [Arc Free](https://uiarc.dev) EmptyState and Badge | Empty conversation/knowledge-base states and document/tool status badges |
| Motion 14.3.0 | Animation required by the selected Arc Free source |
| Hugeicons | Existing icon family, also used by the adapted Arc components |
| `Typography` | Shared text rendering and semantic headings; also used inside adapted Arc source |
| TanStack Router, Query, and Form | Existing navigation, server-state queries/mutations, and application forms |
| Zod contracts | Shared request/response validation between the browser and Bun API |

Exact dependency versions and resolutions belong in `vibe/webapp/package.json` and `vibe/bun.lock`. Astro is no longer used. The active frontend uses React/Vite; adding a component does not require moving to Next.js.

## Visual language

Preserve the existing neutral surfaces, restrained borders, rounded controls, Figtree typography, and light/dark themes. Use shared spacing and semantic color tokens. Keep primary actions clear and make long messages, filenames, and citations wrap within narrow viewports.

The workspace shell owns navigation and the page frame. Features occupy its content region. The RAG screen keeps chat and knowledge-base controls together; the document panel stacks below chat on narrow screens. Memory notes belong in their existing separate card, not in the message composer.

Use motion for state transitions, not decoration that delays a task. Retain reduced-motion behavior. Keyboard focus, accessible names, readable error messages, and non-color status text must remain usable.

## Library boundaries

assistant-ui owns the client chat lifecycle. The feature-local adapter uses the existing authenticated Bun SSE proxy. FastAPI/LangGraph owns model calls, retrieval, tools, document isolation, memory access, and checkpoints. Provider keys remain on the server. assistant-ui Cloud is not configured.

TanStack Query owns authenticated module, document, and memory requests. Their cache keys include the owner and start with the shared session namespace. Sign-out or a replacement login clears that cache and cancels pending reads. Changing accounts resets the local chat and drafts. The memory card saves only explicit user notes; conversations are not automatically converted into notes.

Arc Free provides selected copied components, not a second global theme. Source is in `vibe/webapp/src/components/arc/` with scoped aliases to the existing theme. Keep its [MIT license and provenance](webapp/src/components/arc/README.md). The global Arc foundation/reset is not imported. No Arc Pro source is included. Continue using established shared controls for their existing jobs.

Chat text stays React-escaped plain text. Sources show the document filename, page, and snippet. Tool events describe server activity; they do not execute tools in the browser. A recoverable tool error must not suppress the agent's later answer. Terminal provider/network failures remain visible, and Stop must cancel the request and reader.

## Adding or changing components

1. Find the existing owner in the feature or shared UI before adding another abstraction.
2. Reuse existing controls and semantic variants. Use Arc Free where a selected component serves an actual interface need.
3. Preserve theme tokens, Typography, Hugeicons, keyboard behavior, and reduced motion. Do not overwrite all shared UI with a registry generator.
4. Keep library-specific integration in the responsible feature or Arc source folder. Keep authentication and provider secrets in their existing server boundaries.
5. Run focused tests, types, lint, architecture validation, and relevant builds. For interaction changes, exercise the real UI on desktop and a narrow viewport with labeled test-data/provider boundaries.
6. Update this document, the relevant README, CHECKLIST, and dated verification evidence when a lasting library or behavior decision changes.

The current [verification report](docs/VERIFICATION.md) distinguishes functional UI tests from real-provider quality checks. The datathon workflow remains an independent local Python CLI; browser UI libraries do not train or evaluate its models.
