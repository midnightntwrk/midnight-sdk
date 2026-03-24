# Compatibility Matrix

What runs on each Midnight network (updated 2026-03-24).

> **ledger-v8 baseline.** Both testnets run ledger-v8. All versions listed target ledger-v8. ledger-v7 components have been removed from this matrix — upgrade your dApps to a ledger-v8 stack. Future ledger versions (v9, etc.) will be added as they are released.

*Italic* versions in the Mainnet column are proposed candidates, not yet deployed.

## Infrastructure (server-side)

Deployed per network. Developers connect to these services (or run them locally via Docker).

Proof Server can also be run locally by DApp developers for proof generation.

| Component | Preview | Preprod | Mainnet |
|---|---|---|---|
| Node | 0.22.2 | 0.22.2 | *0.22.2* |
| Ledger | ledger-v8 | ledger-v8 | *ledger-v8* |
| Proof Server | 8.0.3 | 8.0.3 | *8.0.3* |
| On-chain Runtime | 3.0.0 | 3.0.0 | *3.0.0* |
| Indexer | 4.0.0 | 4.0.0 | *4.0.0* |
| Faucet (tNIGHT) | 0.11.8 | 0.11.8 | — |
| Partner Chains | 1.8.1 | 1.8.1 | *1.8.1* |
| Block Explorer | 0.5.0 | 0.5.0 | *0.5.0* |

