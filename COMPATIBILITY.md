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

| Package | Released | RC | Release Notes |
|---|---|---|---|
| @midnight-ntwrk/compact-js | 2.4.3 | 2.5.0-rc.3 | — |
| @midnight-ntwrk/compact-runtime | 0.15.0 | — | — |
| @midnight-ntwrk/onchain-runtime-v2 | 2.0.1 | — | — |
| @midnight-ntwrk/ledger-v8 | 8.0.2 | — | — |
| @midnight-ntwrk/dapp-connector-api | 4.0.1 | — | [v4.0.1](https://github.com/midnightntwrk/midnight-dapp-connector-api/releases/tag/v4.0.1) |
| @midnight-ntwrk/wallet-sdk-address-format | 3.0.1 | 3.1.0-rc.0 | [notes](https://github.com/midnightntwrk/midnight-wallet/blob/main/RELEASE_NOTES.md) |

## Midnight.js

All packages at released **3.2.0**, RC **4.0.0-rc.2**:

Release notes: [v3.2.0](https://github.com/midnightntwrk/midnight-js/releases/tag/v3.2.0) | [v4.0.0-rc.2](https://github.com/midnightntwrk/midnight-js/releases/tag/v4.0.0-rc.2)

| Package |
|---|
| @midnight-ntwrk/midnight-js-contracts |
| @midnight-ntwrk/midnight-js-types |
| @midnight-ntwrk/midnight-js-node-provider |
| @midnight-ntwrk/midnight-js-indexer-provider |
| @midnight-ntwrk/midnight-js-proof-server-provider |
| @midnight-ntwrk/midnight-js-wallet-provider |
| @midnight-ntwrk/midnight-js-logger-util |
| @midnight-ntwrk/midnight-js-network-id |

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
