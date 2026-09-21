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
- `test/` - Test files (`*.test.ts`) and shared test helpers
- `vitest.config.ts` - Package-specific test config
- `tsconfig.json` - Package-specific TypeScript config

## Testing

- **Framework**: Vitest (globals enabled)
- **Test location**: Each package's `test/` directory as `*.test.ts` (e.g. `test/effect/`)
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
- Midnight libraries: `@midnight-ntwrk/compact-runtime`, `@midnightntwrk/ledger-v9` (reached only through the `Ledger` facade), `@midnight-ntwrk/platform-js`
- Dev: Vitest, TypeScript, ESLint, TypeScript-ESLint

## Era Seams (Ledger + Compact Runtime)

An era is a ledger generation *and* the compact-runtime line paired with it — they bump together
(ledger 9 ↔ runtime 0.19 ↔ onchain-runtime-v4). Each half has its own seam, and a swap always
touches both:

- **Ledger**: all ledger API is reached through the `Ledger` facade
  (`compact-js/src/effect/Ledger.ts`); only the era bindings under
  `compact-js/src/effect/internal/ledger/` may import a `@midnightntwrk/ledger-v<N>` package
  directly.
- **Runtime**: all compact-runtime API is reached through the `CompactRuntime` facade
  (`compact-js/src/effect/CompactRuntime.ts`); only the bindings under
  `compact-js/src/effect/internal/runtime/` may import `@midnight-ntwrk/compact-runtime`
  directly.

ESLint (`no-restricted-imports`) enforces both restrictions; tests are exempt. The shared era
model (`LedgerMajor`, `RuntimeLine`, the `Era` descriptor) lives above both seams in
`compact-js/src/effect/internal/era.ts`. Ledger calls that cross the WASM boundary go through
`Ledger.tryConvert` (the CLI knows it as `tryLedger`, from `makeIntents(ledger)` in
`internal/command.ts`) so a rejection surfaces as a typed `ContractRuntimeError` rather than a
defect.

**An era is an argument, not a module path.** The things that do era work — the state conversions
(`internal/ledger/conversions.ts`), contract execution (`internal/executable.ts`), the boundary
wrapper (`internal/boundary.ts`), and the CLI's four command handlers
(`compact-js-command/src/effect/internal/*Command.ts`) — take their bindings as parameters and live
above both seams. The facades are applications of those factories: `effect/Ledger.ts`,
`effect/CompactRuntime.ts` and `effect/ContractExecutable.ts` apply them to whatever `current.ts`
binds, and `internal/era/v<N>{Ledger,Runtime,Executable}.ts` apply them to a pinned pair, which is
what `/v8/effect` and `/v9/effect` export. So an era entry *selects* an era rather than labelling
the bound one, and both can be live in one process. Types follow the same rule: every era-varying
type in the public API is derived from the binding arguments rather than declared per era.

The CLI is the same pattern one package out. `compact-js-command/src/effect/internal/era/` holds the
contract the handlers are written against (`binding.ts` — `CommandLedger`, `CommandRuntime`,
`CommandExecutable`, `EraCapabilities`), one application per era (`v8.ts`, `v9.ts`, built from the
era-*pinned* library entries), the set of selectable eras (`eras.ts`, a leaf so `options.ts` can read
it without a cycle), and the lookup `--ledger-era` resolves through (`registry.ts`). `effect/index.ts`
is the only module that imports the registry, which is what keeps the era modules — they import the
command modules — out of a cycle with `internal/command.ts`.

An invocation's era is chosen **twice**: `--ledger-era` picks the era of the intents, conversions and
state files, and the import at the top of the user's `contract.config.ts` picks the executable's.
`invocationHandler` reconciles them against `ContractExecutable.era` and fails naming both. Neither
choice can make a *compiled artifact* resolve its own `@midnight-ntwrk/compact-runtime` — that is a
resolution-level fact about the project holding the artifacts, and the era 8 vitest projects model it
(the CLI's scopes the redirect to importers under `managed-v8`, because the CLI holds both lines at
once).

Two things deliberately stay era-free rather than era-parameterised. `Contract.ts` describes what
`compactc` generates and must fit a contract compiled for any era, so it does not name the runtime's
`CircuitContext` or `CircuitResults`, and it says circuits and `initialState` *settle to* their
result (`Contract.Awaitable`) because 0.31.1 generates a synchronous contract and 0.34 an
asynchronous one; the executable narrows to its own era at the call. And the contract-event modules
are era-*gated* rather than parameterised — ledger 8 cannot emit events at all, so they are absent
from that entry (`internal/contractEventsSurface.ts`). The CLI gates the same way: a capability an
era lacks is *absent* from its `EraCapabilities`, and the handler reads the absence to reject the
options that depend on it.

