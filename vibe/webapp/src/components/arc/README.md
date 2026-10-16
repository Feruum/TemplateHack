# Arc Free source

The active workspace uses official MIT-licensed Arc Free source retrieved on 2026-10-16. Copyright belongs to Elia Kuratli; retain [LICENSE](LICENSE) and the notices when copying these files. No Arc Pro source is included.

Registry source: [Button](https://uiarc.dev/r/button.json), [Input](https://uiarc.dev/r/input.json), [Textarea](https://uiarc.dev/r/textarea.json), [Card](https://uiarc.dev/r/card.json), [Alert](https://uiarc.dev/r/alert.json), [Skeleton](https://uiarc.dev/r/skeleton.json), [Avatar](https://uiarc.dev/r/avatar.json), [Select](https://uiarc.dev/r/select.json), [SearchField](https://uiarc.dev/r/search-field.json), [PasswordField](https://uiarc.dev/r/password-field.json), [SortableDataTable](https://uiarc.dev/r/sortable-data-table.json), [UserMenu](https://uiarc.dev/r/user-menu.json), [EmptyState](https://uiarc.dev/r/empty-state.json), [Badge](https://uiarc.dev/r/badge.json), [motion tokens](https://uiarc.dev/r/arc-motion-tokens.json), and [foundation tokens](https://uiarc.dev/r/arc-foundation.json). [Upstream repository](https://github.com/kuratlielia/arc-library).

Adaptations:

- Relative imports reuse this folder's motion tokens, existing aggregate `radix-ui` 1.6.7, and Hugeicons through `lib/icons.tsx`.
- The 97 foundation tokens are namespaced as `--arc-*` and mapped to the host light/dark theme in `arc-tokens.css`. Foundation tokens are imported without the upstream global reset. Existing EmptyState/Badge retain their scoped `theme.module.css` aliases and Typography.
- Input/PasswordField/Textarea permit external labels. Password reveal retains the existing accessible name, controls its input, and respects disabled state. Select forwards labels/descriptions to the actual trigger. Independent keyboard outlines remain visible on invalid fields.
- Card and Alert permit existing compound layouts without duplicate generated titles. Noninteractive cards do not animate on hover. Alert preserves roles and avoids nested paragraphs. Avatar accepts the existing fallback node. EmptyState accepts semantic header content so route headings and descriptions survive the compound adapter.
- UserMenu supports existing labels, controlled state, async sign-out and error recovery, destinations and photo/fallback data. Nested portals stay within the actual mobile dialog boundary; first Escape closes the menu and restores focus before Sidebar handles the next Escape. Live open-state guards prevent retained exit pointer handlers or delayed opening autofocus from stealing focus. Exit completion restores only lost focus and preserves the person's next selected control.
- `components/interface/` maps legacy semantic variants, sizes, compound parts, and anchor/asChild behavior to actual Arc source. It owns no API calls. Copied vendor source has narrow lint exemptions for semantic HTML and mixed source exports; feature compositions keep normal lint rules.

Motion 14.3.0 and the current Radix resolution are pinned in the app manifests and Bun lockfile. [ARC_MIGRATION.md](../../../../docs/ARC_MIGRATION.md) records the shadcn fallbacks and chat exception. [Website provenance](../../../../website/src/components/arc/PROVENANCE.md) records its separate source copies.

Maintain the upstream component behavior, outgoing-content accessibility handling, and reduced-motion paths when refreshing source. Review registry changes before copying; do not run the generator against all shared UI. Run webapp types, lint, tests, and rendered RAG checks after updates.
