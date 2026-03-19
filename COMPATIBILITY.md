# Compatibility Matrix

Version compatibility across Midnight components. Source: [Published Libraries and Images](https://docs.midnight.network/relnotes/support-matrix) (updated 2026-03-18).

## Infrastructure

| Component | Preview | Preprod | Mainnet |
|---|---|---|---|
| Midnight Node | 0.22.0 | 0.22.0 | — |
| Compact Compiler (`compactc`) | 0.30.0 | 0.30.0 | — |
| Compact Language | 0.5.0 | 0.5.0 | — |
| Compact Runtime | 0.15.0 | 0.15.0 | — |
| Proof Server | 8.0.2 | 8.0.2 | — |
| Indexer | 4.0.0 | 4.0.0 | — |
| Ledger | 8.0.2 | 8.0.2 | — |

## Libraries (npm)

| Package | Released | RC |
|---|---|---|
| @midnight-ntwrk/compact-js | 2.4.3 | 2.5.0-rc.1 |
| @midnight-ntwrk/compact-runtime | 0.15.0 | — |
| @midnight-ntwrk/ledger-v8 | 8.0.2 | — |
| @midnight-ntwrk/dapp-connector-api | 4.0.1 | — |
| @midnight-ntwrk/wallet-sdk-address-format | 3.0.1 | 3.1.0-rc.0 |

## Midnight.js

All packages at released **3.2.0**, RC **4.0.0-rc.1**:

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
- [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) — compiler releases
