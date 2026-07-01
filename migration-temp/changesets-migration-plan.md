# Changesets / Turborepo migration — working plan & checklist

> **Status:** planning (nothing implemented yet). Working scratch doc so we don't
> lose the decisions made in discussion. Tracking issue:
> [#222](https://github.com/midnightntwrk/midnight-sdk/issues/222).
>
> **Reference implementation:** the wallet repo (`midnight-wallet`) — we are
> mirroring its setup. Its rationale is in
> `midnight-wallet/docs/decisions/0007-npmjs-trusted-publishing-and-scope-rename.md`.

---

## 1. Goal

Replace the bespoke `version.json` + custom composite-action release mechanism
with **Changesets**, and consolidate the two independent Yarn workspace roots
(`platform-js/`, `compact-js/`) into **one Turborepo monorepo** — matching how
the wallet repo works.

---

## 2. Decisions made (locked)

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| D1 | Monorepo shape | **Single root**, all packages under `packages/*` (no `apps/`) | One `package.json` (private root) + one per package = 5 manifests total. Enables `workspace:^` linking (compact → platform) + one CI/CD. |
| D2 | Versioning | **Independent** (`linked: []`, `fixed: []`) + `updateInternalDependencies: "patch"` | platform & compact bump on separate cadences; internal dependents auto-bump. |
| D3 | Registry & scope | **npmjs** via **OIDC Trusted Publishing + `--provenance`**; rename `@midnight-ntwrk/*` → **`@midnightntwrk/*`** (canonical) and **dual-publish** the dashed `@midnight-ntwrk/*` as a transitional alias | Mirrors wallet ADR-0007. Upstream deps (`compact-runtime`, `ledger-v9`) stay on GH Packages → install-time read token still required. |
| D4 | Dist-tags | `latest` (stable), `rc` (pre-release via pre-mode), `canary` (auto snapshot) | See §4. |
| D5 | RC mechanism | **Changesets pre-mode** (`changeset pre enter rc`) → clean `-rc.N` numbers | Pre-mode is **repo-global**; accepted (see §4 caveat + "flush before flip"). |
| D6 | Canary | **Snapshot** releases (`changeset version --snapshot`), all-packages-coherent via `write-canary-changeset.mjs` | Auto on every qualifying push to `main`. **Suppressed while in pre-mode.** |
| D7 | Publish gating | **One gated env for human-reviewed releases (stable *and* rc)** + **ungated canary** | Renamed from wallet's `npm-publish-stable` — see §3. |
| D8 | PR gate | **Enforced** `check-changeset` (skips `changeset-release/*`) | Every publishable change declares semver intent. |
| D9 | Tags + GitHub Releases | GPG-signed git tags **+ a GitHub Release per stable version** (notes from CHANGELOG) | Goes **beyond** wallet (wallet only tags); required by #222. Releases on **stable only**, not rc/canary. |
| D10 | Changelog source | `@changesets/cli/changelog` (from changeset files) | Replaces compact's commit-based `conventional-changelog`. |
| D11 | Publish tool | Custom **`scripts/publish.mjs`** (`npm publish --provenance`), **not** `changeset publish` | `changeset publish` can't do `--provenance` or the dual-scope alias. Forced by D3. |

---

## 3. Naming change vs. wallet

The wallet's `npm-publish-stable` env/job actually gates **stable *and* rc** (i.e.
human-reviewed, non-canary releases). To avoid the misleading name we rename on
the axis that matters (gated vs ungated), not the dist-tag:

| concept | wallet | here | gate |
|---|---|---|---|
| human-reviewed release (stable **or** rc) | `npm-publish-stable` | **`npm-publish-release`** | required reviewers |
| automatic snapshot | `npm-publish-canary` | `npm-publish-canary` | none |
| CD `mode` output | `stable`/`canary`/`none` | **`release`**/`canary`/`none` | — |
| publish job | `publish-stable` | **`publish-release`** | — |

The `publish-release` job runs when the "Version Packages" PR merges; the dist-tag
it uses (`latest` vs `rc`) is resolved at runtime from `.changeset/pre.json`.

---

## 4. RC vs canary — the model & the caveat

- **A changeset file ≠ rc.** It just records semver intent (patch/minor/major) per
  PR. Whether it ships as stable/rc/canary is decided at release time.
- **rc = pre-mode** (global `.changeset/pre.json`). Gives clean `2.6.0-rc.1/.2`.
- **canary = snapshots** (timestamped, every qualifying push), separate channel.

**Caveat (accepted):** pre-mode is repo-wide. While compact is in rc, if platform
gets its *own* changeset it is also dragged to `-rc.N` (not via the dependency —
just because pre-mode applies to anything with a pending changeset). An idle
platform (no changeset) is unaffected. On `pre exit`, accumulated changesets roll
up to final stable versions.

