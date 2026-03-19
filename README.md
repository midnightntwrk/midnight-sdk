# Midnight SDK

TypeScript monorepo that develops and publishes four npm libraries for building on [Midnight](https://midnight.network). These libraries provide the execution environment for Compact smart contracts and core platform abstractions that higher-level frameworks like [Midnight.js](https://github.com/midnightntwrk/midnight-js) build on.

## Developer Paths

### Smart Contract Developers

Write and test Compact smart contracts.

- [Compact language reference](https://docs.midnight.network/compact) — learn the language
- [compact-js](./compact-js/compact-js) (this repo) — TypeScript execution environment for compiled contracts
- [Midnight Toolkit](https://github.com/midnightntwrk/midnight-node/tree/main/util/toolkit) — CLI for deploying contracts, managing wallets, syncing with the network
- [testkit-js](https://github.com/midnightntwrk/midnight-js) — testing infrastructure and E2E test suite (in the midnight-js repo)
- [Examples](https://docs.midnight.network/category/examples) — counter, bboard, and other reference contracts

### DApp Developers

Build web and Node.js applications on Midnight.

- [Getting started](https://docs.midnight.network/getting-started) — first-time setup
- [midnight-js](https://github.com/midnightntwrk/midnight-js) — TypeScript framework providing low-level Midnight protocol primitives for Web and Node.js
- [create-mn-app](https://github.com/midnightntwrk/create-mn-app) — scaffold a new project
- [Tutorials](https://docs.midnight.network/category/tutorials) — end-to-end walkthroughs
- [DApp Connector API](https://github.com/midnightntwrk/midnight-dapp-connector-api) — interface between DApps and wallets

### Tool Builders

Build new tooling, providers, or frameworks on Midnight.

- [platform-js](./platform-js/platform-js) (this repo) — core abstractions and types that midnight-js and other frameworks build on
- [midnight-js](https://github.com/midnightntwrk/midnight-js) — reference implementation of a DApp framework; study its provider pattern to build alternatives
- [compact-js](./compact-js/compact-js) (this repo) — if building tooling that works with compiled Compact contracts
- [DApp Connector API](https://github.com/midnightntwrk/midnight-dapp-connector-api) — spec for wallet-DApp communication

### Wallet Builders

Build wallets or integrate Midnight into existing wallets.

- [midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) — wallet SDK
- [DApp Connector API](https://github.com/midnightntwrk/midnight-dapp-connector-api) — the interface between wallets and DApps
- [platform-js](./platform-js/platform-js) (this repo) — shared types and abstractions
- [Wallet SDK release notes](https://docs.midnight.network/relnotes/wallet) — latest changes and migration guides

## Libraries

This repo develops and publishes the following npm libraries under the `@midnight-ntwrk` scope:

| Library | npm | Description |
|---------|-----|-------------|
| [compact-js](./compact-js/compact-js) | [@midnight-ntwrk/compact-js](https://www.npmjs.com/package/@midnight-ntwrk/compact-js) | TypeScript execution environment for Compact smart contracts compiled with `compactc` |
| [compact-js-node](./compact-js/compact-js-node) | [@midnight-ntwrk/compact-js-node](https://www.npmjs.com/package/@midnight-ntwrk/compact-js-node) | Node.js platform layer — ZK file configuration, clustering, workflows, RPC |
| [compact-js-command](./compact-js/compact-js-command) | [@midnight-ntwrk/compact-js-command](https://www.npmjs.com/package/@midnight-ntwrk/compact-js-command) | CLI tooling for compiled Compact contracts (deploy, circuit management) |
| [platform-js](./platform-js/platform-js) | [@midnight-ntwrk/platform-js](https://www.npmjs.com/package/@midnight-ntwrk/platform-js) | Core abstractions, utilities, and types for building Midnight services and libraries |

The repo is organized into two workspaces — `compact-js/` and `platform-js/` — managed with Yarn 4 workspaces and Turborepo.

## Ecosystem

| Component | Repository | npm / Docker |
|-----------|------------|--------------|
| Compact compiler | [midnightntwrk/compact](https://github.com/midnightntwrk/compact) | GitHub releases |
| Compact runtime | — | [@midnight-ntwrk/compact-runtime](https://www.npmjs.com/package/@midnight-ntwrk/compact-runtime) |
| Midnight.js | [midnightntwrk/midnight-js](https://github.com/midnightntwrk/midnight-js) | @midnight-ntwrk/midnight-js-* |
| Wallet SDK | [midnightntwrk/midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) | @midnight-ntwrk/wallet-sdk-* |
| DApp Connector | [midnightntwrk/midnight-dapp-connector-api](https://github.com/midnightntwrk/midnight-dapp-connector-api) | @midnight-ntwrk/dapp-connector-api |
| Ledger | [midnightntwrk/midnight-ledger](https://github.com/midnightntwrk/midnight-ledger) | @midnight-ntwrk/ledger-v8 |
| Node | [midnightntwrk/midnight-node](https://github.com/midnightntwrk/midnight-node) | Docker: `midnightntwrk/midnight-node` |
| Proof Server | — | Docker: `midnightntwrk/proof-server` |
| Indexer | [midnightntwrk/midnight-indexer](https://github.com/midnightntwrk/midnight-indexer) | Docker: `midnightntwrk/indexer-api` |
| Local dev | [midnightntwrk/midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) | Docker Compose |
| Explorer | [midnightntwrk/midnight-explorer](https://github.com/midnightntwrk/midnight-explorer) | — |

**Compatibility** — see the [support matrix](https://docs.midnight.network/relnotes/support-matrix) for version compatibility across components.

**Networks** — use Undeployed (local) for development, Preprod for integration testing. See [nodes documentation](https://docs.midnight.network/nodes) for network details.

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
