# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Compact.js is a monorepo containing three packages for working with smart contracts compiled with the Compact language:

- **`compact-js`**: Core TypeScript-based execution environment that runs contracts compiled by `compactc`
- **`compact-js-node`**: Node.js-specific implementations of Compact.js service types (e.g., `ZKFileConfiguration` for file system ZK assets)
- **`compact-js-command`**: CLI utilities that provide an opinionated command line interface for executing compiled contracts

The project heavily uses the Effect library for dependency injection, error handling, and concurrency.

## Build & Development

### Environment
- **Node version**: >= 22
- **Package manager**: Yarn 4.10.3
- **Build orchestration**: Turbo (manages tasks and caching)

### Key Commands

**Build**:
```bash
yarn build              # Build all packages
yarn build:turbo        # Using turbo directly (shows cached state)
cd <package> && yarn build  # Build specific package
```

**Testing**:
```bash
yarn test               # Run all tests
cd <package> && yarn test   # Test specific package
yarn test -- --ui      # Run tests with UI dashboard
yarn test -- --coverage # Run with coverage report
```

**Linting & Formatting**:
```bash
yarn lint               # Run ESLint across monorepo
yarn lint --fix         # Fix lint issues automatically
```

**Clean**:
```bash
yarn clean              # Remove all build artifacts
yarn clean-build        # Clean and rebuild
```

**Packaging**:
```bash
yarn package            # Package all workspaces for distribution
```

### Project Structure

```
compact-js/
├── compact-js/          # Core execution environment
├── compact-js-node/     # Node.js platform implementations
├── compact-js-command/  # CLI utilities
├── eslint.config.mjs    # Shared ESLint config
├── vitest.config.ts     # Root test config (projects per package)
├── turbo.json           # Turbo task definitions
└── tsconfig.base.json   # Base TypeScript config
```

Each package has:
- `src/` - Source code (exports main and `/effect` subpaths)
- `src/**/*.test.ts` - Test files colocated with source
- `vitest.config.ts` - Package-specific test config
- `tsconfig.json` - Package-specific TypeScript config

## Testing

- **Framework**: Vitest (globals enabled)
- **Test location**: Alongside source as `*.test.ts`
- **Coverage reporting**: HTML, LCOV, JSON formats to `coverage/` directory
- **Test timeout**: 180 seconds
- **Environment**: Node.js
- **Running tests**:
  ```bash
  yarn test               # All tests
  yarn test -- path/to/file.test.ts  # Specific test file
  yarn test -- --ui       # Interactive UI
  ```

## Code Quality Standards

### ESLint Rules
- TypeScript-ESLint recommended + stylistic rules
- Simple import sort (imports grouped: external, parent, sibling, index)
- Unused imports detection and removal
- Import-x resolver with TypeScript support

### Formatting
- Prettier (via eslint-plugin-prettier)
- Config in `.prettierrc.json`

### Ignored Patterns
- Build output: `dist/`, `build/`, `*.d.ts`
- Generated code: `gen/`, `generated/`, `managed/`
- Dependencies: `node_modules/`, `.yarn/`
- Coverage: `coverage/`, `reports/`

## Architecture Notes

### Monorepo Structure (Turbo)
- `turbo.json` defines task dependencies and caching strategy
- Build tasks cache outputs in `dist/`, `build/`, `src/**/managed/`
- Test tasks depend on prior `^build` (packages must build before testing)
- Parallel execution within task boundaries

### Effect Library Usage
The codebase heavily leverages Effect for:
- Typed error handling (Result/Either-like patterns)
- Dependency injection (Context)
- Async operations (Effect monad)
- Resource management

Exports use both direct paths (`.`) and `/effect` subpaths for Effect-integrated APIs.

> [!IMPORTANT]
> **Use the `effect-ts` skill when writing, modifying, or reviewing any Effect code.**
> This repo is written in Effect and idiomatic usage matters. Before touching `.ts` files
> that import from `effect`, `@effect/*`, or the `/effect` subpaths, invoke the skill (`/effect-ts`,
> located at `.claude/skills/effect-ts/` in the repo root) and follow its guidance.
>
> In particular:
> - Prefer `Effect.gen` for sequencing and typed `Data.TaggedError` / `Schema.TaggedError` for
>   domain failures over `Effect.die` or plain `Error`.
> - Compose `Layer`s at the composition root; effects should declare requirements via `Context`,
>   not provide layers inside business logic.
> - Use bounded concurrency, `Ref` for shared state, and `Effect.acquireRelease`/scopes for resources.
> - **Consult `.claude/skills/effect-ts/references/anti-patterns.md` and avoid the listed
>   non-idiomatic patterns** — this is the reference to check when a change "works" but doesn't
>   look like the surrounding Effect code.
>
> When unsure which reference applies, start from `SKILL.md`'s "Reference Documents" index.

### Contract Configuration
Compact.js commands operate on contracts compiled by `compactc`. The workflow requires:
1. A `.compact` source file compiled to JavaScript runtime + TypeScript declarations + ZK assets
2. A TypeScript configuration file (`contract.config.ts`) that:
   - Imports the compiled contract executable
   - Defines private state types and initial values
   - Implements required Witnesses
   - Optionally provides default command configuration

### Key Concepts
- **Witnesses**: Contract implementations of required private functionality
- **ZK Assets**: Prover and verifier keys from compilation
- **Private State**: User-defined state separate from on-chain state
- **Runtime**: The JavaScript executable generated by `compactc` (distinct from `@midnight-ntwrk/compact-runtime`)

## Internal Dependencies

- Core Effect packages: `@effect/platform`, `@effect/platform-node`, `@effect/cli`
- Midnight libraries: `@midnight-ntwrk/compact-runtime`, `@midnight-ntwrk/ledger-v8`, `@midnight-ntwrk/platform-js`
- Dev: Vitest, TypeScript, ESLint, TypeScript-ESLint

## Notes for Contributors

- Test files are excluded from build caching (`!src/**/*.test.ts` in inputs)
- Generated files in `managed/` directories are checked in as build outputs
- Coverage excludes `src/test/**` helper files
- New packages must follow the same structure and export pattern