**Operational rule — "flush before you flip":** before `changeset pre enter rc`,
merge/publish any outstanding "Version Packages" PR, or that pending stable bump
gets rewritten to rc. Enforced by a guarded `enter-prerelease` workflow (refuses
if an open release PR exists).

### How the dist-tag is derived and passed (the key mechanism)

`publish.mjs` already accepts `--tag` and skips non-prerelease versions when a tag
is set, so **no change to the script** — only a shim in CD:

```yaml
- name: Resolve dist-tag (stable vs pre-release)
  id: disttag
  run: |
    set -euo pipefail
    if [ -f .changeset/pre.json ] && [ "$(jq -r '.mode // empty' .changeset/pre.json)" = "pre" ]; then
      echo "prerelease=true"                         >> "$GITHUB_OUTPUT"
      echo "tag=$(jq -r '.tag' .changeset/pre.json)" >> "$GITHUB_OUTPUT"   # e.g. "rc"
    else
      echo "prerelease=false"                        >> "$GITHUB_OUTPUT"
    fi

- name: Build, publish (both scopes), tag
  run: |
    set -euo pipefail
    yarn dist:publish
    if [ "${{ steps.disttag.outputs.prerelease }}" = "true" ]; then
      node scripts/publish.mjs --tag "${{ steps.disttag.outputs.tag }}"   # @rc
    else
      node scripts/publish.mjs                                            # @latest
    fi
    yarn changeset tag
    git push origin --tags

- name: Create GitHub Releases   # stable only (#222)
  if: steps.disttag.outputs.prerelease == 'false'
  run: node scripts/github-releases.mjs
```

---

## 5. Implementation plan (code — to be done on a branch)

- **A. Restructure → single root.** `git mv` packages into `packages/*`
  (`platform-js`, `compact-js`, `compact-js-node`, `compact-js-command`). Delete
  the two `*-sources` manifests. Create private root `package.json`
  (`workspaces: ["packages/*"]`, merged devDeps/`resolutions`, turbo+changeset
  scripts). One root `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`,
  `.yarnrc.yml`, single regenerated `yarn.lock`.
- **B. Rename + seed.** 4 package.json renames to `@midnightntwrk/*`; internal
  deps → `workspace:^`. Seed versions (see §6.5 — these are PLACEHOLDERS):
  platform `3.0.0`, compact trio `2.5.5`.
