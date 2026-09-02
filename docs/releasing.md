# Releasing

Packages are published to **npmjs** from the **CD** workflow
(`.github/workflows/cd.yaml`), which is **manual only** (`workflow_dispatch`).
Merging to `main` does **not** publish — that only runs CI (build/test).

Publishing is **tokenless**: CD authenticates with
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) and
every tarball ships a signed provenance attestation. See
[npmjs-trusted-publishing.md](./npmjs-trusted-publishing.md) for the setup and
failure modes.

## How to cut a release

1. Merge your change to `main`.
2. Actions → **CD** → **Run workflow** → set *Use workflow from* = `main`,
   choose the workspace (`platform-js` or `compact-js`).
3. The `publish` job pauses on the **`npm-publish-stable`** environment until a
   required reviewer approves it. Nothing reaches npmjs before that.

The job only packages when run from a branch listed in that workspace's
`version.json` → `releaseBranches` (`main` or `release/<pkg>/.*`). Run from any
other branch and the packaging steps are skipped (the publish job then fails
because there is no artifact to publish).

Re-running CD on a version that is already on npmjs is a **no-op** — the publish
step reads each tarball's name/version and skips anything already on the
registry, so a partially failed release is safe to retry.

## Versioning — `<workspace>/version.json`

`version.json` is the **single source of truth** for the published version:

| field             | meaning                                              |
| ----------------- | ---------------------------------------------------- |
| `version`         | base semver, e.g. `3.0.0`                            |
| `preRelease`      | suffix (see below)                                   |
| `tag`             | npm dist-tag used in `npm publish --tag <tag>`       |
| `releaseBranches` | regexes of branches allowed to publish               |

The published version is derived from `version` + `preRelease`:

| `preRelease` | publishes              | use for                 |
| ------------ | ---------------------- | ----------------------- |
| `""` (empty) | `3.0.0`                | a stable release        |
| `-rc.1`      | `3.0.0-rc.1` (exact)   | a specific pre-release  |
| `-alpha`     | `3.0.0-alpha.<height>` | continuous pre-releases |

`<height>` = number of commits since `version.json` last changed.

**You only edit `version.json`.** The CD job bumps every workspace `package.json`
to the computed version **on the runner only** (so the packed tarball is correct)
— this commit is **not** pushed back to `main`, so branch protection is unaffected.

## Git tags

- **compact-js** pushes a `compact-js-v<version>` git tag after a successful
  publish.
- **platform-js** does **not** tag — it only publishes to the registry.

## Verifying a release

```bash
# provenance attestation is present
npm view @midnight-ntwrk/<pkg>@<version> --json | jq '.dist.attestations'

# signatures + provenance verify in a fresh consumer project
npm install @midnight-ntwrk/<pkg>@<version>
npm audit signatures
```
