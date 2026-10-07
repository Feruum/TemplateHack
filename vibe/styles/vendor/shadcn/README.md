# Shared shadcn styles

`tailwind.css` is an unchanged copy of `dist/tailwind.css` from [shadcn 4.16.1](https://www.npmjs.com/package/shadcn/v/4.16.1). The adjacent `LICENSE.md` preserves its MIT license and copyright notice.

Both frontends import this file. Turbo includes it in the global build inputs, so a style update invalidates cached frontend builds.

The application only needs these CSS variants and utilities. It does not need the component generator's dependency tree during installation, builds, or runtime. The separate `webapp` commands `ui`, `ui:add`, and `ui:info` run the existing generator version on demand through `bunx`.

The pinned generator still reaches the unpatched [braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). It is outside the application lockfile and normal checks. Use only trusted component names and registry inputs when running this optional development tool. A clean application audit does not attest to this separate tool.

To update these styles, use an explicitly selected upstream version and copy its published `dist/tailwind.css` and MIT license together. Preserve the complete source asset rather than editing generated CSS. Update this provenance note and rerun both frontend builds, build-contract tests, the dependency audit, and the relevant browser scenarios. Do not restore a `shadcn/tailwind.css` package import during component regeneration.
