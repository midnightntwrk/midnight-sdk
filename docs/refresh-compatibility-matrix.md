# Runbook: Refresh Compatibility Matrix

Refresh `COMPATIBILITY.md`, `README.md`, and `ECOSYSTEM.md` with current deployed and published versions.

## Naming conventions

Always use `ledger-v8` (hyphenated, lowercase). Never "Ledger v8" or "ledger v8".

## Ledger version policy

**ledger-v8 is the baseline.** All three networks run ledger-v8. All client-side versions target ledger-v8. Future ledger versions (v9, etc.) will be added as columns when released.

The on-chain runtime major version tracks the ledger major: `onchain-runtime-v3` is for ledger-v8. If ledger bumps to v9, check for `onchain-runtime-v4`.

## Step 0: Get deployed versions from the user

Before starting, ask the user to check the live status pages and provide the deployed versions:

- **Preview:** https://status.shielded.tools/preview
- **Preprod:** https://status.shielded.tools/preprod
- **Mainnet:** no status page yet — ask the user directly for deployed versions

These pages show live versions of midnight-node, indexer, and faucet per network. The underlying data loads from Datadog via authenticated JS and cannot be scraped — the user must check visually.

Ask for:
- Node version on Preview, Preprod, and Mainnet
- Indexer version on Preview, Preprod, and Mainnet
- Faucet version on Preview and Preprod (no faucet on Mainnet)
- Any changes to public endpoint URLs

These determine which ledger version the networks are running. The node release notes state which ledger it pins. This is the compatibility anchor — everything else flows from it.

### Public endpoints

The public endpoints table in COMPATIBILITY.md lists service URLs per network. The URL pattern is `{service}.{network}.midnight.network`. Verify these haven't changed.

Current pattern:
- Node RPC: `https://rpc.{network}.midnight.network`
- Indexer: `https://indexer.{network}.midnight.network/api/v3/graphql`
- Proof Server: `https://lace-proof-pub.{network}.midnight.network`
- Faucet: `https://faucet.{network}.midnight.network` (testnets only)
- Block Explorer: `https://explorer.{network}.midnight.network`
- cNgD DApp: `https://dust.{network}.midnight.network`

## Step 1: Validate infrastructure versions from GitHub releases

```bash
gh api repos/midnightntwrk/midnight-node/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/midnightntwrk/midnight-ledger/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/midnightntwrk/compact/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/midnightntwrk/midnight-indexer/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/input-output-hk/partner-chains/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/midnightntwrk/midnight-faucet/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/midnightntwrk/midnight-dapp-connector-api/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
gh api repos/midnightntwrk/midnight-js/releases \
  --jq '[.[:5] | .[] | {tag: .tag_name, prerelease: .prerelease, date: .published_at}]'
```

The compact repo produces releases under two tag prefixes: `compactc-v*` (compiler) and `compact-v*` (toolchain). Check both.

Compare against deployed versions from Step 0. If the latest GitHub release differs from what's deployed, note it. Node RC builds can be deployed to testnets — the status pages are the source of truth for what's running, not GitHub prerelease flags.

## Step 2: Validate npm library versions

### Core packages (dist-tags show stable + pre-release)

The compatible version sets table has a **Pre-release** column. Only populate it when a pre-release version is *newer* than the current stable (e.g. stable is 2.5.0, pre-release is 2.6.0-rc.1). If the only pre-release is an RC of the already-released stable version (e.g. stable 8.0.3, RC 8.0.3-rc.1), show a dash — it's not useful to developers.

```bash
for pkg in \
  @midnight-ntwrk/compact-js \
  @midnight-ntwrk/compact-runtime \
  @midnight-ntwrk/onchain-runtime-v3 \
  @midnight-ntwrk/ledger-v8 \
  @midnight-ntwrk/dapp-connector-api \
  @midnight-ntwrk/midnight-js \
  @midnight-ntwrk/midnight-js-contracts \
  @midnight-ntwrk/testkit-js \
  @midnight-ntwrk/platform-js; do
  echo "=== $pkg ===" && npm view "$pkg" dist-tags --json
done
```

### All midnight-js packages (verify they share the same version)

