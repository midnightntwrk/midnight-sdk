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

Releases are cut from `main` via a manual versioning workflow. The CI/CD pipeline automatically creates git tags, publishes to npm, and generates GitHub releases.

### Step 1: Create a release branch

```bash
git checkout main
git pull origin main
git checkout -b chore/release-X.Y.Z
```

### Step 2: Bump the version

Use `yarn version` to update all workspace package.json files:

```bash
yarn version X.Y.Z-alpha.N     # For prerelease (e.g., 2.5.4-alpha.2)
yarn version X.Y.Z              # For stable release (e.g., 2.5.4)
```

This updates:
- Root: `package.json`
- `compact-js/package.json`
- `compact-js-node/package.json`
- `compact-js-command/package.json`

### Step 3: Update the CHANGELOG

Edit `CHANGELOG.md` and add a new section at the top with your version:

```markdown
## [X.Y.Z-alpha.N]

### Added
- Feature description

### Fixed
- Bug fix description

### Breaking Changes
- If any
```

### Step 4: Create and merge the PR

```bash
git add package.json */package.json CHANGELOG.md
git commit -m "chore: release version X.Y.Z"
git push origin chore/release-X.Y.Z
```

Open a PR to `main`, get it reviewed, and merge.

### Step 5: CI handles the rest

Once merged to `main`, the GitHub Actions workflow automatically:
- Builds all packages
- Runs tests
- Extracts release notes from `CHANGELOG.md`
- Creates a git tag: `compact-js-vX.Y.Z` (alpha suffix stripped)
- Publishes to npm with `--tag alpha` (for prerelease versions)
- Creates a GitHub release with changelog notes

### Version Format

- **Stable**: `X.Y.Z` (e.g., `2.5.4`) → tags as `compact-js-v2.5.4`
- **Prerelease**: `X.Y.Z-alpha.N` (e.g., `2.5.4-alpha.2`) → tags as `compact-js-v2.5.4`

### Notes

- **All three packages release together** at the same version
- Versioning is manual—not automatic from `version.json`
- CHANGELOG entries are required for the release to have proper notes
- Only merge to `main` when ready to release immediately
