# Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets).
There is **no** hand-editing of version files — versions and `CHANGELOG.md`s are
derived from changeset files merged via PRs.

## TL;DR for contributors

Every PR that changes a publishable package must include a changeset:

```sh
yarn changeset        # pick the packages + bump type (patch/minor/major), write a summary
git add .changeset && git commit
```

CI (`check-changeset`) fails a PR that changes a package without one. When a change
should **not** trigger a release — infra/docs/tooling, or a package edit with no
user-facing effect (tests, comments, internal refactors) — add an **empty** changeset
to satisfy the check without publishing:

```sh
yarn changeset add --empty
git add .changeset && git commit
```

New to the repo? See [`DEV_GUIDE.md`](../DEV_GUIDE.md) for environment setup, install,
and everyday commands.

## The monorepo

A single Yarn workspace + Turborepo. All publishable packages live under
`packages/*`:

| package | scope |
| --- | --- |
| `packages/platform-js` | `@midnightntwrk/platform-js` |
| `packages/compact-js` | `@midnightntwrk/compact-js` |
| `packages/compact-js-node` | `@midnightntwrk/compact-js-node` |
| `packages/compact-js-command` | `@midnightntwrk/compact-js-command` |

Versioning is **independent** (`linked: []`); internal dependents bump together
(`updateInternalDependencies: patch`). `compact-js` resolves `platform-js`
through the workspace (`workspace:^`), so local changes are picked up without
publishing.

## Registry & scopes

Packages publish to **npmjs** via **OIDC Trusted Publishing + provenance** (no
long-lived tokens). Each is published under **two** scopes during the migration:

- `@midnightntwrk/*` — canonical (the name in `package.json`).
- `@midnight-ntwrk/*` — transitional alias, generated at publish time by
  `scripts/publish.mjs`, so existing dashed-scope consumers keep resolving.

Upstream dashed deps (`@midnight-ntwrk/compact-runtime`, …) stay on GitHub
Packages; install-time auth for them uses the CI read token.

## Dist-tags

| tag | what | how |
| --- | --- | --- |
| `latest` | stable | merge the "Version Packages" PR |
| `rc` (or `beta`) | pre-release | Changesets **pre-mode** (clean `-rc.N`) |
| `canary` | continuous snapshot | automatic, every push to `main` with pending changesets |

## CD flow (`.github/workflows/cd.yml`)

On every push to `main`, the `version` job runs `changesets/action` to create or
update the **"Version Packages" PR** (aggregated changelogs + version bumps) and
resolves a single `mode`:

- `release` — the release PR was merged (no changesets left). Runs the gated
  `publish-release` job: builds, publishes both scopes (OIDC + provenance), pushes
  signed git tags, and creates a **GitHub Release** per stable version (notes from
  `CHANGELOG.md`). The dist-tag is `latest`, or the pre-mode tag (e.g. `rc`).
- `canary` — pending package-bumping changesets and **not** in pre-mode. Publishes
  a `…-canary.<timestamp>-<sha>` snapshot of every package under `canary`.
- `none` — docs/CI-only changeset, or in pre-mode with pending changesets.

`publish-release` is gated by the **`npm-publish-release`** GitHub Environment
(required reviewers). `canary` uses **`npm-publish-canary`** (no reviewers).

## Cutting a stable release

1. Land PRs (each with a changeset) on `main`.
2. The bot opens/updates the **"Version Packages" PR**. Review it.
3. Merge it → `publish-release` runs, waits for environment approval, then
   publishes `@latest`, tags, and creates GitHub Releases.

## Cutting a pre-release (rc)

RC uses Changesets **pre-mode**, which is **repo-wide**: while active, every
package that has a changeset is versioned `-rc.N`.

> **Flush before you flip.** Publish any open "Version Packages" PR *before*
> entering pre-mode, otherwise its pending stable bumps are rewritten to `rc`.

1. Enter pre-mode locally (only after flushing — see the note above) and open a PR:
   ```sh
   yarn changeset pre enter rc      # writes .changeset/pre.json
   git add .changeset/pre.json && git commit -m "chore: enter rc pre-release mode"
   ```
2. Merge that PR (it adds `.changeset/pre.json`).
3. From then on, the "Version Packages" PR produces `-rc.N` versions; merging it
   publishes under `@rc`.
4. To return to stable, run `yarn changeset pre exit` in a PR and merge it. The
   accumulated changesets then roll up into final stable versions.

## Canary

Automatic. Any push to `main` with pending package-bumping changesets (outside
pre-mode) publishes a coherent all-package snapshot under `@canary`. Nothing to
do.

## Prerequisites (infra)

Publishing requires: the `@midnightntwrk` npm org,
a one-time Trusted-Publishing **bootstrap** for each new package name, npm
**Trusted Publishers** registered per package, the `npm-publish-release` /
`npm-publish-canary` **Environments**, and the `MIDNIGHTCI_GPG_PRIVATE_KEY` /
`MIDNIGHTCI_PACKAGES_WRITE` secrets.
