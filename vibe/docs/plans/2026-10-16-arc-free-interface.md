# Arc Free Interface Implementation Plan

> Execute the independent public-site and workspace slices with subagent-driven-development. The root owns shared workspace adapters, integration, verification, documentation, and publication.

**Goal:** Use Arc Free for every equivalent active interface component, retain assistant-ui chat, and report the shadcn/ui fallbacks.

**Architecture:** Keep both React/Vite apps and existing feature/state owners. Copy official MIT Arc source into each app that uses it. Adapt presentation APIs at `components/interface/` so form validation, permissions, sessions, uploads, and route contracts remain unchanged. Retain shadcn composites where no equivalent free Arc component exists.

**Tech Stack:** React 19, Vite 8, official Arc Free source, existing Motion 14.3.0 and Radix, Hugeicons, assistant-ui 0.15.29, TanStack, Bun, and Playwright.

## 1. Source and compatibility boundary

- [x] Import the selected public Arc registry sources, CSS modules, motion tokens, and MIT provenance. Reuse the installed aggregate `radix-ui` package instead of adding separate Radix packages.
- [x] Add workspace `components/interface/` exports for buttons, cards, alerts, inputs, textarea, badges, avatar, Select, skeletons, search, menus, and tables. Preserve native names, IDs, refs, form events, ARIA, error descriptions, and disabled/loading behavior.
- [x] Map Arc tokens to the existing theme without importing a destructive global reset. Support portals and reduced motion.

## 2. Workspace screens

- [x] Switch active feature/dashboard imports to the interface boundary. Keep assistant-ui `AgentThread` and the SSE adapter.
- [x] Use Arc Select for controlled choices, Arc table for the existing server-paginated directory, and Arc user menu for account actions. Preserve role confirmation and session revocation.
- [x] Retain documented shadcn-only structural/specialized composites; leave optional Storybook examples outside the active migration scope.

## 3. Public website

- [x] Use Arc Free button, card, badge, and accordion presentation. Preserve content, anchor URLs, static rendering, and optional 3D fallback.
- [x] Keep navigation and FAQ operable without JavaScript; use progressive enhancement where an Arc interaction requires client code.
- [x] Add the already-selected Motion version to the website manifest and update the lockfile through Bun.

## 4. Verification and publication

```powershell
bun run check
bun run --cwd webapp e2e
bun run --cwd website build
```

- [x] Exercise public and signed-in surfaces on desktop/mobile, light/dark, keyboard and reduced motion. Check real auth/profile/avatar/admin flows and controlled RAG requests.
- [x] Verify public no-JavaScript behavior and the normal full-stack launch. Inspect runtime screenshots and failures before claiming completion.
- [x] Update `design.md`, READMEs, CHECKLIST, architecture, testing, the fallback inventory, and dated verification. Scan staged sources and frontend outputs for actual local secrets.
- [x] Prepare the authorized commit/push on the current `main` branch; verify remote SHA and working-tree state during publication.
