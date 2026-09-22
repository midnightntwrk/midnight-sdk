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
 * Contract execution for the era this build binds.
 *
 * @remarks
 * The bodies live in `internal/executable.ts`, which takes an era pair as arguments; this module is
 * that factory applied to the {@link Ledger} and {@link CompactRuntime} facades — so it follows
 * each seam's `current.ts`, exactly as it did when it held the implementation itself. Consumers
 * see no difference: the type and function names, their parameters and their results are unchanged.
 *
 * What changed is that this is no longer the *only* application. `internal/era/v8Executable.ts` and
 * `internal/era/v9Executable.ts` apply the same factory to a pinned era pair, which is what lets
 * `/v8/effect` and `/v9/effect` export an executable that genuinely belongs to the era its path
 * names rather than to whichever era the build bound (midnight-sdk#387/#388).
 *
 * @module
 */
import * as CompactRuntime from './CompactRuntime.js';
import type * as Contract from './Contract.js';
import * as Internal from './internal/executable.js';
import * as Ledger from './Ledger.js';

/** The era pair this entry executes against: whichever the build binds. */
type BoundLedger = typeof Ledger;
type BoundRuntime = typeof CompactRuntime;

const executable = Internal.makeExecutable(Ledger, CompactRuntime);

/**
 * An executable form of a Compact compiled contract.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContractExecutable<in out C extends Contract.Contract<PS>, PS, out E = never, out R = never>
  extends Internal.ContractExecutable<BoundLedger, BoundRuntime, C, PS, E, R> {}

export declare namespace ContractExecutable {
  /**
   * The services required as context for executing contracts.
   */
  export type Context = Internal.Context;

  export type ContractContext = Internal.ContractContext<BoundLedger, BoundRuntime>;

  export type CircuitContext<PS> = Internal.CircuitContext<BoundLedger, BoundRuntime, PS>;

  export type DeployResultPublic = Internal.DeployResultPublic<BoundLedger, BoundRuntime>;
  export type DeployResultPrivate<PS> = Internal.DeployResultPrivate<BoundLedger, BoundRuntime, PS>;
  export type DeployResult<PS> = Internal.DeployResult<BoundLedger, BoundRuntime, PS>;

  export type PartitionedTranscript = Internal.PartitionedTranscript<BoundLedger, BoundRuntime>;
  export type ContractCallPublic = Internal.ContractCallPublic<BoundLedger, BoundRuntime>;
  export type ContractCallPrivate = Internal.ContractCallPrivate<BoundLedger, BoundRuntime>;

  /**
   * Proof data for a single contract call. One {@link ContractCall} is produced for every call
   * made while executing a circuit — the root call plus one per cross-contract call —
   * corresponding to the entries of the runtime's `callProofDataTrace`.
   */
  export type ContractCall = Internal.ContractCall<BoundLedger, BoundRuntime>;

  /**
   * The result of invoking a circuit.
   *
   * `calls` holds the proof data for every contract call made during execution, in
   * `callProofDataTrace` order — callees first, the root call last. The application-facing
   * `result`, `privateState`, and `zswapLocalState` belong to the root contract and are
   * statically typed for it; sub-calls expose only proof data (other contracts' types are not
   * known here, and only the root holds private state). Each call carries its own Zswap local
   * state on `calls[i].private.zswapLocalState` — the root's is repeated here for convenience.
   *
   * `events` is the single execution-wide log-event list across the whole call tree, in emission
   * order; each event is tagged with its emitting contract's address, so a per-contract view is a
   * filter over that tag. Events are NOT consensus state and are handled by the indexer; size and
   * well-formedness are enforced on-chain by the ledger/VM (degraded, not failed) per MIP-0002.
   *
   * The events are kept **raw** here to avoid paying decode cost when unused. To obtain typed,
   * per-event payloads, decode on demand with `ContractLog.decodeAll(result.events)` (which
   * degrades gracefully and never throws); feed them to a `ContractEventStore` to query/subscribe.
   */
  export type CallResult<
    C extends Contract.Contract<PS>,
    PS,
    K extends Contract.ProvableCircuitId<C>
  > = Internal.CallResult<BoundLedger, BoundRuntime, C, PS, K>;

  export type MaintenanceResultPublic = Internal.MaintenanceResultPublic<BoundLedger, BoundRuntime>;
  export type MaintenanceResultPrivate = Internal.MaintenanceResultPrivate;
  export type MaintenanceResult = Internal.MaintenanceResult<BoundLedger, BoundRuntime>;
}

/**
 * An error occurred while executing a constructor, or a circuit, of an executable contract.
 *
 * @category errors
 */
export type ContractExecutionError = Internal.ContractExecutionError;

/**
 * Takes a Compact compiled contract, and makes it executable.
 *
 * @param compiledContract A {@link CompiledContract}
 * @returns A {@link ContractExecutable} for `compiledContract`.
 *
 * @category constructors
 */
export const make = executable.make;

/**
 * Provides a layer to the executable contract.
 *
 * @category combinators
 */
export const provide = executable.provide;
