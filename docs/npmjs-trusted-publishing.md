# npmjs Trusted Publishing (OIDC + provenance)

CD publishes the four public packages to **npmjs** with
[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers). There is no
long-lived npm token: the runner exchanges a short-lived GitHub OIDC token for a
publish credential, and npm attaches a signed **provenance attestation** to every
tarball.

Published packages:

| package | workspace | dist-tag source |
| --- | --- | --- |
| `@midnight-ntwrk/compact-js` | `compact-js/compact-js` | `compact-js/version.json` → `v_info.tag` |
| `@midnight-ntwrk/compact-js-node` | `compact-js/compact-js-node` | ” |
| `@midnight-ntwrk/compact-js-command` | `compact-js/compact-js-command` | ” |
| `@midnight-ntwrk/platform-js` | `platform-js/platform-js` | `platform-js/version.json` → `v_info.tag` |

The two workspace roots (`*-sources`) are `private: true` and never published.

## How the pieces fit

```
Actions → CD (cd.yaml, workflow_dispatch: workspace)
├─ cd-<workspace>.yaml  →  ci-base.yaml   build, test, pack → "Packages <ws>" artifact
├─ publish   environment: npm-publish-stable   ← reviewer approval gate
│            permissions: id-token: write      ← the OIDC grant
│            setup-node registry-url=https://registry.npmjs.org, scope=@midnight-ntwrk
│            .github/actions/publish-package-artifacts
│              per tarball: skip if already on npmjs,
│                           else npm publish <tgz> --provenance --tag <tag> --access public
│              outputs: versions (name → packed version), published/skipped counts
└─ release   compact-js only: git tag + GitHub Release, from `publish`'s
             `versions` output — idempotent, so a retry converges
```

`publish` reports the version of every tarball it saw, published or skipped, and
`release` tags from that. It deliberately does not re-derive the version from
`compact-js/compact-js/package.json`: the manifests are bumped on the runner and
never pushed, so the committed value lags `version.json`, and a `-alpha` build
publishes a `-alpha.<commit-height>` version that no committed manifest carries.

### Why the publish job lives in `cd.yaml`

**Do not move the publish job back into `cd-compact-js.yaml` / `cd-platform-js.yaml`.**

npm allows **exactly one** trusted publisher per package, and its validation of
reusable workflows is ambiguous about whether it matches the *calling* workflow
or the workflow containing the publish step. Keeping the job in `cd.yaml` makes
`workflow_ref` and `job_workflow_ref` both resolve to `cd.yaml`, so one publisher
config per package is correct under either interpretation. The
`cd-<workspace>.yaml` files are `workflow_call`-only for the same reason: it
guarantees `cd.yaml` is always the entry point.

## One-time setup

1. **GitHub Environment** — Settings → Environments → create **`npm-publish-stable`**
   with required reviewer(s). Optionally restrict deployment branches to `main`
   and `release/*`.
2. **Trusted Publisher per package** — on npmjs, for each of the four packages,
   Settings → Trusted Publisher:
   - Provider: **GitHub Actions**
   - Organization / repository: `midnightntwrk/midnight-sdk`
   - Workflow filename: **`cd.yaml`** (the same for all four)
   - Environment: **`npm-publish-stable`**
3. Leave npmjs's **disallow tokens** setting off until the first OIDC publish has
   succeeded — it is independent of trusted publishing, and turning it on early
   removes the manual fallback.

## Registry configuration, and what lives where

| concern | where it is set | why not elsewhere |
| --- | --- | --- |
| publish registry | `setup-node` `registry-url` on the `publish` job | see below |
| public access | `--access public` on `npm publish` | see below |
| dist-tag | `<workspace>/version.json` → `v_info.tag` | single source of truth for versioning |
| provenance | `--provenance` flag **and** `publishConfig.provenance: true` in each manifest | belt and braces |

`publishConfig.registry` and `publishConfig.access` are deliberately **absent**
from the manifests. Packages here publish the `@effect/build-utils pack-v3`
`dist/` folder, and `pack-v3` synthesises `dist/package.json` from an allowlist —
of `publishConfig` it preserves only `provenance` and `executableFiles`. A
`registry` or `access` key in a source manifest would be silently dropped before
publish, so those two settings belong on the workflow.

Installs need no registry configuration at all: every `@midnight-ntwrk` package
this repo consumes is public on npmjs, which is Yarn's and npm's default
registry. That is why the `.yarnrc.yml` files carry no `npmScopes` entry and CI
no longer configures an npm auth token. The `MIDNIGHTCI_PACKAGES_WRITE` secret is
still used for the ghcr container login and for `compactc` GitHub-release
downloads — not for npm. It is the only secret the build chain needs, so the
reusable workflows declare it and callers pass it through an explicit `secrets:`
map rather than `secrets: inherit`.

## Failure modes

| symptom | cause |
| --- | --- |
| `403 OIDC token exchange failed` | The publisher config does not match the run. All three of repo, workflow filename (`cd.yaml`) and environment (`npm-publish-stable`) must match exactly. Most likely cause: the publish job was moved into a called workflow, or the `environment:` was removed. |
| `404 Not Found` on publish | No trusted publisher configured for that package (each of the four needs its own). |
| `ENEEDAUTH` / `This command requires you to be logged in` | The OIDC exchange did not happen or did not succeed. Either npm < 11.5.1 (the `Assert npm supports Trusted Publishing` step catches this — bump `.nvmrc`), or `id-token: write` is missing from the `publish` job, so GitHub never set `ACTIONS_ID_TOKEN_REQUEST_URL`/`_TOKEN` and npm skipped the exchange, or the exchange itself failed (re-run with `--loglevel verbose` — `npm` logs the reason at verbose only). Note that a configured token is **not** a cause: `npm publish` calls the OIDC exchange unconditionally, before it looks at credentials, and on success *overwrites* the registry's `_authToken`. We simply have no token to configure. |
| Publish succeeds, no attestation | `id-token: write` missing from the `publish` job, or the repository became private (provenance requires a public repo). |
| `409` / `403 cannot publish over existing version` | The idempotency check did not see the version — usually because `npm view` could not reach npmjs. Safe to re-run. |
| `dist-tag '<tag>' points at '<other>'` warning | The version was already published, so it was skipped, and `version.json` → `v_info.tag` now names a different version. A dist-tag cannot be moved from CD: the OIDC credential is minted inside `npm publish` and is not visible to `npm dist-tag`. Run the `npm dist-tag add …` command from the warning by hand. Expect this warning benignly when re-running CD for an older release. |
| `no .tgz files found` | CD ran from a branch not in `version.json` → `releaseBranches`, so nothing was packaged. |
| A new `@midnight-ntwrk` version cannot be resolved during install | `npmMinimalAgeGate: '7d'` — freshly published versions are not resolvable for 7 days. This applies to the cross-workspace `platform-js` → `compact-js` dependency too. |

## Consumers

New versions of these four packages appear on **npmjs only**. Anything that
resolved `@midnight-ntwrk` from GitHub Packages needs to point at npmjs (or drop
its scope override — npmjs is the default) before it can pick up a release made
after this migration.
