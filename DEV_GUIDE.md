# Developer Guide

Practical guide for working in the **midnight-sdk** monorepo. For the full
release/publishing mechanics see [`docs/releasing.md`](docs/releasing.md); for
coding conventions see [`CLAUDE.md`](CLAUDE.md).

## Overview

A single Yarn workspace + Turborepo. Publishable packages live under `packages/*`,
all on the `@midnightntwrk` scope:

| package | purpose |
| --- | --- |
| `platform-js` | core abstractions/utilities/types for the Midnight blockchain |
| `compact-js` | execution environment for contracts compiled by `compactc` |
| `compact-js-node` | Node.js platform implementations for Compact.js |
| `compact-js-command` | CLI utilities for compiled contracts |

`compact-js` depends on `platform-js` via `workspace:^`, so local changes are
picked up without publishing. The codebase uses the Effect library heavily.

## Prerequisites

- **Node** — pinned in [`.nvmrc`](.nvmrc) (currently `24.11.0`); run `nvm use`. That's the
  dev version; the published packages' `engines.node` floor is `>= 22` (they differ on
  purpose — contributors pin an exact version, consumers get a minimum).
- **Corepack + Yarn 4.10.3** — `corepack enable` (Yarn is pinned via `packageManager`
  and the committed `.yarn/releases` binary; don't install Yarn globally).
- **direnv** *(recommended)* — auto-loads environment variables and Git GPG-signing
  config when you `cd` in. See <https://direnv.net>. Strongly recommended (see below).
- **Docker** — required for some `compact-js` tests (testcontainers).
- **GitHub Packages auth** — upstream `@midnight-ntwrk/*` dependencies
  (`compact-runtime`, `midnight-js-compact`, …) install from `npm.pkg.github.com`,
  so you need a token (see *Install*).

## Environment variables (important)

The Compact toolchain needs `COMPACTC_VERSION` (plus `COMPACT_REPO`,
`COMPACT_TAG_PREFIX`), defined in [`packages/compact-js/compact.env`](packages/compact-js/compact.env).
These are loaded automatically by:

- **direnv** locally — [`.envrc`](.envrc) runs `dotenv packages/compact-js/compact.env`, and
- **CI** — the workflow's "Load environment variables" step.

**Without direnv**, a fresh build runs the `compactc` download, which needs
`COMPACTC_VERSION`; if it's unset you'll see *"COMPACTC_VERSION env var is missing"*.
Either use direnv, or export the vars manually:

```bash
export $(grep -v '^#' packages/compact-js/compact.env | xargs)
```

direnv also enables Git commit/tag GPG signing for the repo (via `.envrc`).

## Install

```bash
nvm use && corepack enable
yarn install            # resolves to the workspace root from anywhere
```

Dependencies hoist to the **root** `node_modules` (you won't see a `node_modules`
inside each package — that's expected). Configure install-time auth for the
upstream dashed-scope deps once:

```bash
# a GitHub PAT with read:packages
yarn config set 'npmScopes.midnight-ntwrk.npmAuthToken' "<TOKEN>"
```

(CI uses the `MIDNIGHTCI_PACKAGES_*` secrets for this.)

## Everyday commands (run from the repo root)

```bash
yarn dist                 # turbo run dist — all packages, in dependency order
yarn dist --filter=@midnightntwrk/platform-js   # just one package
yarn test                  # all tests (some require Docker)
yarn test --filter=@midnightntwrk/compact-js
yarn lint                  # eslint across the monorepo (--fix to auto-fix)
yarn clean                 # remove build artifacts
```

Prettier is enforced through `eslint-plugin-prettier`, so `yarn lint` also flags
formatting.

### Compact contracts

`compact-js` compiles `.compact` test contracts with `compactc`:

```bash
# from packages/compact-js (needs COMPACTC_VERSION — see above)
yarn compact
```

On first run this downloads `compactc` (into
`node_modules/@midnight-ntwrk/midnight-js-compact/managed/<version>/`). Set
`COMPACT_HOME` to point at a pre-installed `compactc` to skip the download.

## Changesets (required on PRs)

Any PR that changes a package under `packages/*` **must include a changeset**:

```bash
yarn changeset              # pick package(s) + bump (patch/minor/major) + summary
yarn changeset add --empty  # infra/docs-only PRs that must NOT trigger a release
yarn changeset:status       # see what would be released
```

The `check-changeset` CI job enforces this. Versions and `CHANGELOG.md`s are
generated automatically — **do not hand-edit package versions**. Full flow (stable,
`rc` pre-mode, `canary` snapshots, publishing): [`docs/releasing.md`](docs/releasing.md).

## Branching & commits

- Work on a branch per change; open a PR to `main`.
- **Conventional Commits** are enforced by husky + commitlint (a `commit-msg` hook).
- Don't force-push shared branches mid-review (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `command not found: fetch-compactc` | Ensure `@midnight-ntwrk/midnight-js-compact` is a devDependency of `packages/compact-js` and `yarn install` has run (its bin is on that package's script PATH). |
| `COMPACTC_VERSION env var is missing` | Use direnv, or `export $(grep -v '^#' packages/compact-js/compact.env \| xargs)`. |
| `compact-js` can't resolve `platform-js` types | Run `yarn dist` (Turbo builds `platform-js` first; `workspace:^` links it locally). |
| Docker/testcontainers test failures | Make sure Docker is running; the first run pulls images. |
| Install 401s on `@midnight-ntwrk/*` | Set the GH Packages auth token (see *Install*). |
