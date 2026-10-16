# Arc Free interface migration

The 2026-10-16 migration makes official MIT Arc Free source the default UI for the active public site and signed-in workspace. Chat remains on assistant-ui 0.15.29. No Pro components, paid account, hosted UI service, or new backend is required.

## Implemented scope

| Surface | Arc Free components and preserved behavior |
| --- | --- |
| Login, registration, recovery/reset | Button, Input, PasswordField, Card, Alert; existing validation, names, descriptions, password reveal, disabled states, and real sessions |
| Workspace and admin summaries | Card, Badge, Skeleton, EmptyState; route headings, loading/error announcements, metrics, and recovery actions |
| Account/profile | Avatar, UserMenu, Button, Input, Card; uploaded-photo precedence, account navigation, logout, and errors |
| Appearance | Controlled Select; existing saved light/dark/system preference |
| Admin user directory | SearchField, SortableDataTable, Select, Button, Badge; native desktop table, mobile field labels, server search/paging, confirmed role changes, and session revocation |
| RAG screen around chat | Select, Card, Button, Input, Badge, EmptyState; module choice, PDF/TXT uploads, document deletion, and explicit private notes |
| Public landing page | Button/anchor ButtonLink, Card, Badge, Accordion, DropdownMenu; original content, anchors, calls to action, and optional Three.js fallback |

The public FAQ and menu ship native `details`/`summary` controls in pre-rendered HTML. After hydration they use Arc, preserving already-open panels and focus. FAQ allows multiple panels. The signed-in app remains CSR and requires JavaScript.

## Missing Free equivalents: retained shadcn/ui

The official [Arc registry catalog](https://uiarc.dev/r/catalog.json) was inspected on 2026-10-16. Names and tiers below describe that catalog at inspection time.

| Retained component | Reason |
| --- | --- |
| Sidebar and its Sheet/Tooltip support | Ready-made `workspace-sidebar`, `sidebar-rail`, `docs-sidebar`, and `inbox-sidebar` blocks are Pro. Preserve the existing accessible, collapsible, role-aware shell and mobile focus trap. |
| Field, FieldGroup, FieldLabel, FieldDescription, FieldError | No equivalent Free form-layout/validation compound component was listed. Arc Input/PasswordField provide controls; shadcn keeps external labels and error associations. |
| Item and its compound parts | No equivalent structural Item family was listed. It composes document/session/profile rows around Arc controls. |
| Separator | No standalone Free equivalent was listed. Existing shadcn/Radix separators remain, including the public footer. |
| Spinner | No equivalent Free utility spinner was listed. The catalog's `morph-loader` is Pro. Existing shadcn spinner remains for pending work. |
| AlertDialog | No specialized Free `alertdialog` equivalent was listed. Arc has a generic free Dialog, Drawer, and BottomSheet; the existing destructive role confirmation retains AlertDialog semantics and focus behavior. |

The assistant-ui conversation and its existing supporting controls are an explicit user exception. Optional Storybook shadcn examples are component catalogs, outside active product migration. Product-specific headings, layouts, legal copy, brand marks, and the 3D hero remain application compositions.

## Source and maintenance

Official registry files are copied into each app's `src/components/arc/`. Keep [workspace source/provenance](../webapp/src/components/arc/README.md), [website provenance](../website/src/components/arc/PROVENANCE.md), and their MIT licenses. Existing Radix exports are reused. Motion 14.3.0 is pinned in both apps; Radix remains at the existing 1.6.7 resolution.

Adapters in `components/interface/` map the previous semantic props to actual Arc components. They do not own API calls or domain rules. Tokens use `--arc-*`, inherit the host theme through portals, and avoid importing Arc's global reset. Hugeicons and shared Typography remain the workspace defaults. The original Arc CSS and motion are retained with documented accessibility/compatibility fixes.

Validation preserves field IDs, refs, events, error descriptions, and visible keyboard focus. Nested UserMenu portals stay inside the mobile Sidebar dialog; the first Escape closes the menu and returns trigger focus, and the next closes Sidebar. Exiting menus ignore stale pointer/autofocus events and preserve a new focus target. Navigation tooltips are created only for a collapsed desktop Sidebar; hidden mobile tooltips must not register an extra dismissal layer.

See [design.md](../design.md), [testing](TESTING.md), and the dated [verification report](VERIFICATION.md) for responsibility boundaries and measured checks. UI checks use controlled RAG responses; real answers and indexing still require chat/embedding provider settings.