```bash
for pkg in \
  @midnight-ntwrk/midnight-js \
  @midnight-ntwrk/midnight-js-contracts \
  @midnight-ntwrk/midnight-js-types \
  @midnight-ntwrk/midnight-js-compact \
  @midnight-ntwrk/midnight-js-utils \
  @midnight-ntwrk/midnight-js-network-id \
  @midnight-ntwrk/midnight-js-indexer-public-data-provider \
  @midnight-ntwrk/midnight-js-http-client-proof-provider \
  @midnight-ntwrk/midnight-js-node-zk-config-provider \
  @midnight-ntwrk/midnight-js-fetch-zk-config-provider \
  @midnight-ntwrk/midnight-js-level-private-state-provider \
  @midnight-ntwrk/midnight-js-dapp-connector-proof-provider \
  @midnight-ntwrk/midnight-js-logger-provider \
  @midnight-ntwrk/testkit-js; do
  echo "$pkg: $(npm view "$pkg" version)"
done
```

`@midnight-ntwrk/midnight-js` is the barrel package — re-exports core modules (contracts, types, network-id, utils). Provider packages (`midnight-js-*-provider`) are separate installs.

`testkit-js` shares versions with the other midnight-js packages. `midnight-js-testing` is deprecated — use `testkit-js` instead.

