# MIGRATION_TEMP.md

**Temporary migration notes — DELETE before / at production cut-over.**

This file tracks deliberate, _temporary_ safety measures and TODOs added while the
Changesets + Turborepo migration (issue #222) is being validated. Everything listed
here is meant to be **reverted** before we publish for real. Treat it as the
go-live checklist: work top to bottom, undo each item, tick it off, then remove
this file **and the `migration-temp/` directory** (which holds the temporary
tooling referenced below).

> ⚠️ If this file still exists, the release pipeline is **not** in its final
> production state.

---

## Cut-over checklist

- [ ] **Disable publish dry-run** — re-enable real npm publishing (§1).
- [ ] _(add further temporary items here as they come up)_
- [ ] **Delete the `migration-temp/` directory** (revert tool + config, §2).
- [ ] **Delete `MIGRATION_TEMP.md`** once everything above is done.

---

## 1. Publish dry-run (`scripts/publish.mjs`)

**What we did & why.** To guarantee nothing is accidentally published to the npm
registry while we validate the pipeline, `scripts/publish.mjs` forces
`npm publish --dry-run`. npm still runs every step (pack, name/version validation,
provenance wiring) **except** the final upload, so the CD flow can be exercised
end-to-end with zero risk of a real release.

**Where.** Near the top of `scripts/publish.mjs`:

```js
const DRY_RUN = true;
const dryRunArgs = DRY_RUN ? ['--dry-run'] : [];
```

`...dryRunArgs` is appended to the `npm publish` args in both `publishPrimary`
and `publishAlias`, and a `⚠️ DRY RUN ENABLED` banner is logged on every run.

**How to go live (revert).**

1. Open `scripts/publish.mjs`.
2. Set the flag to false:
   ```js
   const DRY_RUN = false;
   ```
   (or delete the whole `MIGRATION SAFETY: DRY RUN` block plus the two
   `...dryRunArgs` spreads and the `if (DRY_RUN)` banner).
3. Sanity check: `grep -n "dry-run\|DRY_RUN" scripts/publish.mjs` should return
   nothing (if you deleted the block) or `DRY_RUN = false`.
4. Confirm a canary/rc publish actually appears on npmjs before trusting `latest`.

**How to verify it's currently safe.** A CD run logs
`⚠️ DRY RUN ENABLED (MIGRATION_TEMP.md): --dry-run is set, NOTHING will be published.`
and each `npm publish` prints its `+ name@version` tarball contents without
contacting the registry to upload.

---

## 2. Revert-to-baseline tool (`migration-temp/`)

**What & why.** Changesets testing merges real release PRs into `main` (version
bumps, changelogs, in-tree tags). After a test run we need `main` back exactly as
it was. `main` is protected, so we can't push to it — this tool opens a **PR** whose
single commit restores the repo tree to a chosen **baseline** commit; you merge the
PR to finish. The revert commit is built with `git commit-tree` (plumbing), so it
**never touches your working tree, index, or current branch**.

**Files.**

- `migration-temp/revert-to-baseline.mjs` — the tool.
- `migration-temp/revert.config.json` — stores `baselineHash` (+ `baseBranch`) so it
  can run unattended.

**How to use.**

```sh
# 1) BEFORE testing: capture the current main as the baseline.
node migration-temp/revert-to-baseline.mjs --set-baseline
#    (or pin a specific commit)
node migration-temp/revert-to-baseline.mjs --set-baseline --hash <sha>

# 2) AFTER testing: open the revert PR, then merge it in the GitHub UI.
node migration-temp/revert-to-baseline.mjs            # interactive / uses config
node migration-temp/revert-to-baseline.mjs --hash <sha> --yes   # non-interactive
```

**Hash resolution (first wins):** `--hash` → `revert.config.json` `baselineHash` →
interactive prompt (TTY only).

**Directing Claude.** Set the baseline in `revert.config.json` (or via `--set-baseline`),
then ask Claude to run the tool; it opens the PR and hands you the URL. Merging the PR
is the human step. Requires the `gh` CLI authenticated.

**Notes.** It always fetches `origin/<base>` first and reverts to the latest main; if
`main` already matches the baseline it does nothing. If branch protection requires
signed commits, sign on merge (the plumbing commit is unsigned).

---

## 3. Local changeset testing (`migration-temp/add-test-change.mjs`) — NEVER COMMIT

> 🚫 **Everything this produces is local-only. Never commit, never push.** Always
> end with a clean-up (below). This just lets you *see* what a release would do.

**What & why.** To rehearse the changesets flow locally — real version bumps and
`CHANGELOG.md` updates — you need an actual change in one or more packages. This tool
drops a throwaway `src/__changeset_test__.ts` (with a big DO-NOT-COMMIT banner) into
the packages you choose. See also `DEV_GUIDE.md` → "Changesets".

**The workflow.**

```sh
# 1) Add a throwaway change to chosen package(s):
node migration-temp/add-test-change.mjs             # interactive (asks which)
#    or: --all   |   --packages platform-js,compact-js

# 2) Build everything first (required before changeset version):
yarn dist

# 3) Create a changeset for the same package(s):
yarn changeset            # pick package(s) + bump (patch/minor/major) + summary

# 4) Apply it and inspect what a release WOULD change:
yarn changeset version
git diff                  # version bumps in package.json + CHANGELOG.md entries
```

**Clean-up — do this every time (IMPORTANT).**

```sh
node migration-temp/add-test-change.mjs --clean     # delete the test .ts files
rm .changeset/*.md                                  # remove any leftover test changeset
                                                    # (keep config.json + README.md)
git reset --hard                                    # undo version/CHANGELOG/lockfile edits
```

⚠️ **`git reset --hard` alone is NOT enough.** It only reverts *tracked* files (the
`package.json` versions, `CHANGELOG.md`, `yarn.lock` that `changeset version` edits).
The test `.ts` files and the `.changeset/*.md` you created are *untracked*, so
`reset --hard` leaves them behind — that's why `--clean` and the `rm` come first.

**Avoid `git clean -fd` for this** unless `migration-temp/` is already committed —
otherwise it would delete this tooling too. The targeted clean-up above is safer.

---

## 4. Packaging dry-run — see `workspace:` become real versions (`migration-temp/package-dry-run.mjs`)

> 🚫 **Local-only.** Output goes to `migration-temp/packaged/`, which is
> self-git-ignored and must never be committed.

**What & why.** At publish time `scripts/publish.mjs` rewrites each `dist/package.json`
so `workspace:^` becomes the concrete `^<version>` (its `resolveWorkspaceRanges()`) —
because npm can't publish the `workspace:` protocol. This tool performs that **same
rewrite without publishing**: it copies each package's built `dist/` into
`migration-temp/packaged/<pkg>/` and resolves the ranges, so you can inspect the exact
`package.json` that would ship and confirm `workspace:^` → e.g. `^3.0.1`.

**Run it (best right after the §3 test, to see _bumped_ versions resolved).**

```sh
# 1) (optional) do the §3 flow so versions are bumped:
#    add-test-change -> yarn changeset -> yarn changeset version
# 2) build so dist/package.json carries the (bumped) versions:
yarn dist
# 3) stage + resolve, then inspect:
node migration-temp/package-dry-run.mjs           # prints each workspace:^ -> ^x.y.z
node migration-temp/package-dry-run.mjs --pack    # also `npm pack` each (produces .tgz)
cat migration-temp/packaged/compact-js/package.json   # workspace:^ is now a real range
```

**Clean up.**

```sh
node migration-temp/package-dry-run.mjs --clean   # removes migration-temp/packaged/
```

**Notes.** Requires `yarn dist` first (errors if a `dist/` is missing). Versions come
from the current source `package.json`s, so run `yarn dist` **after** any
`yarn changeset version` to see the bumped numbers. This only mirrors the primary
`@midnightntwrk` scope + `workspace:` resolution — the dashed `@midnight-ntwrk` alias
staging is not reproduced (not needed to verify this behaviour).

---

## 5. Cleanup to rule them all (run after ANY local testing)

**Why a dedicated cleanup:** `git reset --hard` alone is **NOT enough** — it only
reverts *tracked* files. The test `.ts` files, any leftover test changeset, and
`migration-temp/packaged/` are **untracked or git-ignored**, so they survive a reset.
Pick one of the tiers below.

### Recommended — surgical (safe even if `migration-temp/` isn't committed)

```sh
node migration-temp/add-test-change.mjs --clean    # delete the test .ts files
node migration-temp/package-dry-run.mjs --clean    # delete migration-temp/packaged/
git reset --hard                                   # revert version/CHANGELOG edits + restore any consumed changeset
git clean -fd .changeset                           # remove leftover TEST changesets (keeps tracked config.json/README.md)
git status                                         # expect: clean
```

### Thorough — the "git clean" sweep

> ⚠️ **`git clean` deletes untracked files — including the `migration-temp/` tooling
> if it isn't committed yet.** Commit the tooling first, and always dry-run.

```sh
git reset --hard              # revert tracked edits, restore any consumed changeset
git clean -nd                 # DRY RUN — LIST what would be deleted, and read it
git clean -fd                 # remove untracked test files (.ts, stray test changesets)
rm -rf migration-temp/packaged   # git clean -fd skips ignored files, so remove this explicitly
git status                    # expect: clean
```

### Nuclear — pristine checkout

> ⚠️ Also deletes every ignored file: `node_modules/`, `dist/`, `build/`, `.yarn/cache`,
> `migration-temp/packaged/`. Requires a reinstall + rebuild afterwards, and everything
> you want to keep must be committed.

```sh
git reset --hard && git clean -fdx
yarn install && yarn dist
```

---

## 6. Delete test GitHub Releases + tags (`migration-temp/delete-test-releases.mjs`)

> ⚠️ **Destructive + outward-facing.** Deletes GitHub Releases **and their git tags**
> on the remote. Requires `gh` authenticated with a token that can delete
> releases/tags (`gh auth login` or `GITHUB_TOKEN`) — hand to SRE if you don't have one.

**Why.** Testing the release flow (merging a release PR to `main`) creates **real git
tags and GitHub Releases** — note that the publish **dry-run does NOT stop this** (it
only gates `npm publish`; `changeset tag` + `github-releases.mjs` still run). Reverting
the commits afterwards leaves those Releases/tags behind, so this tool removes them.

**Safe by design.** It lists the candidate Releases (scoped to this repo's SDK package
tags — `<pkgname>@<version>`), makes you pick which to delete, prints the exact set, and
requires a typed `delete` confirmation before removing anything. `--cleanup-tag` removes
the git tag along with the Release.

**Usage.**

```sh
node migration-temp/delete-test-releases.mjs              # interactive: pick from a list
node migration-temp/delete-test-releases.mjs --dry-run    # list candidates, delete nothing
node migration-temp/delete-test-releases.mjs --tag "@midnightntwrk/platform-js@3.0.1"
node migration-temp/delete-test-releases.mjs --tag A --tag B   # multiple exact tags
node migration-temp/delete-test-releases.mjs --all        # every SDK-scoped release (asks first)
node migration-temp/delete-test-releases.mjs --all --yes  # non-interactive (automation/SRE)
```

**Good to know.**

- Our `github-releases.mjs` is **idempotent** — it *skips* a version whose Release
  already exists. So a leftover test Release **blocks** a real re-release of the same
  version; delete it here first, or the real release won't get a GitHub Release.
- To fully undo a test release: revert the commits (§2 revert-to-baseline) **and** run
  this tool to clear the Releases/tags.
