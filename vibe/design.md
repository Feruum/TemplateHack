# Interface design and library decisions

This document describes the current TemplateHack interface. It is an implementation guide for maintaining a consistent UI, not a request to redesign every screen. See [architecture](docs/ARCHITECTURE.md), [chat behavior](docs/CHAT_UI.md), and the [capability registry](CHECKLIST.md) for their respective contracts.

## Current frontend stack

| Library or system | Current role |
| --- | --- |
| React 19, TypeScript, Vite 8 | Both browser applications; the public site is pre-rendered and the signed-in workspace is a client application |
| Tailwind CSS 4 and existing CSS variables | Shared spacing, typography, colors, light/dark themes, and responsive layout |
| shadcn/ui fallbacks and Radix/Base UI | Sidebar/Sheet, structural Field/Item/Separator/Spinner, and specialized role-confirmation AlertDialog; see the [fallback report](docs/ARC_MIGRATION.md) |
| [assistant-ui](https://www.assistant-ui.com/) (`@assistant-ui/react` 0.15.29) | LocalRuntime and primitives for the RAG conversation, composer, scrolling, messages, and cancellation |
| [Arc Free](https://uiarc.dev) copied MIT source | Active buttons, cards, alerts, fields, selects, search, avatars, badges, skeletons, tables, account menu, public FAQ and mobile navigation |
| Motion 14.3.0 | Animation required by the selected Arc Free source |
| `blobatar` and `@blobatar/react` 2.7.0 | Local deterministic account-avatar fallbacks and the decorative AI waiting face |
| Hugeicons | Existing icon family, also used by the adapted Arc components |
| `Typography` | Shared text rendering and semantic headings; also used inside adapted Arc source |
| TanStack Router, Query, and Form | Existing navigation, server-state queries/mutations, and application forms |
| Zod contracts | Shared request/response validation between the browser and Bun API |

Exact dependency versions and resolutions belong in the app manifests and `bun.lock`. Motion is pinned to 14.3.0 in both apps; the existing Radix aggregate is pinned to 1.6.7. Astro is no longer used. The active frontend uses React/Vite.

## Visual language

Preserve the existing neutral surfaces, restrained borders, rounded controls, workspace Figtree typography, the website Helvetica/Inter stack, and light/dark themes. Use shared spacing and semantic color tokens. Keep primary actions clear and make long messages, filenames, and citations wrap within narrow viewports.

The workspace shell owns navigation and the page frame. Features occupy its content region. The RAG screen keeps chat and knowledge-base controls together; the document panel stacks below chat on narrow screens. Memory notes belong in their existing separate card, not in the message composer.

Use motion for state transitions, not decoration that delays a task. Retain reduced-motion behavior. Keyboard focus, accessible names, readable error messages, and non-color status text must remain usable.

Account avatars use Blobatar as the default when no uploaded photo is available. The stable account ID determines the same face in the profile and account menu. Uploaded photos take precedence. The assistant's waiting state uses a decorative `thinking` expression with its existing text label. Generation stays local; user identities are not sent to Blobatar's hosted endpoint. See [the avatar guide](docs/BLOBATAR.md).

## Library boundaries

assistant-ui owns the client chat lifecycle. The feature-local adapter uses the existing authenticated Bun SSE proxy. FastAPI/LangGraph owns model calls, retrieval, tools, document isolation, memory access, and checkpoints. Provider keys remain on the server. assistant-ui Cloud is not configured.

TanStack Query owns authenticated module, document, and memory requests. Their cache keys include the owner and start with the shared session namespace. Sign-out or a replacement login clears that cache and cancels pending reads. Changing accounts resets the local chat and drafts. The memory card saves only explicit user notes; conversations are not automatically converted into notes.

Arc Free is the default presentation library for the active public site and workspace. Official copied source lives in each app's `src/components/arc/`; compatibility adapters live in `src/components/interface/`. Features retain validation, data queries, permissions, and route ownership. Namespaced `--arc-*` tokens map to the existing theme and work inside portals. Foundation tokens are imported without the global reset. Keep the [workspace provenance](webapp/src/components/arc/README.md) and [website provenance](website/src/components/arc/PROVENANCE.md), including both MIT notices.

Use shadcn/ui when the exact required Arc Free component is unavailable. Arc's ready-made sidebar blocks are Pro; the existing accessible Sidebar/Sheet stays. A generic Arc Dialog does not replace the destructive AlertDialog contract. The [migration report](docs/ARC_MIGRATION.md) records every retained fallback. Optional Storybook catalogs remain separate from active product screens. No Arc Pro code is included.

assistant-ui continues to own the conversation, composer, messages, sources/tools, stop, and error recovery. Its existing chat controls are an explicit migration exception. Arc owns the surrounding module/document/memory panels. Public FAQ and navigation retain native details/summary in the initial HTML and enhance to Arc after hydration. Preserve real anchors, multiple open FAQ panels, keyboard focus, and reduced motion. Field focus outlines must remain visible even while the validation border is red. In the mobile sidebar, the first Escape closes the account menu and the next closes the sidebar.

Chat text stays React-escaped plain text. Sources show the document filename, page, and snippet. Tool events describe server activity; they do not execute tools in the browser. A recoverable tool error must not suppress the agent's later answer. Terminal provider/network failures remain visible, and Stop must cancel the request and reader.

## Adding or changing components

1. Find the existing owner in the feature or shared UI before adding another abstraction.
2. Check the official Arc Free catalog first. Reuse the existing interface adapter; use shadcn/ui for a documented missing equivalent. Keep chats on assistant-ui.
3. Preserve theme tokens, Typography, Hugeicons, keyboard behavior, and reduced motion. Do not overwrite all shared UI with a registry generator.
4. Keep library-specific integration in the responsible feature or Arc source folder. Keep authentication and provider secrets in their existing server boundaries.
5. Run focused tests, types, lint, architecture validation, and relevant builds. For interaction changes, exercise the real UI on desktop and a narrow viewport with labeled test-data/provider boundaries.
6. Update this document, the relevant README, CHECKLIST, and dated verification evidence when a lasting library or behavior decision changes.

The current [verification report](docs/VERIFICATION.md) distinguishes functional UI tests from real-provider quality checks. The datathon workflow remains an independent local Python CLI; browser UI libraries do not train or evaluate its models.
