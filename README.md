# Midnight SDK

Developer hub for [Midnight](https://midnight.network). This repo provides a map of all Midnight repositories and the components they produce, a [compatibility matrix](./COMPATIBILITY.md) for testnets and mainnet, an [ecosystem overview](./ECOSYSTEM.md) of the full architecture, and the source code for four npm libraries (`compact-js`, `platform-js`) that provide the execution environment for Compact smart contracts.

**Networks:** Local (`undeployed`) for fastest iteration, Preview / Preprod for public testnets, Mainnet not yet launched. See [COMPATIBILITY.md](./COMPATIBILITY.md) for which versions are deployed on each network and which client libraries are compatible.

## Repositories and Components

### Infrastructure (server-side)

| Repository | Produces | Artifacts |
|---|---|---|
| [midnightntwrk/midnight-node](https://github.com/midnightntwrk/midnight-node) | Node | [Docker](https://hub.docker.com/r/midnightntwrk/midnight-node) |
| [midnightntwrk/midnight-ledger](https://github.com/midnightntwrk/midnight-ledger) | Ledger, Proof Server*, On-chain Runtime | [Docker](https://hub.docker.com/r/midnightntwrk/proof-server), [npm](https://www.npmjs.com/package/@midnight-ntwrk/onchain-runtime-v3) |
| [midnightntwrk/midnight-indexer](https://github.com/midnightntwrk/midnight-indexer) | Indexer API, Chain Indexer, Wallet Indexer | [Docker](https://hub.docker.com/r/midnightntwrk/indexer-api) |
| [input-output-hk/partner-chains](https://github.com/input-output-hk/partner-chains) | Partner Chains | GitHub releases |
| [midnightntwrk/midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) | Local dev stack | Docker Compose |
| midnightntwrk/midnight-faucet | Faucet (tMNT) | Docker |
| midnightntwrk/midnight-explorer | Block Explorer | Docker |

*Proof Server can be run as shared infrastructure or locally by DApp developers for proof generation.

### Client-side (libraries and tools)

| Repository | Produces | Artifacts |
|---|---|---|
| [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) | Compact compiler (`compactc`), Compact language, Compact runtime | [Releases](https://github.com/midnightntwrk/compact/releases), [npm](https://www.npmjs.com/package/@midnight-ntwrk/compact-runtime) |
| [midnightntwrk/midnight-sdk](https://github.com/midnightntwrk/midnight-sdk) (this repo) | compact-js, compact-js-node, compact-js-command, platform-js | [npm](https://www.npmjs.com/package/@midnight-ntwrk/compact-js) |
| [midnightntwrk/midnight-js](https://github.com/midnightntwrk/midnight-js) | 12 `@midnight-ntwrk/midnight-js-*` packages, [testkit-js](https://github.com/midnightntwrk/midnight-js) (contract testing and E2E) | [npm](https://www.npmjs.com/package/@midnight-ntwrk/midnight-js-contracts) |
| [midnightntwrk/midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) | Wallet SDK (`wallet-sdk-*` packages) | [npm](https://www.npmjs.com/package/@midnight-ntwrk/wallet-sdk-address-format) |
| [midnightntwrk/midnight-dapp-connector-api](https://github.com/midnightntwrk/midnight-dapp-connector-api) | DApp Connector API | [npm](https://www.npmjs.com/package/@midnight-ntwrk/dapp-connector-api) |
| [midnightntwrk/midnight-wallet-dapp](https://github.com/midnightntwrk/midnight-wallet-dapp) | Wallet DApp (reference app) | [Docker](https://hub.docker.com/r/midnightntwrk/wallet-dapp) |
| [midnightntwrk/midnight-node](https://github.com/midnightntwrk/midnight-node) | Midnight Toolkit — CLI for deploying and interacting with contracts | [Docker](https://hub.docker.com/r/midnightntwrk/midnight-node) |


## Developer Paths

### Smart Contract Developers

Write and test Compact smart contracts.

- [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) — Compact language and compiler (source of truth)
- [Compact language reference](https://docs.midnight.network/compact) — documentation
- [Midnight Toolkit](https://github.com/midnightntwrk/midnight-node) — CLI for deploying and interacting with contracts
- [create-mn-app](https://github.com/midnightntwrk/create-mn-app) — scaffold a new project
- [example-counter](https://github.com/midnightntwrk/example-counter) / [example-bboard](https://github.com/midnightntwrk/example-bboard) — reference contracts (use as templates)
- [testkit-js](https://github.com/midnightntwrk/midnight-js) — contract testing and E2E test suite (in the midnight-js repo)
- [Examples](https://docs.midnight.network/category/examples) — walkthroughs

### DApp Developers

Build web and Node.js applications on Midnight.

- [Getting started](https://docs.midnight.network/getting-started) — first-time setup
- [midnight-js](https://github.com/midnightntwrk/midnight-js) — DApp framework (contracts, types, providers)
- [create-mn-app](https://github.com/midnightntwrk/create-mn-app) — scaffold a new project
- [midnight-wallet-dapp](https://github.com/midnightntwrk/midnight-wallet-dapp) — reference DApp showing the provider pattern and wallet integration
- [midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) — wallet SDK, useful as an integration layer for Node.js DApps and with [testkit-js](https://github.com/midnightntwrk/midnight-js)
- [DApp Connector API](https://github.com/midnightntwrk/midnight-dapp-connector-api) — wallet-DApp interface
- [Tutorials](https://docs.midnight.network/category/tutorials) — end-to-end walkthroughs

DApps need a local infrastructure stack (proof-server + indexer + midnight-node) or connection to a public testnet. See [midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev).

### Tool Builders

Build new tooling, providers, or frameworks on Midnight.

- [platform-js](./platform-js/platform-js) (this repo) — core abstractions and types that midnight-js and other frameworks build on
- [midnight-js](https://github.com/midnightntwrk/midnight-js) — reference implementation of a DApp framework; study its provider pattern to build alternatives
- [midnight-wallet-dapp](https://github.com/midnightntwrk/midnight-wallet-dapp) — reference for the provider pattern in practice
- [compact-js](./compact-js/compact-js) (this repo) — if building tooling that works with compiled Compact contracts
- [DApp Connector API](https://github.com/midnightntwrk/midnight-dapp-connector-api) — spec for wallet-DApp communication

### Wallet Builders

Build wallets or integrate Midnight into existing wallets.

- [midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) — wallet SDK (also used by Node.js DApps as an integration layer)
- [DApp Connector API](https://github.com/midnightntwrk/midnight-dapp-connector-api) — the interface between wallets and DApps
- [platform-js](./platform-js/platform-js) (this repo) — shared types and abstractions
- [Wallet SDK release notes](https://docs.midnight.network/relnotes/wallet) — latest changes and migration guides

## Libraries (this repo)

| Library | npm | Description |
|---------|-----|-------------|
| [compact-js](./compact-js/compact-js) | [@midnight-ntwrk/compact-js](https://www.npmjs.com/package/@midnight-ntwrk/compact-js) | TypeScript execution environment for Compact smart contracts compiled with `compactc` |
| [compact-js-node](./compact-js/compact-js-node) | [@midnight-ntwrk/compact-js-node](https://www.npmjs.com/package/@midnight-ntwrk/compact-js-node) | Node.js platform layer — ZK file configuration, clustering, workflows, RPC |
| [compact-js-command](./compact-js/compact-js-command) | [@midnight-ntwrk/compact-js-command](https://www.npmjs.com/package/@midnight-ntwrk/compact-js-command) | CLI tooling for compiled Compact contracts (deploy, circuit management) |
| [platform-js](./platform-js/platform-js) | [@midnight-ntwrk/platform-js](https://www.npmjs.com/package/@midnight-ntwrk/platform-js) | Core abstractions, utilities, and types for building Midnight services and libraries |

The repo is organized into two workspaces — `compact-js/` and `platform-js/` — managed with Yarn 4 workspaces and Turborepo.

## Development

Prerequisites: Node.js >= 22, Yarn 4.

```bash
# compact-js workspace
cd compact-js
yarn install
yarn build
yarn test

# platform-js workspace
cd platform-js
yarn install
yarn build
yarn test
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution guide. This project uses [Conventional Commits](https://www.conventionalcommits.org/) with scopes `compact-js` and `platform-js`.

## License

[Apache-2.0](./LICENSE)
