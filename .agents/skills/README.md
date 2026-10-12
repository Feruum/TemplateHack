# Repository agent skills

This directory contains **86 repository-scoped skills**, imported on 2026-10-12. The manifest records each entrypoint, source, import type, available license notice, and SHA-256 hashes. Existing skills were retained.

## Catalog

| Group | Skills |
| --- | --- |
| Superpowers | [brainstorming](brainstorming/SKILL.md), [dispatching-parallel-agents](dispatching-parallel-agents/SKILL.md), [executing-plans](executing-plans/SKILL.md), [finishing-a-development-branch](finishing-a-development-branch/SKILL.md), [receiving-code-review](receiving-code-review/SKILL.md), [requesting-code-review](requesting-code-review/SKILL.md), [subagent-driven-development](subagent-driven-development/SKILL.md), [systematic-debugging](systematic-debugging/SKILL.md), [test-driven-development](test-driven-development/SKILL.md), [using-git-worktrees](using-git-worktrees/SKILL.md), [using-superpowers](using-superpowers/SKILL.md), [verification-before-completion](verification-before-completion/SKILL.md), [writing-plans](writing-plans/SKILL.md), [writing-skills](writing-skills/SKILL.md) |
| Frontend design | [impeccable](impeccable/SKILL.md) |
| React and Next.js | [vercel-react-best-practices](vercel-react-best-practices/SKILL.md), [next-best-practices](next-best-practices/SKILL.md) |
| Auth and specialist review | [better-auth-best-practices](better-auth-best-practices/SKILL.md), [review-security](review-security/SKILL.md), [review-bugbot](review-bugbot/SKILL.md) |
| Skills, rules, and hooks | [find-skills](find-skills/SKILL.md), [create-skill](create-skill/SKILL.md), [writing-skills](writing-skills/SKILL.md), [create-rule](create-rule/SKILL.md), [create-hook](create-hook/SKILL.md) |
| Browser and interface QA | [agent-browser](agent-browser/SKILL.md), [web-design-guidelines](web-design-guidelines/SKILL.md), [walkthrough-artifacts](walkthrough-artifacts/SKILL.md) |
| SEO | [seo](seo/SKILL.md), [seo-agentic](seo-agentic/SKILL.md), [seo-audit](seo-audit/SKILL.md), [seo-backlinks](seo-backlinks/SKILL.md), [seo-cluster](seo-cluster/SKILL.md), [seo-competitor-pages](seo-competitor-pages/SKILL.md), [seo-content](seo-content/SKILL.md), [seo-content-brief](seo-content-brief/SKILL.md), [seo-dataforseo](seo-dataforseo/SKILL.md), [seo-drift](seo-drift/SKILL.md), [seo-ecommerce](seo-ecommerce/SKILL.md), [seo-firecrawl](seo-firecrawl/SKILL.md), [seo-flow](seo-flow/SKILL.md), [seo-geo](seo-geo/SKILL.md), [seo-google](seo-google/SKILL.md), [seo-hreflang](seo-hreflang/SKILL.md), [seo-image-gen](seo-image-gen/SKILL.md), [seo-images](seo-images/SKILL.md), [seo-local](seo-local/SKILL.md), [seo-maps](seo-maps/SKILL.md), [seo-page](seo-page/SKILL.md), [seo-performance](seo-performance/SKILL.md), [seo-plan](seo-plan/SKILL.md), [seo-programmatic](seo-programmatic/SKILL.md), [seo-schema](seo-schema/SKILL.md), [seo-sitemap](seo-sitemap/SKILL.md), [seo-sxo](seo-sxo/SKILL.md), [seo-technical](seo-technical/SKILL.md), [seo-visual](seo-visual/SKILL.md) |
| Image and brand generation | [brandkit](brandkit/SKILL.md), [imagegen](imagegen/SKILL.md) |
| HyperFrames | [figma](figma/SKILL.md), [hyperframes](hyperframes/SKILL.md), [hyperframes-animation](hyperframes-animation/SKILL.md), [hyperframes-audio](hyperframes-audio/SKILL.md), [hyperframes-cli](hyperframes-cli/SKILL.md), [hyperframes-core](hyperframes-core/SKILL.md), [hyperframes-creative](hyperframes-creative/SKILL.md), [hyperframes-keyframes](hyperframes-keyframes/SKILL.md), [hyperframes-registry](hyperframes-registry/SKILL.md), [media-use](media-use/SKILL.md) |
| Remotion | [remotion-best-practices](remotion-best-practices/SKILL.md), [remotion-captions](remotion-captions/SKILL.md), [remotion-create](remotion-create/SKILL.md), [remotion-docs](remotion-docs/SKILL.md), [remotion-interactivity](remotion-interactivity/SKILL.md), [remotion-maps](remotion-maps/SKILL.md), [remotion-markup](remotion-markup/SKILL.md), [remotion-multimedia](remotion-multimedia/SKILL.md), [remotion-render](remotion-render/SKILL.md), [remotion-saas](remotion-saas/SKILL.md), [remotion-studio](remotion-studio/SKILL.md), [remotion-to-hyperframes](remotion-to-hyperframes/SKILL.md), [remotion-upgrade](remotion-upgrade/SKILL.md) |
| UI motion | [motion](motion/SKILL.md) |
| Environment and automation | [env-setup](env-setup/SKILL.md), [automate](automate/SKILL.md), [babysit](babysit/SKILL.md), [subscribe](subscribe/SKILL.md) |

