# Public React website

The public site uses React 19, Vite 8, Tailwind CSS 4, and the existing shadcn/Radix/Base UI components. Astro has been removed at the user's request. The signed-in workspace remains a separate React/Vite application in `webapp/`.

## Rendering and behavior

The single landing page is composed by `src/App.tsx` and React sections under `src/components/landing`. The current theme, content, navigation, native mobile menu, FAQ disclosures, and calls to action are preserved.

`scripts/build.mjs` uses Vite's SSR build API and React DOM `renderToString` to generate complete static HTML. A client build then supplies hashed assets. Temporary server-rendering output is removed after the build. The published output is `website/dist`, including pre-rendered `index.html` and immutable `assets/`; it needs no production Node server.

The development Vite middleware renders the same application and metadata into HTML. The client entry hydrates it when the browser is idle, with a 2500 ms deadline. Header and FAQ disclosures use native HTML and work before hydration.

`HeroScene` keeps its complete static visual fallback. Its Three.js canvas is dynamically loaded only for desktop viewports that permit motion and provide a WebGL2 context. Mobile, reduced-motion, and WebGL-disabled browsers retain the fallback; loading errors do not remove it.

## Commands

Run application commands from `vibe/`:

```powershell
bun run dev:website
bun run build:website
bun run typecheck:website
bun run test:website
bun run test:build-contracts
bun run storybook:website
```

The public dev server remains at `http://localhost:4321`. The root dev shortcut loads the shared local `.env`. The complete stack starts with `bun run dev`.

To preview production output, first build, then run `bun run --cwd website preview`. Storybook runs on port 6007 with its own Vite configuration so the website's HTML middleware cannot replace the component catalog.

## Public settings and metadata

- `PUBLIC_WEBAPP_URL`: optional absolute HTTP(S) URL for the workspace action. If unset, that action links to the existing local getting-started section.
- `PUBLIC_WEBSITE_URL`: optional absolute HTTP(S) site URL for canonical and Open Graph URL tags.
- Public settings are build-time values. Invalid configured URLs fail the build. Metadata is HTML-escaped before insertion.

Title, description, Russian language, dark theme, favicon, Open Graph, and Twitter metadata remain in the initial HTML. Vite exposes only its standard public variables and the existing `PUBLIC_*` prefix. Keep all private keys out of public-prefixed variables.

## Checks and architecture

The existing website tests cover public-link configuration, hero eligibility/loading, and Storybook inventory. Metadata tests cover escaping and URL validation. Build-contract checks verify pre-rendered content, hashed assets, lazy canvas separation, and exclusion of story-only CSS.

Keep account routes, permissions, checkout, and private data in `webapp/` and `backend/`. This migration does not add payments, public API data, or runtime server rendering. See [WEB_SURFACES.md](../docs/WEB_SURFACES.md) and [ARCHITECTURE.md](../docs/ARCHITECTURE.md).

Static release source retains the existing output directory and public environment names. Cloud deployment was not performed. Request-rendered pages or new routes require a separate recorded product need; this one-page static build does not imply a general SSR routing framework.

## References

- [Vite SSR API](https://vite.dev/guide/ssr.html)
- [React server rendering](https://react.dev/reference/react-dom/server/renderToString)
- [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot)
