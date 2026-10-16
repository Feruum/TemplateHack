# Generated account avatars

The webapp uses `blobatar` and `@blobatar/react`, both pinned to **2.7.0**, for deterministic account avatars. The npm packages are MIT licensed. The generator runs locally in the browser and during server rendering; it does not call the hosted Blobatar avatar endpoint.

## Ownership and behavior

- `components/identity/BlobAvatar.tsx` owns the decorative React component and imports the package motion stylesheet.
- `components/identity/avatar-seed.ts` derives a namespaced seed from the stable account ID. Renaming a profile does not change its face.
- The Arc avatar adapter and account-menu adapter use the same seed. Their existing photo support takes precedence; missing or failed photos show the generated fallback.
- The account menu reuses the existing authenticated avatar query and object-URL loader. Signed private download URLs are not put in its image markup.
- The assistant-ui message renders a separate `thinking` Blobatar while awaiting its first text. The visible `Thinking…` text remains. Blobatar does not own chat state, streams, cancellation, or tools.

User faces animate on hover. The waiting assistant uses the package's explicit `thinking` expression and continuous mode. The imported stylesheet disables animation under `prefers-reduced-motion`. Faces are decorative and hidden from assistive technology; the surrounding UI supplies the account name or waiting text. There is no pointer-tracking gaze integration.

## Checks

From `vibe/webapp`:

```powershell
bun test tests/blob-avatar.test.ts tests/avatar-upload.test.ts tests/auth-queries.test.ts
```

The component tests exercise local generation, stable identity across renames, distinct accounts, profile/menu consistency, uploaded-photo precedence, and the decorative thinking state. Existing upload and session-cache tests cover their unchanged owners. These checks do not replace rendered-browser verification of the ongoing Arc interface migration.

Local verification on 2026-10-16: **24 focused tests passed**, including six Blobatar cases. A scoped TypeScript check passed for the seven changed source entrypoints and their imported dependencies. The running Vite server compiled the new Blobatar module. The full app typecheck reported unresolved existing UI packages; ESLint could not resolve `minimatch` in the available environment. No full-app lint or browser pass is claimed by this integration check.

Primary references: [Blobatar documentation](https://blobatar.dev/docs), [React adapter source](https://github.com/Alain00/blobatar/tree/main/packages/react), and [upstream license](https://github.com/Alain00/blobatar/blob/main/LICENSE).

The subsequent Arc integration check passed full-app TypeScript, ESLint, 97 webapp tests (including all six Blobatar cases), production builds, real avatar-upload browser paths, and desktop/mobile screenshot review. See [VERIFICATION.md](VERIFICATION.md) for the complete dated integration record.
