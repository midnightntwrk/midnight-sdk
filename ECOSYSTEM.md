# Midnight Ecosystem

![Midnight Ecosystem Architecture](./midnight-ecosystem.png)

## Architecture Layers

The Midnight network is built in layers. Inner layers are harder to change and have the widest blast radius. Outer layers depend on inner ones.

### Cryptography

| Component | Repository | Description |
|---|---|---|
| midnight-zk | midnightntwrk/midnight-zk | ZK cryptography primitives |
| zkir | midnightntwrk/midnight-zk | ZK intermediate representation — circuit format consumed by the proof server |

### Ledger

Everything depends on the ledger. The ledger version is the compatibility anchor for the entire ecosystem.

| Component | Repository | Description |
|---|---|---|
| Ledger | [midnightntwrk/midnight-ledger](https://github.com/midnightntwrk/midnight-ledger) | Transaction validation, state management, WASM bindings |
| Proof Server | [midnightntwrk/midnight-ledger](https://github.com/midnightntwrk/midnight-ledger) | ZK proof generation and verification. Dual-role: shared infrastructure or run locally by DApp developers |

### Core

| Component | Repository | Description |
|---|---|---|
| Node | [midnightntwrk/midnight-node](https://github.com/midnightntwrk/midnight-node) | Substrate-based blockchain node. Pins a specific ledger version. |
| Indexer | [midnightntwrk/midnight-indexer](https://github.com/midnightntwrk/midnight-indexer) | Indexes on-chain data for querying (GraphQL API) |
| Partner Chains | [input-output-hk/partner-chains](https://github.com/input-output-hk/partner-chains) | Cardano ↔ Midnight bridge infrastructure |

### Language

| Component | Repository | Description |
|---|---|---|
| Compact Toolchain (`compact`) | [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) | Toolchain manager — installs compiler versions, compiles contracts (`compact compile`), checks for updates |
| Compact Compiler (`compactc`) | [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) | Smart contract compiler, installed and managed by the `compact` toolchain |
| Contract (compiled) | — | Output of `compactc`: JS executable (circuits) + TypeScript declarations |

### Platform

Lower-level npm packages that provide the foundation for frameworks. compact-js is used by midnight-js and Toolkit to interact with compiled contracts.

| Component | Repository | Description |
|---|---|---|
| ledger-v8 | [midnightntwrk/midnight-ledger](https://github.com/midnightntwrk/midnight-ledger) | TypeScript bindings for the ledger. npm: `@midnight-ntwrk/ledger-v8` |
| onchain-runtime-v3 | [midnightntwrk/midnight-ledger](https://github.com/midnightntwrk/midnight-ledger) | WASM on-chain runtime as an npm package. npm: `@midnight-ntwrk/onchain-runtime-v3` |
| compact-runtime | [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) | Runtime support for compiled Compact contracts. npm: `@midnight-ntwrk/compact-runtime` |
| platform-js | [midnightntwrk/midnight-sdk](https://github.com/midnightntwrk/midnight-sdk) (this repo) | Core abstractions and types used by compact-js, wallet-sdk, and midnight-js |
| compact-js | [midnightntwrk/midnight-sdk](https://github.com/midnightntwrk/midnight-sdk) (this repo) | TypeScript execution environment for compiled Compact contracts. Used by midnight-js and Toolkit |

### Frameworks

Developer-facing libraries and tools built on the platform layer.

| Component | Repository | Description |
|---|---|---|
| midnight-js | [midnightntwrk/midnight-js](https://github.com/midnightntwrk/midnight-js) | DApp framework: contracts, types, providers |
| testkit-js | [midnightntwrk/midnight-js](https://github.com/midnightntwrk/midnight-js) | E2E testing framework using midnight-js, dapp-connector-api, and wallet-sdk |
| wallet-sdk | [midnightntwrk/midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) | Wallet operations. Also used by Node.js DApps as an integration layer |
| dapp-connector-api | [midnightntwrk/midnight-dapp-connector-api](https://github.com/midnightntwrk/midnight-dapp-connector-api) | Interface between DApps and wallets |
| Midnight Toolkit | [midnightntwrk/midnight-node](https://github.com/midnightntwrk/midnight-node) | CLI for deploying and interacting with contracts |

### Tooling

| Component | Repository | Description |
|---|---|---|
| create-mn-app | [midnightntwrk/create-mn-app](https://github.com/midnightntwrk/create-mn-app) | Scaffold a new Midnight project |
| Local Dev Stack | [midnightntwrk/midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) | Docker Compose stack for local development |
| Faucet (tNIGHT) | [midnightntwrk/midnight-faucet](https://github.com/midnightntwrk/midnight-faucet) | Test token distribution for testnets |
| Block Explorer | [midnightntwrk/midnight-explorer](https://github.com/midnightntwrk/midnight-explorer) | On-chain data browser |
| Wallet DApp | [midnightntwrk/midnight-wallet-dapp](https://github.com/midnightntwrk/midnight-wallet-dapp) | Reference DApp showing provider pattern and wallet integration |

### External Tooling

| Component | Description |
|---|---|
| Lace Wallet | Third-party browser wallet with Midnight support |
| Lumen | Developer wallet plugin/CLI (in development) |

### Cardano

| Component | Repository | Description |
|---|---|---|
| cNgD App | [midnightntwrk/midnight-cnight-to-dust-dapp](https://github.com/midnightntwrk/midnight-cnight-to-dust-dapp) | cNIGHT-generates-Dust registration application. Runs on Cardano networks. |
| Cardano Contracts | — | On-chain contracts supporting the Midnight ↔ Cardano bridge: Reserve, Governance, Multi-sig, Contract, Bridge, Upgradeability, Dust |

## Developer Personas

| Persona | Components |
|---|---|
| Smart Contract Developers | Compact + Toolkit + testkit-js + examples. Optionally: Proof Server + Indexer + Node + Faucet |
| DApp Developers | midnight-js + create-mn-app + wallet-dapp + wallet-sdk + Compact + Proof Server + Indexer + Node + Faucet |
| Tool/System Builders | platform-js + compact-js + midnight-js (reference) + wallet-dapp (reference) + dapp-connector-api |
| Wallet Builders | wallet-sdk (facade) + dapp-connector-api + platform-js |

## Dependency Flow

The numbered sequence in the diagram shows the development dependency order:

1. midnight-zk → 2. zkir → 3. ledger-v8 → 4. Proof Server, onchain-runtime-v3, platform-js → 5. Compact, Node → 6. compact-runtime → 7. Contract (compiled) → 8. compact-js → 9. midnight-js, Midnight Toolkit → 10. Indexer → 11. wallet-sdk, Block Explorer → 12. dapp-connector-api, testkit-js, tNIGHT Faucet → 13. Wallet DApp, Lace Wallet

## Runs On

| Environment | Components |
|---|---|
| Server / Infrastructure | Node, Indexer, Faucet, Block Explorer |
| Client / Developer | Compact, compact-js, midnight-js, wallet-sdk, Toolkit, Lumen |
| Both (server or local) | Proof Server, Wallet DApp |
