/*
 * This file is part of midnight-sdk.
 * Copyright (C) 2025 Midnight Foundation
 * SPDX-License-Identifier: Apache-2.0
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * What a command handler needs from an era, declared above every era.
 *
 * @remarks
 * The command handlers used to be written against the bound `Ledger` and `CompactRuntime` facades
 * — roughly forty call sites — which made the CLI single-era by construction and left
 * `--ledger-era` able to do nothing but reject a value it could not honour. The handlers are now
 * factories over the three interfaces below, exactly as `compact-js`'s `internal/executable.ts` is
 * a factory over its two: **an era is an argument, not a module path** (midnight-sdk#387/#388).
 *
 * The contracts are deliberately *narrow*: only the members the handlers call, and never the whole
 * facade. Era-varying values are typed `never` in parameter position, so any era's concrete type is
 * assignable (parameters are contravariant) and the handlers must cast at each call — the same
 * `as never` discipline `ExecutableLedger` uses, and for the same reason. What flows between the
 * executable and the facade is opaque to the handler by design: it is that era's contract state,
 * transcript or zswap state, and the handler's job is to carry it from one era-matched call to the
 * next, not to name it.
 *
 * Two members are *not* opaque, and that is load-bearing — see {@link CommandRuntime}.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first statement, so under `stripInternal` the marker deletes it — here the imports every
 * declaration below is written in terms of, leaving typings that name namespaces they no longer
 * import. Privacy comes from `package.json` `exports` blocking `./effect/internal/*` instead. See
 * `compact-js`'s `internal/boundary.ts` for why this note does not spell the tag out.
 */
