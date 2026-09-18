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
> distinct from the package `@midnight-ntwrk/compact-runtime`, which provides the utilities that each
> of these JavaScript executables use.

## Ledger eras

The version suffix on an era-pinned entry names the **ledger era** it targets, not this package's
own version: `@midnight-ntwrk/compact-js/v9` (and `/v9/effect`) targets **ledger 9**, and
`/v8` (with `/v8/effect`) targets **ledger 8**.

The bound era is inspectable at run time via `Ledger.era`, from any entry.

### What each entry gives you

| Entry | Ledger era | compact-runtime | Surface |
| --- | --- | --- | --- |
| `.` / `./effect` | the build's bound era (ledger 9 today) | 0.19 | Full |
| `/v9` / `/v9/effect` | ledger 9 | 0.19 | Full |
| `/v8` / `/v8/effect` | ledger 8 | 0.16 | `Ledger` and `CompactRuntime` seams only |

`/v8/effect` binds ledger 8 directly rather than following the package's bound era, so the two
era facades can be live in one process.

> [!NOTE]
> `/v9` and the unsuffixed entries still resolve the package's *bound* era. They agree today
> because that era is ledger 9; when it advances, `/v9` must be repointed at a pinned ledger 9
> binding the way `/v8` is pinned now.

### Ledger 8 limitations

Two kinds, worth keeping apart.

**Era-impossible — these will never exist on ledger 8.** Contract events and cross-contract calls.
onchain-runtime-v3's `log` payload carries no emitting-contract address or versioning and nothing
accumulates them, and there is no `crossContractCall` at all. `createExecutionContext` *rejects* a
cross-contract state provider rather than ignoring it.

**Not yet implemented.** `ContractExecutable`, `CompiledContract` and the configuration services
are absent from `/v8/effect`. Those modules resolve the `Ledger` and `CompactRuntime` facades by
module path, so they follow the package's bound era; exposing them under `/v8` would hand back
ledger-9-bound objects. Ledger 8 execution itself works — the test suite compiles a contract with
compactc 0.31.1 and runs a circuit on the 0.16 line — so what remains is parameterising those
modules on an era pair.

Until then, a build-wide ledger 8 target is selected at resolution time: repoint both
`internal/*/current.ts` files, or resolve `@midnight-ntwrk/compact-js` to a ledger-8-pinned build
in that subtree. A compiled ledger 8 contract forces the same mechanism anyway — its generated code
imports `@midnight-ntwrk/compact-runtime` by bare specifier and asserts
`checkRuntimeVersion('0.16.0')` when it loads, so that specifier has to resolve to 0.16 wherever
that contract is used.

## Contract log events

Contracts emit typed log events via the Compact `emit` expression. Each circuit result
carries the raw events for the whole call tree on `result.events`, each tagged with its emitting
contract's `address`.

- **`ContractLog`** decodes raw events into typed, discriminated `ContractEvent`s. Decoding
  **never throws**: an oversized, malformed, or dropped payload degrades gracefully
  (`degraded: true`) rather than failing the batch.
- **`ContractEventStore`** is an in-process accumulator over decoded events. It assigns a monotonic
  `id` on `append`, supports `query` with a MIP-aligned filter (contract address, event type,
  indexed-field hex prefixes, resume cursor), and a live, resumable `subscribe` stream that replays
  matching history then tails new events.

```ts
import { ContractEventStore, ContractLog } from '@midnight-ntwrk/compact-js/effect';
import { Effect, Stream } from 'effect';

const program = Effect.gen(function* () {
  const store = yield* ContractEventStore.ContractEventStore;

  // Decode a circuit result's raw events and accumulate them.
  const result = yield* contract.circuit(circuitId, ctx, ...args);
  yield* store.append(ContractLog.decodeAll(result.events));

  // Query accumulated events with a MIP-aligned filter.
  const mints = yield* store.query({ eventType: 'unshielded-mint' });

  // Or subscribe to a live, resumable feed (replay from a cursor, then tail).
  yield* store
    .subscribe({ eventType: 'unshielded-mint', fromId: 1n })
    .pipe(Stream.runForEach((event) => Effect.log(event.id)));

  return mints;
}).pipe(Effect.provide(ContractEventStore.layer));
```
