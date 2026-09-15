# ADR 0001: Ledger era seam in compact-js

- **Status:** Accepted
- **Date:** 2026-09-15
- **Issues:** [midnight-sdk#387](https://github.com/midnightntwrk/midnight-sdk/issues/387),
  [midnight-sdk#388](https://github.com/midnightntwrk/midnight-sdk/issues/388)

## Context

Midnight hardforks introduce new ledger generations ("eras") as new npm packages
(`@midnightntwrk/ledger-v9`, `-v10`, …), each carrying its own WASM instance and its own branded
classes. Before this seam, `compact-js` and `compact-js-command` each imported a ledger package
directly, which produced two failure classes:

1. **Dual WASM instances.** A value constructed by one package's ledger copy fails `instanceof`
   branding checks in the other (e.g. `Intent.addMaintenanceUpdate()` throwing
   `'expected instance of MaintenanceUpdate'`). This forced the command package's maintenance
   tests to be skipped for a long period.
2. **Scattered era facts.** Version literals (`'v3'` contract-operation versions), supported CMA
   signature schemes, and conversion boilerplate were hard-coded at call sites, so an era bump
   meant hunting call sites across packages.

## Decision

All ledger types, constructors, and runtime↔ledger conversions are reached through one facade,
`compact-js/src/effect/Ledger.ts`. Only the era bindings under
`compact-js/src/effect/internal/ledger/` (`v9.ts`, a future `v10.ts`, …) may import a
`@midnightntwrk/ledger-v<N>` package; ESLint enforces the boundary (tests are exempt — some must
compare ledger module identity). The concrete era is bound by one module, `current.ts`, whose
bound module must satisfy the `LedgerBinding` contract at compile time. Era-varying facts (ledger
major, CMA signature-scheme support, default sampling scheme) live on an `Era` descriptor each
binding supplies; version literals stay inside the binding behind constructor functions.

**The seam is a module, not an injected service.** Which ledger era a build speaks is a
packaging-level fact — one era per build artifact — not a runtime dependency to vary per effect.
An Effect service would suggest per-effect era selection that the WASM reality (one instantiated
ledger module graph per era) cannot deliver, and would force every facade consumer to thread a
context requirement for something that can never actually vary at runtime. Downstream multi-era
consumers are instead expected to select between era-scoped entry points.

## Era-scoped entries (midnight-sdk#388, outstanding)

`@midnight-ntwrk/compact-js/v9` and `/v9/effect` exist so consumers can commit to an era in their
import graph now. **They are currently aliases**: every entry resolves the facade through the same
`current.ts`, so repointing it changes the era for all entries at once, `/v9` included. Making the
suffixed entries genuinely era-pinned requires parameterizing the reachable module graph by era
(or publishing per-era packages); that is the outstanding #388 work, and until it lands the next
era bump must first rebind `/v9` to a pinned ledger 9 binding. Only `compact-js` has era-scoped
entries today; `compact-js-node` and `compact-js-command` expose unsuffixed entries only.

## Consequences

- An era bump edits one binding module plus `current.ts`; the `LedgerBinding` check fails the
  build at the swap point if the new binding misses a facade name.
- Both packages share one ledger WASM instance; the previously skipped maintenance-command tests
  are re-enabled as the regression guard for the dual-instance failure.
- The facade re-exports a curated name list; consumers needing more ledger API widen the binding
  rather than importing around the seam.
- `compact-js-command` and `compact-js-node` keep the ledger package only as a `devDependency`
  (tests), so a stray direct import in `src/` would fail only for published consumers — the ESLint
  boundary is the guard against introducing one.

The "how to add an era binding" checklist is maintained in `compact-js/CLAUDE.md`.
