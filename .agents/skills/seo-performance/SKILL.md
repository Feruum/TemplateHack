---
name: seo-performance
description: Measure and review website load performance and Core Web Vitals when the user requests a performance or page-speed audit.
---

# Website performance evidence

Use [the technical SEO workflow](../seo-technical/SKILL.md) for the surrounding SEO analysis. This is a repository-maintained adapter, independently written for the available host tools.

Record the target route, viewport, browser, build mode, and cache conditions for each measurement. Prefer the project's existing performance tooling, browser traces, or a Lighthouse report. Inspect the actual rendered page before attributing a bottleneck to a component.

Keep field measurements and laboratory measurements separate. A local navigation or Lighthouse run does not establish real-user INP or a passing Core Web Vitals assessment. Read current definitions from [web.dev](https://web.dev/articles/vitals) before applying thresholds.

Report measured values with their evidence and conditions. Label source-only observations as hypotheses. If the host lacks the required browser or measurement tool, state which measurements remain unavailable.

Prioritize the demonstrated bottleneck. When a fix is requested, compare the same route under the same conditions after the change.