**DO NOT use these names** (they don't exist on npm):
- ~~midnight-js-node-provider~~
- ~~midnight-js-indexer-provider~~
- ~~midnight-js-proof-server-provider~~
- ~~midnight-js-wallet-provider~~
- ~~midnight-js-logger-util~~

### All wallet-sdk packages

```bash
for pkg in \
  @midnight-ntwrk/wallet-sdk-facade \
  @midnight-ntwrk/wallet-sdk-abstractions \
  @midnight-ntwrk/wallet-sdk-address-format \
  @midnight-ntwrk/wallet-sdk-capabilities \
  @midnight-ntwrk/wallet-sdk-dust-wallet \
  @midnight-ntwrk/wallet-sdk-hd \
  @midnight-ntwrk/wallet-sdk-indexer-client \
  @midnight-ntwrk/wallet-sdk-node-client \
  @midnight-ntwrk/wallet-sdk-prover-client \
  @midnight-ntwrk/wallet-sdk-runtime \
  @midnight-ntwrk/wallet-sdk-shielded \
  @midnight-ntwrk/wallet-sdk-unshielded-wallet \
  @midnight-ntwrk/wallet-sdk-utilities; do
  echo "=== $pkg ===" && npm view "$pkg" dist-tags --json
done
```

### Verify ledger dependency chain

```bash
npm view @midnight-ntwrk/compact-js dependencies --json | \
  jq 'to_entries[] | select(.key | test("ledger|runtime|platform"))'
npm view @midnight-ntwrk/wallet-sdk-facade dependencies --json | \
  jq 'to_entries[] | select(.key | test("ledger|wallet-sdk"))'
npm view @midnight-ntwrk/midnight-js-contracts dependencies --json | \
  jq 'to_entries[] | select(.key | test("ledger|compact|platform"))'
```

Expected dependency chain (ledger-v8):
```
midnight-js-contracts → compact-js → ledger-v8
compact-runtime → onchain-runtime-v3 (ledger-v8)
wallet-sdk-facade → ledger-v8
```

Client-side packages must all target the same ledger major version. Cannot mix packages targeting different ledger versions in one project.

## Step 3: Validate Docker images

Public Docker Hub images:
- `midnightntwrk/midnight-node` — [hub](https://hub.docker.com/r/midnightntwrk/midnight-node)
- `midnightntwrk/proof-server` — [hub](https://hub.docker.com/r/midnightntwrk/proof-server)
- `midnightntwrk/indexer-api` — [hub](https://hub.docker.com/r/midnightntwrk/indexer-api)
- `midnightntwrk/chain-indexer` — [hub](https://hub.docker.com/r/midnightntwrk/chain-indexer)
- `midnightntwrk/wallet-indexer` — [hub](https://hub.docker.com/r/midnightntwrk/wallet-indexer)
- `midnightntwrk/indexer-standalone` — [hub](https://hub.docker.com/r/midnightntwrk/indexer-standalone)
- `midnightntwrk/wallet-dapp` — [hub](https://hub.docker.com/r/midnightntwrk/wallet-dapp)
- `midnightntwrk/midnight-node-toolkit` — [hub](https://hub.docker.com/r/midnightntwrk/midnight-node-toolkit)

Browse all images at [hub.docker.com/u/midnightntwrk](https://hub.docker.com/u/midnightntwrk) — additional images may exist beyond this list.

## Step 4: Update files

Update `COMPATIBILITY.md` with validated versions:
- Infrastructure table: deployed versions per network
- Public endpoints table: verify URLs per network
- Compatible version sets: **Stable** and **Pre-release** columns (only show pre-releases newer than stable)
- All npm package tables: current `latest` dist-tag versions
- Docker images table: current tags

Update `README.md` only if:
- A new repository or component appeared
- Network status changed (e.g. new network added, network decommissioned)

Update `ECOSYSTEM.md` only if:
- A new component, layer, or repository appeared
- Developer Personas changed

After the midnight-sdk PR is raised, raise a corresponding PR in the **midnight-docs** repo ([midnightntwrk/midnight-docs](https://github.com/midnightntwrk/midnight-docs)) to reflect the same changes. The following files must stay in sync with `COMPATIBILITY.md` in this repo:

- `docs/relnotes/support-matrix.mdx` — the public compatibility matrix at [docs.midnight.network/relnotes/support-matrix](https://docs.midnight.network/relnotes/support-matrix)
- `docs/relnotes/overview.mdx` — "Latest Stable Release" page with public endpoints and version table
- `docs/troubleshoot/fix-version-mismatch-errors.mdx` — references ledger version and package names (ensure these match current versions)

The two PRs must be cross-linked:
- The midnight-sdk PR description must link to the midnight-docs PR
- The midnight-docs PR description must link to the midnight-sdk PR
- Both PRs should be merged together to avoid drift

The midnight-docs PR must also:
- State that it syncs against `COMPATIBILITY.md` in `midnightntwrk/midnight-sdk`
- Include a note that it **must not be merged without approval from Midnight Foundation leadership**, as these are public-facing pages

## Step 5: Verify

1. `ledger-v8` naming throughout — never "Ledger v8" or "ledger v8"
2. npm links resolve: `https://www.npmjs.com/package/@midnight-ntwrk/<name>`
3. Docker Hub links resolve: `https://hub.docker.com/r/midnightntwrk/<name>`
4. GitHub release links resolve (spot-check):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     https://github.com/midnightntwrk/midnight-node/releases/tag/node-0.22.2
   ```
5. Faucet, explorer, and cNgD app repo links may still be private — links are intentional
6. No stale versions remain from the previous refresh

## Gotchas

- **Deployed versions != latest releases.** Always ask the user for status page data. The status pages are the source of truth for what's running.
- **Node RC builds can be deployed to testnets.** A GitHub prerelease flag doesn't mean it's not in production.
- **The compact repo produces two tools with independent versions:** `compactc` (compiler, e.g. 0.30.0) and `compact` (toolchain, e.g. 0.5.0). GitHub release tags are `compactc-v*` and `compact-v*` respectively.
- **Compact Language version (e.g. 0.22.0) != Compact toolchain version (e.g. 0.5.0).** Get the language version from compactc release notes.
- npm `homepage` fields point to `midnight-ntwrk/artifacts` — private build repo, never link to it.
- **Toolkit is client-side**, not infrastructure. It lives in the midnight-node repo but is a developer CLI tool.
- **midnight-wallet is dual-purpose**: wallet SDK for wallet builders AND integration layer for Node.js DApps.
- **wallet-sdk-facade is the main entry point.** Most other wallet-sdk packages are transitive deps.
- **Proof Server is dual-role**: shared infrastructure or run locally by DApp developers.
- **`@midnight-ntwrk/midnight-js` is a barrel package.** It re-exports core modules (contracts, types, network-id, utils) only. Provider packages (`midnight-js-*-provider`) are NOT included and must be installed separately.
- **midnight-js-testing is deprecated** — replaced by `@midnight-ntwrk/testkit-js` which shares versions with other midnight-js packages.
- **Node versions can differ per network.** When a patch is deployed to one network but not others (e.g. Preview 0.22.3, Preprod 0.22.2), show the per-network versions in the infrastructure table columns and list all deployed node release notes. Update midnight-docs tables to match — split into separate per-network tables when versions differ.
- Always verify package names exist on npm. `npm view <pkg> version` — 404 means wrong name.

## Sources of truth

| Artifact type | Source |
|---|---|
| Deployed infrastructure | Status pages (ask user) |
| Infrastructure releases | GitHub release tags |
| npm package versions | `npm view <pkg> dist-tags --json` |
| Docker image tags | Docker Hub |
| Ledger version pinned by node | Node release notes |
| Compact Language version | compactc release notes |
