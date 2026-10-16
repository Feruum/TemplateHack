# Arc Free source

The button, card, badge, accordion, dropdown menu, and motion presets were copied from the
public [Arc Free registry](https://uiarc.dev/r/{name}.json) on 2026-10-16.
Upstream source: [kuratlielia/arc-library](https://github.com/kuratlielia/arc-library).
Copyright (c) 2026 Elia Kuratli. The MIT license is preserved in `LICENSE`.
No Arc Pro source is included.

Local adaptations:

- Prefix CSS tokens with `--arc-` and map semantic colors to the existing
  monochrome website theme. Import only foundation tokens, without its global
  focus rules or theme resets.
- Use the installed aggregate `radix-ui` exports.
- Add an anchor button with Arc styles and press motion so calls to action
  retain native link behavior.
- Allow cards without a generated title and add semantic heading, leading,
  header, padding, and content-layout options for existing landing sections.
- Allow multiple accordion panels. `components/interface/accordion.tsx`
  progressively enhances native details after hydration and preserves the
  panels and focus used before enhancement.
- Add native anchor items and an icon trigger to the dropdown menu.
  `components/interface/dropdown-menu.tsx` progressively enhances the native
  mobile menu and preserves pre-hydration open and focus state.

The native mobile navigation and FAQ remain progressive fallbacks in the
initial HTML. With JavaScript, Arc owns their interaction. The existing
shadcn/Radix Separator remains the standalone separator fallback. The optional Three.js
scene and its fallback retain their existing owner.
