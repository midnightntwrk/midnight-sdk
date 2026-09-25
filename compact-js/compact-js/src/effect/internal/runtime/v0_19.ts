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
 * The compact-runtime 0.19 binding. This module (together with its peers under `internal/runtime`)
 * is the only place in `src/` that may import from `@midnight-ntwrk/compact-runtime`; everything
 * else goes through the `CompactRuntime` facade so that a future runtime line binds by swapping
 * `current.ts`, not by editing call sites (midnight-sdk#387). ESLint enforces this
 * (`no-restricted-imports`); tests are exempt by design, since some must compare module identity.
 *
 * The runtime line is era-paired with the ledger — 0.19 with ledger 9, over onchain-runtime-v4 —
 * so this binding and `internal/ledger/v9.ts` are swapped together. Neither is meaningful alone.
 */
import {
  type AlignedValue,
  type CallProofData,
  type CircuitContext,
  type CircuitResults,
  type CommunicationCommitmentData,
  type ContractState,
  type ContractStateProvider,
  createCircuitContext,
  type EncodedZswapLocalState,
  type LogEvent,
  type Op,
  type QueryContext,
  type RunningCost,
  sampleSigningKey,
  type SigningKey
} from '@midnight-ntwrk/compact-runtime';
import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';

import { type RuntimeLine } from '../era.js';
import {
  type CallProofDataView,
  type ExecutionContextParams,
  type ExecutionView
} from './execution.js';

// `CallContext`, `Effects` and `CoinCommitment` are the types of the partition inputs
// `ContractCallPublic` exposes (midnight-sdk#400) — `block`, `effects`, and the key type of the
// `comIndices` map. Without them a consumer receives the three values but cannot name what it
// received, and has to import the era package around the seam to declare them — which is what the
// facade exists to prevent. `EncodedStateValue` is not one of those: it is the encoded form a
// `StateValue` round-trips through and the shape a contract event's payload arrives in, listed here
// for consumers decoding either.
//
// `CallContext` here is **onchain-runtime-v4's** block-level context, not circuit-context.ts's
// `CallContext<PS>`: compact-runtime's `index.d.ts` exports both, and the explicit named re-export
// takes precedence over the `export *`, so this is the one the name resolves to. That is the one
// wanted — the other is the runtime's own per-call frame, which never reaches compact-js's surface.
// `CompactRuntime.tst.ts` pins which of the two resolves, so reordering those exports fails there.
export {
  type AlignedValue,
  type CallContext,
  type CallProofData,
  type CircuitContext,
  type CircuitResults,
  type CoinCommitment,
  type CommunicationCommitmentData,
  CompactError,
  type ConstructorContext,
  type ConstructorResult,
  ContractMaintenanceAuthority,
  ContractState,
  type ContractStateProvider,
  createCircuitContext,
  createConstructorContext,
  decodeZswapLocalState,
  type Effects,
  emptyZswapLocalState,
  type EncodedStateValue,
  type EncodedZswapLocalState,
  encodeZswapLocalState,
  type LogEvent,
  type Op,
  type QueryContext,
  type RunningCost,
  sampleSigningKey,
  signatureVerifyingKey,
  type StateValue,
  type WitnessContext,
  type ZswapLocalState
} from '@midnight-ntwrk/compact-runtime';

/**
 * The compact-runtime line this binding targets. Read by the era-pairing check rather than
 * hard-coded at any call site, so a runtime swap is a one-line edit here plus `current.ts`.
 *
 * `as const satisfies` rather than a `: RuntimeLine` annotation, matching the ledger twin
 * (`internal/ledger/v9.ts`): an annotation widens `typeof CompactRuntime.line` to the whole union
 * at every consumer and in the emitted `.d.ts`, which forecloses any compile-time use of the
 * pairing. The two coincide while the union is a singleton and stop coinciding the moment a second
 * line is bound.
 *
 * @category era
 */
export const line = '0.19' as const satisfies RuntimeLine;

/**
 * Samples a fresh signing key for `kind`.
 *
 * @remarks
 * A thin pass-through on this line: onchain-runtime-v4 keys are already tagged (`{ tag, value }`)
 * and `sampleSigningKey` already takes the scheme. The wrapper exists so the *older* line can
 * present the same shape — see `v0_16.ts`, where the underlying call takes no argument and returns
 * a bare hex string — and so era-neutral code reads `.value` without branching.
 *
 * @category constructors
 */
export const makeSampleSigningKey = (kind: SignatureKind): SigningKey => sampleSigningKey(kind);

/** This line's instantiation of the era-neutral call-trace entry. @category execution */
export type CallTraceEntry = CallProofDataView<
  QueryContext,
  AlignedValue,
  Op<AlignedValue>,
  EncodedZswapLocalState,
  CommunicationCommitmentData
>;

/** This line's instantiation of the era-neutral execution view. @category execution */
export type Execution<Result, PrivateState> = ExecutionView<
  Result,
  PrivateState,
  CallTraceEntry,
  // Optional because 0.19 carries the root zswap state on `callContext`, where it may be absent;
  // `ContractExecutable` owns the typed failure for that case.
  EncodedZswapLocalState | undefined,
  LogEvent,
  Record<string, RunningCost>
>;

/**
 * Builds a circuit-execution context for this line.
 *
 * @remarks
 * A direct pass-through: 0.19 *is* the call-tree model the era-neutral view is modelled on, so this
 * only reorders named parameters into `createCircuitContext`'s positional ones. The remaining gaps
 * (`costModel`, `reentrancyGuard`) keep the runtime's own defaults. `costModel` is not one a caller
 * could fill: `CostModel` has a private constructor and one static factory, whose result *is* that
 * default.
 *
 * @category execution
 */
export const createExecutionContext = <PS>(
  params: ExecutionContextParams<PS, ContractState, EncodedZswapLocalState, ContractStateProvider>
): CircuitContext<PS> =>
  createCircuitContext(
    params.circuitId,
    params.address,
    params.zswapLocalState,
    params.contractState,
    params.privateState,
    params.stateProvider,
    params.queryGasLimit,
    undefined,
    params.time,
    params.parentBlockHash
  );

/**
 * Projects this line's circuit results into the era-neutral execution view.
 *
 * @remarks
 * Also a pass-through: the trace, root private state, root zswap state and event list are all
 * already on the 0.19 context. `zswapLocalState` is asserted non-`undefined` by the caller, which
 * owns the typed failure — this function stays total.
 *
 * @category execution
 */
export const readExecution = <Result, PS>(
  results: CircuitResults<PS, Result>
): Execution<Result, PS | undefined> => ({
  result: results.result,
  trace: results.context.callProofDataTrace as readonly CallTraceEntry[],
  privateState: results.context.callContext.currentPrivateState,
  zswapLocalState: results.context.callContext.currentZswapLocalState,
  events: results.context.events,
  // The context's map, not `results.gasCost`: that one is the root frame's tally alone and omits
  // every callee.
  gasCosts: results.context.gasCosts
});

// `CallProofData` is the type the trace cast above narrows to; asserted rather than assumed so a
// 0.19 patch that reshapes it fails the build here instead of at a call site.
type _TraceEntryMatchesCallProofData = CallProofData extends CallTraceEntry ? true : never;
const _traceEntryConforms: _TraceEntryMatchesCallProofData = true;
void _traceEntryConforms;

/**
 * Extracts the hex value of a ledger 9 era signing key.
 *
 * @remarks
 * onchain-runtime-v4 keys are tagged, so the hex lives under `value`. The 0.16 binding's
 * counterpart is the identity, its keys being bare hex strings already.
 *
 * @category conversions
 */
export const signingKeyHex = (key: SigningKey): string => key.value;
