# Compatibility Matrix

Version compatibility across Midnight components (updated 2026-03-19).

Preview and Preprod run the same versions. Mainnet is not yet launched.

## Components

| Component | Version | RC | Release Notes |
|---|---|---|---|
| Ledger | 8.0.2 | — | [ledger-8.0.2](https://github.com/midnightntwrk/midnight-ledger/releases/tag/ledger-8.0.2) |
| Node | 0.22.0 | — | [node-0.22.0](https://github.com/midnightntwrk/midnight-node/releases/tag/node-0.22.0) |
| Proof Server | 8.0.2 | — | — |
| On-chain Runtime | 2.0.1 | — | — |
| Compact Compiler (`compactc`) | 0.30.0 | — | [compactc-v0.30.0](https://github.com/midnightntwrk/compact/releases/tag/compactc-v0.30.0) |
| Compact Language | 0.22.0 | — | — |
| Compact Runtime | 0.15.0 | — | — |
| Indexer | 4.0.0 | — | [v4.0.0](https://github.com/midnightntwrk/midnight-indexer/releases/tag/v4.0.0) |
| Partner Chains | 1.8.1 | — | [v1.8.1](https://github.com/input-output-hk/partner-chains/releases/tag/v1.8.1) |
| Faucet (tMNT) | 0.11.8 | — | [v0.11.8](https://github.com/midnightntwrk/midnight-faucet/releases/tag/v0.11.8) |
| Block Explorer | 0.2.0 | — | — |

## Libraries (npm)

| Package | npm | Released | RC |
|---|---|---|---|
| @midnight-ntwrk/compact-js | [npm](https://www.npmjs.com/package/@midnight-ntwrk/compact-js) | 2.4.3 | 2.5.0-rc.3 |
| @midnight-ntwrk/compact-runtime | [npm](https://www.npmjs.com/package/@midnight-ntwrk/compact-runtime) | 0.15.0 | 0.15.0-rc.1 |
| @midnight-ntwrk/onchain-runtime-v2 | [npm](https://www.npmjs.com/package/@midnight-ntwrk/onchain-runtime-v2) | 2.0.1 | — |
| @midnight-ntwrk/ledger-v8 | [npm](https://www.npmjs.com/package/@midnight-ntwrk/ledger-v8) | 8.0.2 | 8.0.3-rc.1 |
| @midnight-ntwrk/dapp-connector-api | [npm](https://www.npmjs.com/package/@midnight-ntwrk/dapp-connector-api) | 4.0.1 | — |
| @midnight-ntwrk/wallet-sdk-address-format | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-address-format) | 3.0.1 | 3.1.0-rc.0 |

## Midnight.js

Release notes: [v3.2.0](https://github.com/midnightntwrk/midnight-js/releases/tag/v3.2.0) | [v4.0.0-rc.2](https://github.com/midnightntwrk/midnight-js/releases/tag/v4.0.0-rc.2)

All packages at released **3.2.0**, RC **4.0.0-rc.2** unless noted:

| Package | npm | Released | RC |
|---|---|---|---|
| @midnight-ntwrk/midnight-js-contracts | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-contracts) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-types | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-types) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-compact | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-compact) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-utils | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-utils) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-network-id | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-network-id) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-indexer-public-data-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-indexer-public-data-provider) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-http-client-proof-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-http-client-proof-provider) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-node-zk-config-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-node-zk-config-provider) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-fetch-zk-config-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-fetch-zk-config-provider) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-level-private-state-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-level-private-state-provider) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-logger-provider | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-logger-provider) | 3.2.0 | 4.0.0-rc.2 |
| @midnight-ntwrk/midnight-js-testing | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-testing) | 2.0.2 | — |

## Docker Images

| Image | Tag |
|---|---|
| `midnightntwrk/midnight-node` | 0.22.0 |
| `midnightntwrk/midnight-toolkit` | 0.22.0 |
| `midnightntwrk/proof-server` | 8.0.2 |
| `midnightntwrk/proof-server-no-hw` | 8.0.2 |
| `midnightntwrk/indexer-api` | 4.0.0 |
| `midnightntwrk/indexer-halo2-verifier-server` | 4.0.0 |
| `midnightntwrk/wallet-dapp` | 1.1.0 |

## Local Development Stack

The recommended local dev setup uses Docker Compose with midnight-node, proof-server, and indexer. See [midnight-wallet-dapp's compose.yml](https://github.com/midnightntwrk/midnight-wallet-dapp) for a reference configuration, or use [midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) for a ready-made stack.

## Links

- [Official support matrix](https://docs.midnight.network/relnotes/support-matrix)
- [Network documentation](https://docs.midnight.network/nodes)
- [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) — compiler source and issues
