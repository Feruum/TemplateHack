# Remove Astro from the public website

The user requested removal of Astro. Preserve the existing public landing page and its behavior. Use the React/Vite stack already installed in this monorepo; no new third-party package is required.

## Migration decisions

- Keep the public site in `website/` and the authenticated application in `webapp/`. Keep port 4321, `website/dist`, `PUBLIC_WEBAPP_URL`, and `PUBLIC_WEBSITE_URL`.
- Convert the existing landing sections to React components without changing their layout, styling, copy, native disclosure controls, or links. Update only the references to Astro in the displayed technology list.
- Use Vite's existing client and SSR build APIs with React DOM rendering to generate complete static HTML at build time. Hydrate that HTML in the browser. The native Vite SSR API and React DOM are the capability owners, rather than a new framework or custom rendering engine.
- Plain client-only Vite would remove existing pre-rendered content; it is not selected. A separate SSR framework would add an unnecessary dependency for this single static route. Runtime request rendering and new routes are outside the scope.
- Keep the existing HeroScene component, reduced-motion/mobile fallback, and dynamically imported Three.js canvas. Delay hydration until the browser is idle to preserve the existing deferred enhancement.
- Keep favicon, language, dark theme, page title, description, canonical URL, Open Graph, and Twitter metadata. Validate configured public URLs before emitting HTML, and HTML-escape metadata.
- Remove Astro configuration, packages, types, syntax, and active documentation. Update the static asset upload directory from `_astro` to `assets` without applying cloud infrastructure. Preserve historical verification records as historical evidence.

## Implementation and validation

1. Add failing checks for metadata rendering/URL validation and change the existing static-build contract to require pre-rendered React content, hashed `assets/`, and deferred canvas loading without Astro islands.
2. Convert landing components, add client/server entrypoints and an HTML template, and implement bounded Vite dev/SSG integration using existing framework APIs.
3. Replace Astro commands/configuration/types with React/Vite equivalents, and regenerate `bun.lock` through Bun. Retain the existing UI, styles, and Storybook owners.
4. Update local setup/build documentation and the capability registry. Update inactive release source only where it depends on the output directory or removed framework.
5. Run website tests, type checks, static-build contracts, architecture validation, template checks, dependency audit, and the related script suites. Use the installed agent-browser adapter and Chromium to check desktop/mobile native menus, FAQ controls, links, fallback behavior, hydration, and console health against the local site.
6. Repeat the root check pipeline for the framework migration, review the diff, and publish to the previously authorized GitHub repository. Restart the local application and verify its URLs without deleting Docker data.

References: [Vite SSR API](https://vite.dev/guide/ssr.html), [React renderToString](https://react.dev/reference/react-dom/server/renderToString), and [React hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot).
