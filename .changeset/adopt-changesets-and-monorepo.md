---
---

chore: adopt Changesets + consolidate into a single Turborepo monorepo (#222)

Infrastructure-only change — no package version bump. Replaces the bespoke
`version.json` release mechanism with Changesets, consolidates `platform-js/`
and `compact-js/` into one `packages/*` workspace, and renames packages to the
`@midnightntwrk/*` scope (publishing to npmjs via OIDC Trusted Publishing, with
a transitional `@midnight-ntwrk/*` alias). The seeded versions
(`platform-js@3.0.0`, `compact-js*@2.5.5`) are published by the one-time
Trusted-Publishing bootstrap, not by this changeset.
