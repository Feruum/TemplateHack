---
name: seo-visual
description: Inspect rendered website pages for mobile layout, above-the-fold content, and visual SEO usability when a visual or responsive audit is requested.
---

# Rendered website review

Use the host's available browser or screenshot tools to inspect the requested page. This is a repository-maintained adapter, independently written for the available host tools.

Capture the route and viewport alongside each screenshot. Cover the requested desktop and mobile views, including any relevant loading, empty, or error states. Inspect navigation, content hierarchy, primary actions, readable text, image cropping, and horizontal overflow in the rendered page.

Support each finding with the visible element, viewport, reproduction steps, and screenshot where available. Distinguish observed defects from design preferences. Screenshots alone do not prove keyboard or screen-reader accessibility; perform those interactions when an accessibility check is requested and the host supports them.

Use [image optimization](../seo-images/SKILL.md) for asset delivery and [web interface guidelines](../web-design-guidelines/SKILL.md) for an interface compliance review. Preserve the page's capabilities when implementing a requested correction.

If the browser or target page is unavailable, report that limitation and keep source inspection clearly identified. Revisit the affected view after a requested fix before claiming the rendered issue is resolved.
