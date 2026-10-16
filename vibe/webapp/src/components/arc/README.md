# Arc Free source

The RAG interface uses the official MIT-licensed Arc Free **EmptyState**, **Badge**, and shared motion tokens, retrieved on 2026-10-16. Copyright belongs to Elia Kuratli; retain [LICENSE](LICENSE) and the notices when copying these files.

Sources: [EmptyState registry](https://uiarc.dev/r/empty-state.json), [Badge registry](https://uiarc.dev/r/badge.json), [motion tokens](https://uiarc.dev/r/arc-motion-tokens.json), and the [upstream repository](https://github.com/kuratlielia/arc-library). No Arc Pro source is included.

Adaptations: relative motion-token imports point to this folder; EmptyState uses the project's existing Hugeicons instead of adding Lucide. Text uses the project's Typography primitive while retaining Arc CSS and motion. `index.tsx` applies scoped aliases from the existing light/dark theme through `theme.module.css`. The global Arc foundation/reset is not imported, so other shared controls keep their existing theme and focus styles. Motion 14.3.0 is pinned in the webapp manifest and Bun lockfile.

Maintain the upstream component behavior, outgoing-content accessibility handling, and reduced-motion paths when refreshing source. Review registry changes before copying; do not run the generator against all shared UI. Run webapp types, lint, tests, and rendered RAG checks after updates.
