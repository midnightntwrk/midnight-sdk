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

Re-running CD on a version that is already released is a **no-op**, so a
partially failed release is safe to retry:

- the publish step reads each tarball's name/version and skips anything already
  on the registry;
- the `release` job skips the git tag and the GitHub Release if they already
  exist, so it converges instead of failing on work a previous attempt finished.

One thing a re-run cannot do for you: a version already on npmjs cannot be
republished, so changing `version.json` → `tag` alone (to promote an existing
build from `rc` to `latest`, say) does **not** move the dist-tag. CD warns and
prints the `npm dist-tag add` command to run — see
[npmjs-trusted-publishing.md](./npmjs-trusted-publishing.md).

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

## Git tags and release notes

- **compact-js** pushes a `compact-js-v<version>` git tag and cuts a GitHub
  Release after a successful publish. `<version>` is the version the `publish`
  job actually put on npmjs — read out of the packed tarball, not out of a
  committed `package.json` — so `-alpha` builds tag
  `compact-js-v3.0.0-alpha.42`, not a bare `compact-js-v3.0.0` shared by every
  alpha. A prerelease version is marked as a GitHub prerelease so it does not
  displace the repo's "Latest release".
- **platform-js** does **not** tag — it only publishes to the registry.

Release notes come from the top section of `compact-js/CHANGELOG.md` (everything
between the first `## <version> (<date>)` heading and the next one). **That file
is maintained by hand** — nothing generates it — so update it in the same commit
that bumps `version.json`. If the section is empty the release falls back to
`Release <version>`.

## Verifying a release

```bash
# provenance attestation is present
npm view @midnight-ntwrk/<pkg>@<version> --json | jq '.dist.attestations'

# signatures + provenance verify in a fresh consumer project
npm install @midnight-ntwrk/<pkg>@<version>
npm audit signatures
```
