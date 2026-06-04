# Compact.js

## Introduction

Compact.js provides a Typescript-based execution environment for smart contracts
compiled with the [Compact](https://docs.midnight.network/develop/reference/compact/) language.
When a Compact smart contract is compiled with `compactc`, part of the output includes:

1. A JavaScript file.
2. A TypeScript [declaration file](https://www.typescriptlang.org/docs/handbook/2/type-declarations.html).

The JavaScript file contains:

- The execution logic for each circuit in the source contract,
- Logic for constructing the contract’s initial state,
- Utilities for converting on-chain contract state into a JavaScript representation.

Compact.js uses this file at run time to execute the circuits. The circuit execution results are
then used by higher level tools and frameworks (such as Midnight.js) in order to create and submit
transactions to the Midnight blockchain. At compile time, the types and utilities of Compact.js use
the TypeScript declaration file and the definitions it contains, to map types that make working with
the contract and its circuits more convenient, and TypeScript idiomatic.

> [!NOTE]  
> The term _runtime_ is often used to describe the JavaScript executable for a contract. This is
> distinct from the package `@midnight-ntwrk/compact-runtime`, which provides the utilities that each of
> these JavaScript executables use.

## Release Process

Releases are automated via GitHub Actions triggered by git tags. To release:

### Step 1: Determine the new version
Decide on the version:
- **Patch** (2.5.1): Bug fixes only
- **Minor** (2.6.0): New features, backwards compatible
- **Major** (3.0.0): Breaking changes

### Step 2: Update versions on main
Update the version in all four `package.json` files:
- Root: `/package.json`
- `compact-js/package.json`
- `compact-js-node/package.json`
- `compact-js-command/package.json`

```bash
git checkout main
git pull origin main
# Edit all package.json files with new version
git add -A
git commit -m "chore: bump to 2.5.1"
git push origin main
```

### Step 3: Create and push the release tag
```bash
git tag -a cjs-2.5.1 -m "Release 2.5.1"
git push origin cjs-2.5.1
```

That's it! The GitHub Action will automatically:
- Build all packages
- Run tests
- Publish to npm
- Create a GitHub release

### Notes
- **Tag format**: `cjs-X.Y.Z` (e.g., `cjs-2.5.1`)
- **All three packages release together** at the same version
- Releases happen directly from `main`—no release branches needed