import type { CompiledContract, Contract, ContractExecutable, Ledger } from '@midnight-ntwrk/compact-js/effect';
import { type ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import type * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { type Effect, type Option } from 'effect';

import { type EncodedZswapLocalStateSchema } from '../encodedZswapLocalStateSchema.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A wrapper that holds a WASM-boundary rejection in the error channel — `Ledger.tryConvert` on the
 * ledger side, `CompactRuntime.tryRuntime` on the runtime side. Both facades of every era export
 * one, which is part of what "the same public API across eras" means.
 */
type TryBoundary = <A>(
  message: string,
  evaluate: () => A extends PromiseLike<unknown> ? never : A
) => Effect.Effect<A, ContractRuntimeError.ContractRuntimeError>;

/** A conversion across the ledger seam, which fails rather than throwing. */
type Convert<A> = (value: never) => Effect.Effect<A, ContractRuntimeError.ContractRuntimeError>;

/**
 * An era's ledger `ContractState`, as the handlers use it: deserialized from `--input`, re-pointed
 * at a post-execution `ChargedState`, and serialized back out to `--output-oc`.
 *
 * `data` is `unknown` rather than `never` so that each era's own `ChargedState` type is assignable
 * *into* the slot; the value written is always built by the same era's `ChargedState` constructor,
 * one line above the write.
 */
export interface CommandContractState {
  data: unknown;
  serialize(): Uint8Array;
}

/** An era's `ContractOperation`, as the handlers use it: routed into a call prototype and hashed. */
export interface CommandContractOperation {
  readonly verifierKey: Uint8Array;
}

/**
 * An era's ledger `Intent` — the one thing every command produces.
 *
 * @remarks
 * Recursive rather than opaque because the handlers chain onto the result: `addCall` in a fold over
 * the call trace, then `serialize`. Each era's `Intent` is a phantom-typed class whose `add*`
 * methods return a re-parameterised `Intent`, and stating the relationship here is what lets one
 * fold body serve every era.
 */
export interface CommandIntent {
  addCall(call: never): CommandIntent;
  addDeploy(deploy: never): CommandIntent;
  addMaintenanceUpdate(update: never): CommandIntent;
  serialize(): Uint8Array;
}

/**
 * The ledger-facade members the command handlers call.
 *
 * @remarks
 * Satisfied by every era's `Ledger` — `@midnight-ntwrk/compact-js/v8/effect`'s as much as
 * `/v9/effect`'s — because it names only what is common to both and keeps the era's own types in
 * `never`/`unknown` positions.
 */
export interface CommandLedger {
  /** This era's descriptor. `era.ledger` is what `--ledger-era` selects on, and what errors quote. */
  readonly era: Ledger.Era;

  // `new:` (with the colon) is a property named `new`, not a construct signature: `Intent.new` is a
  // static factory on the ledger's `Intent` class, whose real constructor is private.
  readonly Intent: { readonly new: (ttl: Date) => CommandIntent };
  readonly ChargedState: new (state: never) => unknown;
  readonly ContractCallPrototype: new (
    address: never,
    entryPoint: never,
    operation: never,
    guaranteedTranscript: never,
    fallibleTranscript: never,
    privateTranscriptOutputs: never,
    input: never,
    output: never,
    communicationCommitmentRand: never,
    keyLocation: never
  ) => unknown;
  readonly ContractDeploy: new (contractState: never) => unknown;

  readonly communicationCommitmentRandomness: () => unknown;
  readonly tryConvert: TryBoundary;

  readonly contractStateFromBytes: (
    bytes: Uint8Array
  ) => Effect.Effect<CommandContractState, ContractRuntimeError.ContractRuntimeError>;
  readonly parametersFromBytes: (
    bytes: Uint8Array
  ) => Effect.Effect<unknown, ContractRuntimeError.ContractRuntimeError>;
  readonly fromRuntimeContractState: Convert<CommandContractState>;
  readonly toRuntimeContractState: Convert<unknown>;
  readonly fromRuntimeStateValue: Convert<unknown>;
  readonly operationForCircuit: (
    contractState: never,
    circuitId: string,
    contractAddress: string
  ) => Effect.Effect<CommandContractOperation, ContractRuntimeError.ContractRuntimeError>;
}

/**
 * The compact-runtime-facade members the command handlers call.
 *
 * @remarks
 * The two zswap members are typed against the CLI's own
 * {@link EncodedZswapLocalStateSchema} rather than left opaque, and that is deliberate. `--input-zswap`
 * decodes a JSON file through that schema and hands the result to `decodeZswapLocalState`;
 * `--output-zswap` takes what `encodeZswapLocalState` produced and writes it back through the same
 * schema, which — `Schema.Struct` defaulting to `onExcessProperty: 'ignore'` — *strips* fields it
 * does not know rather than rejecting them. So a line whose encoded zswap state gained a field
 * would silently drop it from every written state file.
 *
 * Stating the two shapes here checks both directions at each era's instantiation: `decode`'s
 * parameter is contravariant, so the schema's type must be assignable to the line's, and `encode`'s
 * return is covariant, so the line's must be assignable to the schema's. That replaces the pair of
 * hand-written assertions that used to sit in `encodedZswapLocalStateSchema.ts` checking only the
 * *bound* line, and extends the guarantee to every era the CLI can select.
 */
export interface CommandRuntime {
  readonly tryRuntime: TryBoundary;
  readonly decodeZswapLocalState: (state: EncodedZswapLocalStateSchema) => unknown;
  readonly encodeZswapLocalState: (state: never) => EncodedZswapLocalStateSchema;
}

/**
 * Fails the build if a line's `EncodedZswapLocalState` has a key the CLI's schema does not —
 * the gap neither direction of {@link CommandRuntime}'s zswap members covers.
 *
 * @remarks
 * An **optional** field added to the runtime's type is assignable in both directions, so both pins
 * stay silent, yet it is exactly what a compatible upstream release adds. `Schema.Struct` defaults
 * to `onExcessProperty: 'ignore'`, so the field is **stripped** rather than rejected:
 * `--output-zswap` writes a value that came *from* the runtime, so the field vanishes from every
 * written state file with the build still green, and the loss surfaces much later, when the file is
 * read back through `--input-zswap` and the coin set is wrong.
 *
 * Comparing key sets rather than types is what makes optional fields visible. Applied once per era
 * in `internal/era/v<N>.ts`, where that era's `CompactRuntime` is in scope. The constraint is on
 * the *argument*, so it is not vacuous the way `T extends never` in return position would be: the
 * excess keys are what gets checked against `never`, and any non-empty union fails to satisfy it.
 */
export type AssertNoZswapKeyDrift<ExcessKeys extends never> = ExcessKeys;

/** The excess keys {@link AssertNoZswapKeyDrift} is applied to, for a line's encoded zswap state. */
export type ZswapKeyDrift<S> = Exclude<keyof S, keyof EncodedZswapLocalStateSchema>;

/**
 * The capabilities an era either has or does not, as the commands see them.
 *
 * @remarks
 * A capability an era lacks is **absent** here rather than present and failing, mirroring how
 * `/v8/effect` omits the contract-event modules instead of exporting ones that throw. The commands
 * read absence to reject the options that depend on it, naming the era, before any work starts.
 *
 * The two are shaped differently because they *are* different: cross-contract calls need a
 * value from the era (a state provider built against that era's conversions), while events need
 * only a yes/no. Deriving the second from the first would be a coincidence, not a fact.
 */
export interface EraCapabilities {
  /**
   * Builds this era's cross-contract state provider over a directory of ledger-serialized contract
   * states, or is absent on an era with no cross-contract calls at all.
   *
   * @remarks
   * Absence is the CLI's gate, but not the only one: on such an era the runtime line's
   * `createExecutionContext` *rejects* a state provider outright, so a handler that slipped one
   * through would fail loudly rather than execute against stale state.
   */
  readonly makeContractStateProvider?: (baseFolderPath: string) => unknown;
  /** Whether circuits on this era can emit contract log events (MIP-0002). */
  readonly contractEvents: boolean;
}

/** One entry of a circuit execution's call trace, as the `circuit` command consumes it. */
export interface CommandContractCall {
  readonly contractAddress: string;
  readonly circuitId: string;
  readonly public: {
    readonly contractState: unknown;
    readonly partitionedTranscript: readonly [unknown, unknown];
  };
  readonly private: {
    readonly input: unknown;
    readonly output: unknown;
    readonly privateTranscriptOutputs: readonly unknown[];
  };
  readonly communicationCommitment: Option.Option<{ readonly commCommRand: unknown }>;
}

/** The result of `ContractExecutable.circuit`, as the `circuit` command consumes it. */
export interface CommandCallResult<PS> {
  readonly result: unknown;
  readonly privateState: PS | undefined;
  readonly zswapLocalState: unknown;
  readonly events: readonly unknown[];
  readonly calls: readonly CommandContractCall[];
}

/** The result of `ContractExecutable.initialize`, as the `deploy` command consumes it. */
export interface CommandDeployResult<PS> {
  readonly public: { readonly contractState: unknown };
  readonly private: { readonly privateState: PS; readonly zswapLocalState: unknown };
}

/** The result of the maintenance operations, as the `maintain` commands consume them. */
export interface CommandMaintenanceResult {
  readonly public: { readonly maintenanceUpdate: unknown };
}

/**
 * A contract executable as the commands use it — era-agnostic on purpose.
 *
 * @remarks
 * The executable in a `contract.config.ts` is built by *the config author's* import: `/v8/effect`
 * or `/v9/effect` fixes its era, not anything the CLI does. Naming one era's
 * `ContractExecutable` here would therefore declare a config written against the other era to be
 * the wrong type, which is precisely backwards — the CLI accepts either and reconciles the two era
 * choices at run time by comparing {@link era} with the selected `--ledger-era`.
 *
 * So the members are described structurally, with era-typed arguments left `never` and era-typed
 * results left `unknown`. The looseness is the same looseness the CLI already had (it loads an
 * arbitrary module at run time and reflects over it), only now it is stated rather than inherited
 * from a `ModuleSpec<PS = any>`.
 */
export interface CommandExecutable<PS = any> {
  /** The era this executable was built for — `ContractExecutable`'s own `era`, not the CLI's. */
  readonly era: Ledger.Era;
  readonly compiledContract: CompiledContract.CompiledContract<Contract.Contract<PS>, PS, never>;

  initialize(
    initialPrivateState: PS,
    ...args: any[]
  ): Effect.Effect<
    CommandDeployResult<PS>,
    ContractExecutable.ContractExecutionError,
    ContractExecutable.ContractExecutable.Context
  >;

  circuit(
    provableCircuitId: Contract.ProvableCircuitId,
    circuitContext: never,
    ...args: any[]
  ): Effect.Effect<
    CommandCallResult<PS>,
    ContractExecutable.ContractExecutionError,
    ContractExecutable.ContractExecutable.Context
  >;

  replaceContractMaintenanceAuthority(
    newSigningKey: Option.Option<SigningKey.SigningKey>,
    contractContext: never
  ): Effect.Effect<
    CommandMaintenanceResult,
    ContractExecutable.ContractExecutionError,
    ContractExecutable.ContractExecutable.Context
  >;

  removeContractOperation(
    provableCircuitId: Contract.ProvableCircuitId,
    contractContext: never
  ): Effect.Effect<
    CommandMaintenanceResult,
    ContractExecutable.ContractExecutionError,
    ContractExecutable.ContractExecutable.Context
  >;

  addOrReplaceContractOperation(
    provableCircuitId: Contract.ProvableCircuitId,
    verifierKey: Contract.VerifierKey,
    contractContext: never
  ): Effect.Effect<
    CommandMaintenanceResult,
    ContractExecutable.ContractExecutionError,
    ContractExecutable.ContractExecutable.Context
  >;
}

/**
 * Fails the build unless `X` — an era's real `ContractExecutable` — satisfies
 * {@link CommandExecutable}.
 *
 * @remarks
 * Nothing else checks that claim. A `contract.config.ts` is loaded with `await import(...)`, whose
 * result is `any`, so `ConfigCompiler.ModuleExport` describes a shape no compiler ever verifies
 * against a real executable: if an era's executable and this view drifted apart, every handler
 * would keep compiling and fail at the first call. Applied once per era in
 * `internal/era/v<N>.ts`, where that era's `ContractExecutable` is in scope, so the drift is caught
 * for each era the CLI can select rather than for whichever one happens to be bound.
 */
export type AssertIsCommandExecutable<X extends CommandExecutable<PS>, PS> = X;

/**
 * The contract context every executable call but `circuit` takes, built by the handlers from the
 * era's own conversions and cast into place at the call.
 */
export interface CommandContractContext {
  readonly address: string;
  readonly contractState: unknown;
}

/** The circuit context, as the `circuit` command assembles it. See {@link CommandContractContext}. */
export interface CommandCircuitContext<PS> extends CommandContractContext {
  readonly privateState: PS;
  readonly zswapLocalState: unknown;
  readonly ledgerParameters: unknown;
  readonly stateProvider?: unknown;
  readonly parentBlockHash?: string;
}