- **C. Changesets.** Port wallet `.changeset/config.json`. Seed `CHANGELOG.md`
  per package (keep compact's existing history; fresh for platform).
- **D. Scripts.** Port/adapt `scripts/publish.mjs` + `scripts/write-canary-changeset.mjs`
  (scopes → `@midnightntwrk` / `@midnight-ntwrk`); new `scripts/github-releases.mjs`.
- **E. Workflows.** Unified `ci.yml`; `check-changeset.yml`; `cd.yml`
  (`version` → `publish-release` → `canary`, GPG-signed, tag shim above);
  guarded `enter-prerelease.yml`.
- **F. Removals.** Both `version.json`; `.github/actions/create-package-artifacts`
  + `publish-package-artifacts`; `cd.yaml` + `cd-compact-js.yaml` +
  `cd-platform-js.yaml`; per-root `ci-*` split; `code-workspace` paths.
  **⚠ KEEP husky + commitlint (see §6).**
- **G. Docs.** Rewrite `docs/releasing.md`; update `CONTRIBUTING.md` (changeset
  step); add `docs/decisions/0001-changesets-npmjs-trusted-publishing.md` ADR.
- **I. Delivery.** **All code lands in ONE PR** (restructure + root config +
  renames + changesets + scripts + workflows + docs + removals). NOT split into
  multiple code PRs.
  - The only separately-ordered thing is **infra**, and it's not code: the
    **one-time token bootstrap** (§8) must run before the first OIDC publish can
    succeed, because npm Trusted Publishing can't be configured for a package
    name that doesn't yet exist on npm. So the order is: merge the PR → infra
    does bootstrap + registers Trusted Publishers + creates Environments →
    subsequent CD publishes are tokenless OIDC. Nothing auto-publishes before
    that (publishing needs a release-PR merge + reviewer approval).

---

## 6. ⚠ Husky — KEEP for now (revisit later)

Per decision: **do not remove** husky / commitlint — Ian wants to keep the option
and will revisit. So:

- **Keep:** `.husky/`, `commitlint.config.js`, `@commitlint/*`, the `prepare:
  husky` hook. Promote to repo root if we want it repo-wide (currently compact-js
  only) — **decision deferred.**
- **One wrinkle to resolve when revisiting:** compact's `generate-changelog.js` /
  `conventional-changelog-cli` **generate `CHANGELOG.md` from commits**, which
  now conflicts with Changesets owning `CHANGELOG.md` (D10). We should stop the
  conventional-changelog *changelog generation* (the `changelog` script) so two
  tools don't both write `CHANGELOG.md` — but that is independent of keeping
  husky/commitlint for *commit linting*. **Flagged, not yet actioned.**

---

## 6.5. ⚠ Version seeding & pre-merge reconciliation (BOTH packages)

Under the old system `version.json` is the source of truth and the committed
`package.json` `version` is **intentionally stale**. Under Changesets the
**`package.json` `version` becomes the source of truth** and bumps happen from
it — so each must be seeded to the *real current published* version.

Current state (mismatch confirmed):

| package | package.json | real (version.json) | seed to |
|---|---|---|---|
| platform-js | `2.2.0` (stale ❌) | `3.0.0` | **3.0.0** |
| compact-js ×3 | `2.5.5-rc.2` | `2.5.5-rc.2` | **2.5.5** |

**These seeds are PLACEHOLDERS — they WILL drift.** While this branch is in
progress, `main` may advance and new releases may ship, changing the true current
versions for **both** packages (not just compact).

**MANDATORY pre-merge step:** immediately before merging this PR, re-check the
actual latest published versions on the registry and update every `package.json`
seed to match. Otherwise the first post-migration release bumps from a stale base
(could republish an existing version or skip numbers).

---

## 7. Open items (need input / not yet decided)

- [x] **compact-js seed version:** `2.5.5` (placeholder — reconcile pre-merge, §6.5).
- [x] **Branch:** `feat-222-adopt-changeset` (ticket #222), in a **worktree** at
      `../midnight-sdk.feat-222-adopt-changeset`. All work happens there.
- [ ] **Pre-merge:** reconcile ALL package.json version seeds vs the registry (§6.5).
- [ ] **Husky scope:** keep compact-only or promote repo-wide (deferred, §6).
- [ ] **conventional-changelog generation:** disable to avoid double-writing
      CHANGELOG.md (deferred, §6).

---

## 8. 🔧 Infra prerequisites — FOR THE INFRA CONVERSATION

These are GitHub/npm **settings**, not code. None of the CD can publish until
they exist. (Wallet already has the org-level pieces; the per-package + per-repo
pieces are new for midnight-sdk.)

- [ ] **npm `@midnightntwrk` org** — confirm these 4 package names can be
      published there: `platform-js`, `compact-js`, `compact-js-node`,
      `compact-js-command` (×2 scopes incl. dashed alias `@midnight-ntwrk/*`).
- [ ] **One-time token bootstrap** per *new* package name. Trusted Publishing is
      chicken-and-egg: you can't configure a Trusted Publisher for a package that
      doesn't exist on npm yet. First publish needs a temporary token; OIDC takes
      over after. (Wallet did this in PR #482.) All 4 names ×2 scopes are new.
- [ ] **npm Trusted Publisher** registered for each package (×2 scopes):
      - repo: `midnightntwrk/midnight-sdk`
      - workflow: `.github/workflows/cd.yml`
      - environment: `npm-publish-release` or `npm-publish-canary`
- [ ] **GitHub Environments** (this repo):
      - `npm-publish-release` — **required reviewers** (gates stable + rc)
      - `npm-publish-canary` — no reviewers
- [ ] **Secrets reachable in this repo:**
      - `MIDNIGHTCI_GPG_PRIVATE_KEY` — GPG signing of release commits/tags
      - `MIDNIGHTCI_PACKAGES_WRITE` — release-PR creation + tag push (already used
        by current sdk workflows)
      - `MIDNIGHTCI_PACKAGES_READ` — install-time auth for upstream
        `@midnight-ntwrk` deps still on GH Packages
- [ ] **Branch protection on `main`:** confirm the changesets bot/PAT can open PRs
      and push tags past protection rules (and org tag-protection rules).

---

## 9. Quick reference — wallet files we are mirroring

- `midnight-wallet/.changeset/config.json` — changeset config
- `midnight-wallet/scripts/publish.mjs` — dual-scope OIDC + provenance publish
- `midnight-wallet/scripts/write-canary-changeset.mjs` — all-package canary
- `midnight-wallet/.github/workflows/cd.yml` — version/publish/canary topology
- `midnight-wallet/.github/workflows/check-changeset.yml` — PR gate
- `midnight-wallet/docs/decisions/0007-npmjs-trusted-publishing-and-scope-rename.md` — the why
