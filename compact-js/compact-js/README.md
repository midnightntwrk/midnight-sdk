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