Release notes: [node-0.22.2](https://github.com/midnightntwrk/midnight-node/releases/tag/node-0.22.2) | [ledger-8.0.3](https://github.com/midnightntwrk/midnight-ledger/releases/tag/ledger-8.0.3) | [indexer v4.0.0](https://github.com/midnightntwrk/midnight-indexer/releases/tag/v4.0.0) | [partner-chains v1.8.1](https://github.com/input-output-hk/partner-chains/releases/tag/v1.8.1) | [faucet v0.11.8](https://github.com/midnightntwrk/midnight-faucet/releases/tag/v0.11.8)

### Docker Images

Browse all images at [hub.docker.com/u/midnightntwrk](https://hub.docker.com/u/midnightntwrk).

| Image | Tag | Docker Hub |
|---|---|---|
| `midnightntwrk/midnight-node` | 0.22.2 | [hub](https://hub.docker.com/r/midnightntwrk/midnight-node) |
| `midnightntwrk/proof-server` | 8.0.3 | [hub](https://hub.docker.com/r/midnightntwrk/proof-server) |
| `midnightntwrk/indexer-api` | 4.0.0 | [hub](https://hub.docker.com/r/midnightntwrk/indexer-api) |
| `midnightntwrk/chain-indexer` | 4.0.0 | [hub](https://hub.docker.com/r/midnightntwrk/chain-indexer) |
| `midnightntwrk/wallet-indexer` | 4.0.0 | [hub](https://hub.docker.com/r/midnightntwrk/wallet-indexer) |
| `midnightntwrk/indexer-standalone` | 4.0.0 | [hub](https://hub.docker.com/r/midnightntwrk/indexer-standalone) |
| `midnightntwrk/wallet-dapp` | 1.1.0 | [hub](https://hub.docker.com/r/midnightntwrk/wallet-dapp) |
| `midnightntwrk/midnight-node-toolkit` | 0.22.2 | [hub](https://hub.docker.com/r/midnightntwrk/midnight-node-toolkit) |

## Client-side (libraries and tools)

Installed by developers via npm or Docker. All packages target **ledger-v8**.

### Compatible version sets

All packages follow semver. For packages at 1.0.0 or above, use `^MAJOR.0.0` in your dependencies (e.g. `^4.0.0` for midnight-js) to receive compatible patches and minor updates automatically. Packages below 1.0.0 (e.g. `compact-runtime` 0.15.0) may introduce breaking changes in minor versions — pin these to exact versions.

The **Stable** column is what's deployed on all networks. The **Pre-release** column shows the newest RC/alpha ahead of stable, for local development and testing. A dash means no pre-release is available beyond the current stable.

| Component | Stable | Pre-release |
|---|---|---|
| Compact Compiler (`compactc`) | [0.30.0](https://github.com/midnightntwrk/compact/releases/tag/compactc-v0.30.0) | — |
| Compact Toolchain (`compact`) | [0.5.0](https://github.com/midnightntwrk/compact/releases/tag/compact-v0.5.0) | — |
| Compact Language | 0.22.0 | — |
| @midnight-ntwrk/compact-js | [2.5.0](https://www.npmjs.com/package/@midnight-ntwrk/compact-js/v/2.5.0) | — |
| @midnight-ntwrk/compact-runtime | [0.15.0](https://www.npmjs.com/package/@midnight-ntwrk/compact-runtime/v/0.15.0) | — |
| @midnight-ntwrk/midnight-js-* | [4.0.2](https://github.com/midnightntwrk/midnight-js/releases/tag/v4.0.2) | — |
| @midnight-ntwrk/wallet-sdk-facade | [3.0.0](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-facade/v/3.0.0) | — |
| @midnight-ntwrk/dapp-connector-api | [4.0.1](https://www.npmjs.com/package/@midnight-ntwrk/dapp-connector-api/v/4.0.1) | — |
| @midnight-ntwrk/ledger-v8 | [8.0.3](https://www.npmjs.com/package/@midnight-ntwrk/ledger-v8/v/8.0.3) | — |
| @midnight-ntwrk/platform-js | [2.2.4](https://www.npmjs.com/package/@midnight-ntwrk/platform-js/v/2.2.4) | — |
| Midnight Toolkit | [Docker](https://hub.docker.com/r/midnightntwrk/midnight-node-toolkit) 0.22.2 | — |

### All npm packages

#### Platform (this repo)

| Package | npm | Version |
|---|---|---|
| @midnight-ntwrk/compact-js | [npm](https://www.npmjs.com/package/@midnight-ntwrk/compact-js) | 2.5.0 |
| @midnight-ntwrk/platform-js | [npm](https://www.npmjs.com/package/@midnight-ntwrk/platform-js) | 2.2.4 |

#### Ledger and Runtime

| Package | npm | Version |
|---|---|---|
| @midnight-ntwrk/ledger-v8 | [npm](https://www.npmjs.com/package/@midnight-ntwrk/ledger-v8) | 8.0.3 |
| @midnight-ntwrk/onchain-runtime-v3 | [npm](https://www.npmjs.com/package/@midnight-ntwrk/onchain-runtime-v3) | 3.0.0 |
| @midnight-ntwrk/compact-runtime | [npm](https://www.npmjs.com/package/@midnight-ntwrk/compact-runtime) | 0.15.0 |

#### Midnight.js

Release notes: [v4.0.2](https://github.com/midnightntwrk/midnight-js/releases/tag/v4.0.2)

| Package | npm | Version |
|---|---|---|
| @midnight-ntwrk/midnight-js-contracts | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-contracts) | 4.0.2 |
| @midnight-ntwrk/midnight-js-types | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-types) | 4.0.2 |
| @midnight-ntwrk/midnight-js-compact | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-compact) | 4.0.2 |
| @midnight-ntwrk/midnight-js-utils | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-utils) | 4.0.2 |
| @midnight-ntwrk/midnight-js-network-id | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-network-id) | 4.0.2 |
| @midnight-ntwrk/midnight-js-indexer-public-data-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-indexer-public-data-provider) | 4.0.2 |
| @midnight-ntwrk/midnight-js-http-client-proof-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-http-client-proof-provider) | 4.0.2 |
| @midnight-ntwrk/midnight-js-node-zk-config-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-node-zk-config-provider) | 4.0.2 |
| @midnight-ntwrk/midnight-js-fetch-zk-config-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-fetch-zk-config-provider) | 4.0.2 |
| @midnight-ntwrk/midnight-js-level-private-state-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-level-private-state-provider) | 4.0.2 |
| @midnight-ntwrk/midnight-js-logger-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-logger-provider) | 4.0.2 |
| @midnight-ntwrk/testkit-js | [npm](https://www.npmjs.com/package/@midnight-ntwrk/testkit-js) | 4.0.2 |

#### Wallet SDK

`wallet-sdk-facade` is the main entry point. Most other packages are transitive dependencies installed automatically.

| Package | npm | Version |
|---|---|---|
| @midnight-ntwrk/wallet-sdk-facade | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-facade) | 3.0.0 |
| @midnight-ntwrk/wallet-sdk-abstractions | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-abstractions) | 2.0.0 |
| @midnight-ntwrk/wallet-sdk-address-format | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-address-format) | 3.1.0 |
| @midnight-ntwrk/wallet-sdk-capabilities | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-capabilities) | 3.2.0 |
| @midnight-ntwrk/wallet-sdk-dust-wallet | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-dust-wallet) | 3.0.0 |
| @midnight-ntwrk/wallet-sdk-hd | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-hd) | 3.0.1 |
| @midnight-ntwrk/wallet-sdk-indexer-client | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-indexer-client) | 1.2.0 |
| @midnight-ntwrk/wallet-sdk-node-client | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-node-client) | 1.1.0 |
| @midnight-ntwrk/wallet-sdk-prover-client | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-prover-client) | 1.2.0 |
| @midnight-ntwrk/wallet-sdk-runtime | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-runtime) | 1.0.2 |
| @midnight-ntwrk/wallet-sdk-shielded | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-shielded) | 2.1.0 |
| @midnight-ntwrk/wallet-sdk-unshielded-wallet | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-unshielded-wallet) | 2.1.0 |
| @midnight-ntwrk/wallet-sdk-utilities | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-utilities) | 1.1.0 |

#### DApp Connector

| Package | npm | Version |
|---|---|---|
| @midnight-ntwrk/dapp-connector-api | [npm](https://www.npmjs.com/package/@midnight-ntwrk/dapp-connector-api) | 4.0.1 |

## Public Endpoints

| Service | Preview | Preprod | Mainnet |
|---|---|---|---|
| Node RPC | [rpc.preview.midnight.network](https://rpc.preview.midnight.network) | [rpc.preprod.midnight.network](https://rpc.preprod.midnight.network) | TBD |
| Indexer GraphQL | [indexer.preview.midnight.network](https://indexer.preview.midnight.network/api/v3/graphql) | [indexer.preprod.midnight.network](https://indexer.preprod.midnight.network/api/v3/graphql) | TBD |
| Proof Server | [lace-proof-pub.preview.midnight.network](https://lace-proof-pub.preview.midnight.network) | [lace-proof-pub.preprod.midnight.network](https://lace-proof-pub.preprod.midnight.network) | TBD |
| Faucet | [faucet.preview.midnight.network](https://faucet.preview.midnight.network) | [faucet.preprod.midnight.network](https://faucet.preprod.midnight.network) | — |
| Block Explorer | [explorer.preview.midnight.network](https://explorer.preview.midnight.network) | [explorer.preprod.midnight.network](https://explorer.preprod.midnight.network) | TBD |
| cNgD DApp | [dust.preview.midnight.network](https://dust.preview.midnight.network) | [dust.preprod.midnight.network](https://dust.preprod.midnight.network) | TBD |

## Local Development Stack

The recommended local dev setup uses Docker Compose with midnight-node, proof-server, and indexer. See [midnight-wallet-dapp's compose.yml](https://github.com/midnightntwrk/midnight-wallet-dapp) for a reference configuration, or use [midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) for a ready-made stack.

## Links

**Live network status:**
- [Preview](https://status.shielded.tools/preview) — what's running now
- [Preprod](https://status.shielded.tools/preprod) — what's running now

**References:**
- [Official support matrix](https://docs.midnight.network/relnotes/support-matrix)
- [Network documentation](https://docs.midnight.network/nodes)
- [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) — compiler source and issues
- [npm packages](https://www.npmjs.com/search?q=%40midnight-ntwrk%2F)
- [Docker Hub images](https://hub.docker.com/search?q=midnightntwrk)