To add a new era (e.g. ledger 10 paired with runtime 0.20):

1. Extend the `LedgerMajor` and `RuntimeLine` unions in `internal/era.ts`.
2. Create `internal/ledger/v10.ts` mirroring `v9.ts`: the curated re-export list, its own
   `CONTRACT_OPERATION_VERSION`, and an `Era` descriptor — declaring the paired
   `runtime: '0.20'` — with a **re-verified** CMA signature-scheme allowlist (verify each scheme
   end-to-end before listing it).
3. Create `internal/runtime/v0_20.ts` mirroring `v0_19.ts`: the curated re-export list and its
   `line`.
4. Register both bindings in `internal/ledger/conformance.ts` and `internal/runtime/conformance.ts`.
   Presence and the relational checks (`LedgerBindingViolations` / `RuntimeBindingViolations`) then
   fail the build for the new era whether or not anything points at it yet.
5. Create the era's three facades: `internal/era/v10Ledger.ts` and `internal/era/v10Runtime.ts`
   (mirroring the v9 pair — a curated type re-export list, `makeConversions(V10, V0_20)`, and
   `tryConvert`/`tryRuntime`), then `internal/era/v10Executable.ts`, which is
   `makeExecutable(Ledger, Runtime)` plus the type aliases that instantiate `internal/executable.ts`
   for the pair. Nothing in these is era logic: they are the era arriving as an argument.
6. Add `./v10` and `./v10/effect` to `package.json` `exports`, mirror the `src/v10/` entry files on
   `src/v9/`, and extend `LedgerEra.test.ts` and `test/typetests/effect/EraExecutable.tst.ts`. Also
   extend the two entry-cost suites, which are what keep an era-suffixed entry from quietly costing
   a consumer every era: `EraIsolation.test.ts` reads the built ESM import graph (what a *bundler*
   would follow), and `EraLaziness.test.ts` counts `WebAssembly.Module` compilations in a child
   process (what a *process* actually pays). Both need the new era listed, and the second needs its
   ledger and onchain-runtime package names — including the scope spelling, which is not consistent
   across eras.
7. Repoint **both** `internal/ledger/current.ts` and `internal/runtime/current.ts` at the new
   bindings. `CompactRuntime.test.ts` fails a half-completed swap: it checks the
   `Ledger.era.runtime` ↔ `CompactRuntime.line` pairing and anchors `line` to the installed
   package's `versionString`. This moves the *unsuffixed* entry only — every `/v<N>` entry binds its
   own era directly, so none of them follows the swap. `ContractLog.ts` was the one exception and is
   no longer: it reads an era-*free* `LogEvent` (the structural minimum it decodes) and recovers the
   caller's own event type by inference, so the new line's events fit it without it moving.
   `internal/runtime/conformance.ts` asserts each events-capable line still satisfies that minimum —
   if the new line's `LogEvent` fails there, widen the minimum, do not re-point `ContractLog` at a
   binding.
8. Per-era fixtures: add a `compact-v10-*` script pinned to that era's compactc, extend
   `test/era8/Fixtures.test.ts`'s equivalent for the new era, and add a vitest project whose alias
   points `@midnight-ntwrk/compact-runtime` at the new line if it is not the bound one.
9. Give the CLI the era: add `compact-js-command/src/effect/internal/era/v10.ts` (the four
   `makeHandler` factories applied to `/v10/effect`'s two facades, plus that era's
   `EraCapabilities`), list `10` in `internal/era/eras.ts`, and add the entry to `registry.ts` —
   `satisfies Record<SelectableLedgerEra, EraCommands>` fails the build if either half is missing.
   Extend `LedgerEraOption.test.ts` and `EraSelection.test.ts`. Nothing in the handlers changes:
   they take the era as an argument.
10. Give the era a CI leg. Each shipped era runs as its own matrix leg of `ledger-era` in
    `.github/workflows/ci-compact-js.yaml`, driven by a `test-ledger-era-<N>` script in each package
    that has one (and a matching `turbo.json` task). Add `10` to that matrix and the scripts it
    calls; the aggregate `yarn test` is just the era scripts in sequence, so it follows
    automatically. A package with no surface for the era simply omits the script — turbo skips it,
    which is how `compact-js-node` currently sits out era 8.
11. Move `DEFAULT_LEDGER_ERA` (`internal/era/eras.ts`) only if step 7 moved the bound era — it is
    deliberately the era an unsuffixed `contract.config.ts` gets, so changing it changes the meaning
    of every existing configuration.

## Notes for Contributors

- Test files live under `test/`, outside the build task's `src/**` inputs, so they don't invalidate build caching
- Generated files in `managed/` directories are checked in as build outputs
- Coverage excludes `test/**` (test files and helpers are not counted toward coverage)
- New packages must follow the same structure and export pattern
