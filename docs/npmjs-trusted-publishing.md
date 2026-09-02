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
└─ release   compact-js only: git tag + GitHub Release
```

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
downloads — not for npm.

## Failure modes

| symptom | cause |
| --- | --- |
| `403 OIDC token exchange failed` | The publisher config does not match the run. All three of repo, workflow filename (`cd.yaml`) and environment (`npm-publish-stable`) must match exactly. Most likely cause: the publish job was moved into a called workflow, or the `environment:` was removed. |
| `404 Not Found` on publish | No trusted publisher configured for that package (each of the four needs its own). |
| OIDC never attempted; npm asks for auth | npm < 11.5.1 (the `Assert npm supports Trusted Publishing` step catches this — bump `.nvmrc`), or a token is configured for the registry. `always-auth: true` or a `NODE_AUTH_TOKEN` on the setup-node step writes token auth into `.npmrc` and suppresses the exchange — neither may be set on the publish job. |
| Publish succeeds, no attestation | `id-token: write` missing from the `publish` job, or the repository became private (provenance requires a public repo). |
| `409` / `403 cannot publish over existing version` | The idempotency check did not see the version — usually because `npm view` could not reach npmjs. Safe to re-run. |
| `no .tgz files found` | CD ran from a branch not in `version.json` → `releaseBranches`, so nothing was packaged. |
| A new `@midnight-ntwrk` version cannot be resolved during install | `npmMinimalAgeGate: '7d'` — freshly published versions are not resolvable for 7 days. This applies to the cross-workspace `platform-js` → `compact-js` dependency too. |

## Consumers

New versions of these four packages appear on **npmjs only**. Anything that
resolved `@midnight-ntwrk` from GitHub Packages needs to point at npmjs (or drop
its scope override — npmjs is the default) before it can pick up a release made
after this migration.
