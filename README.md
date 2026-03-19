# Midnight SDK

TypeScript monorepo that develops and publishes four npm libraries for building on [Midnight](https://midnight.network). These libraries provide the execution environment for Compact smart contracts and core platform abstractions that higher-level frameworks like [Midnight.js](https://github.com/midnightntwrk/midnight-js) build on.

## Compatibility

Current versions across Midnight networks (updated 2026-03-18):

| Component | Preview | Preprod | Mainnet |
|---|---|---|---|
| Midnight Node | 0.22.0 | 0.22.0 | — |
| Compact Compiler (`compactc`) | 0.30.0 | 0.30.0 | — |
| Compact Runtime | 0.15.0 | 0.15.0 | — |
| Proof Server | 8.0.2 | 8.0.2 | — |
| Indexer | 4.0.0 | 4.0.0 | — |
| @midnight-ntwrk/compact-js | 2.4.3 | 2.4.3 | — |
| @midnight-ntwrk/midnight-js-* | 3.2.0 | 3.2.0 | — |

Full version details including RC versions, Docker image tags, and npm packages in [COMPATIBILITY.md](./COMPATIBILITY.md).

## Developer Paths

### Smart Contract Developers

Write and test Compact smart contracts.

- [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) — Compact language and compiler (source of truth)
- [Compact language reference](https://docs.midnight.network/compact) — documentation
- [create-mn-app](https://github.com/midnightntwrk/create-mn-app) — scaffold a new project
- [example-counter](https://github.com/midnightntwrk/example-counter) / [example-bboard](https://github.com/midnightntwrk/example-bboard) — reference contracts (use as templates)
- [compact-js](./compact-js/compact-js) (this repo) — TypeScript execution environment for compiled contracts
- [Examples](https://docs.midnight.network/category/examples) — walkthroughs

### DApp Developers

Build web and Node.js applications on Midnight.

- [Getting started](https://docs.midnight.network/getting-started) — first-time setup
- [midnight-js](https://github.com/midnightntwrk/midnight-js) — DApp framework (contracts, types, providers)
- [create-mn-app](https://github.com/midnightntwrk/create-mn-app) — scaffold a new project
- [midnight-wallet-dapp](https://github.com/midnightntwrk/midnight-wallet-dapp) — reference DApp showing the provider pattern and wallet integration
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
| Compact compiler | [LFDT-Minokawa/compact](https://github.com/LFDT-Minokawa/compact) | GitHub releases |
| Compact runtime | — | [@midnight-ntwrk/compact-runtime](https://www.npmjs.com/package/@midnight-ntwrk/compact-runtime) |
| Midnight.js | [midnightntwrk/midnight-js](https://github.com/midnightntwrk/midnight-js) | @midnight-ntwrk/midnight-js-* |
| Wallet SDK | [midnightntwrk/midnight-wallet](https://github.com/midnightntwrk/midnight-wallet) | @midnight-ntwrk/wallet-sdk-* |
| Wallet DApp | [midnightntwrk/midnight-wallet-dapp](https://github.com/midnightntwrk/midnight-wallet-dapp) | Docker: `midnightntwrk/wallet-dapp` |
| DApp Connector | [midnightntwrk/midnight-dapp-connector-api](https://github.com/midnightntwrk/midnight-dapp-connector-api) | @midnight-ntwrk/dapp-connector-api |
| Node | [midnightntwrk/midnight-node](https://github.com/midnightntwrk/midnight-node) | Docker: `midnightntwrk/midnight-node` |
| Proof Server | — | Docker: `midnightntwrk/proof-server` |
| Indexer | [midnightntwrk/midnight-indexer](https://github.com/midnightntwrk/midnight-indexer) | Docker: `midnightntwrk/indexer-api` |
| Local dev | [midnightntwrk/midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) | Docker Compose |
| Explorer | [midnightntwrk/midnight-explorer](https://github.com/midnightntwrk/midnight-explorer) | — |

**Networks:**

- **Local** (`undeployed`) — Docker Compose stack for fastest iteration
- **Preview / Preprod** — public testnets, same component versions
- **Mainnet** — not yet launched

See [COMPATIBILITY.md](./COMPATIBILITY.md) for version details and the [support matrix](https://docs.midnight.network/relnotes/support-matrix) for official compatibility info.

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