## Use

Invoke the relevant skill by name, for example:

```text
$using-superpowers
$impeccable polish the profile screen
$agent-browser verify the sign-in flow
$web-design-guidelines audit the interface
$seo-technical inspect the public website
```

Read the selected `SKILL.md` and its referenced resources when the host has no skill invocation tool. The canonical entrypoints are the directories listed above. The manifest hashes describe the imported bytes; Git line-ending conversion may change text-file bytes after checkout.

## Host integration

These skills supplement user instructions, repository instructions, and host permissions. Skill text does not authorize Git publication, deployment, messages to others, spending, or delegation. Follow `vibe/AGENTS.md` for application work and nearer instructions when applicable.

Some original workflows use Claude or Cursor terminology. Use available host tools and the bundled Superpowers `using-superpowers/references/codex-tools.md` mapping. `review-bugbot` and `review-security` require their specialist agents; a host without those agents must report that limitation.

Helpers require their documented runtimes, CLIs, or MCP integrations. The catalog includes instructions and helper files; execution, provider accounts, hook registration, and runtime installation are separate operations. Keep credentials and generated state outside the shared skill snapshots.

HyperFrames includes its core domain skills and `media-use`; specialized workflows are loaded on demand according to `hyperframes/references/skill-lifecycle.md`. Remotion preserves the router's nested reference layout.

## SEO source and runtime

The installed local Codex SEO bundle had a proprietary root license conflicting with MIT labels in individual files. The shared repository therefore uses the MIT-licensed [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) upstream instead. Its source archive hash is recorded in the manifest. `seo-performance` and `seo-visual` are independently written repository adapters; they retain those invocation names without copying the restricted local implementations.

Shared upstream SEO helpers, schemas, documentation, data, assets, and agent reference files live under `seo/`. When upstream text refers to `CLAUDE_PLUGIN_ROOT`, treat this directory as the package root and resolve helper paths through it on Codex. API-backed workflows require the named provider integration. The catalog does not configure provider credentials or register agents.

## Sources and license notices

| Package | Upstream | Notice |
| --- | --- | --- |
| Superpowers | [obra/superpowers](https://github.com/obra/superpowers) | [MIT](licenses/superpowers-MIT.txt) |
| Impeccable | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | [Apache 2.0](licenses/impeccable-Apache-2.0.txt) |
| React and interface guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | [MIT declaration](licenses/react-best-practices-MIT.txt) |
| Skill discovery | [vercel-labs/skills](https://github.com/vercel-labs/skills) | [MIT](licenses/vercel-skills-MIT.txt) |
| Agent browser | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | [Apache 2.0](licenses/agent-browser-Apache-2.0.txt) |
| HyperFrames and Figma workflow | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | [Apache 2.0](licenses/hyperframes-Apache-2.0.txt) |
| Brandkit | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | [MIT](licenses/brandkit-MIT.txt) |
| Image generation | [openai/skills](https://github.com/openai/skills) | [Bundled Apache 2.0](imagegen/LICENSE.txt) |
| SEO upstream | [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | [MIT](licenses/seo-MIT.txt) |

Original notices remain in each imported bundle. The manifest explicitly records when an installed snapshot supplied no license or upstream metadata; the application license does not relicense third-party material. Imported upstream files are preserved byte-for-byte. Local virtual environments, dependency caches, credentials, and runtime installation reports are excluded.
