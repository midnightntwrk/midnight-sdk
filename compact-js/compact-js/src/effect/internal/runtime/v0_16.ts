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

 * It satisfies {@link RuntimeBinding} (the era-neutral core) and deliberately **not**
 * {@link CallTreeRuntimeBinding}. That is not an omission to be filled in later: the 0.16
 * execution model is a single flat frame, and the call-tree members simply do not exist on this
 * line. What is missing, measured against 0.19.0-rc.0:
 *
 * - `CircuitContext` is `{ currentPrivateState, currentZswapLocalState, currentQueryContext,
 *   costModel, gasLimit }` — one contract, no `callContext`, no `queryContexts`/`gasCosts`/
 *   `zswapLocalStates`/`contractStates` maps, no `callProofDataTrace`, no `events`.
 * - `createCircuitContext` takes the contract address first (0.19 takes the circuit id) and has no
 *   `stateProvider`, `parentBlockHash` or `reentrancyGuard` parameters.
 * - `CircuitResults` carries `proofData: ProofData`; 0.19 dropped it in favour of the trace on the
 *   context.
 * - Absent entirely: `CircuitId`, `CallContext`, `CallProofData`, `CallProofDataTrace`,
 *   `CommunicationCommitmentData`, `LogEvent`, `ContractStateProvider`, `crossContractCall`,
 *   `copyCircuitContext`, `finalizeCallProofData`, `createInitialQueryContext`,
 *   `createCallContext`.
 * - `queryLedgerState` returns `AlignedValue | GatherResult[]`, against 0.19's
 *   `AlignedValue | undefined`.
 *
 * Everything else — `constructor-context`, `zswap`, `proof-data`, `contract-dependencies`,
 * `compact-types`, `casts`, `built-ins`, `utils`, `error`, `constants`, `witness`, `version` — is
 * identical to 0.19 apart from the onchain-runtime-v3 → v4 import swap, which is why the core
 * contract below is satisfiable at all.
 */
import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import {
  type AlignedValue,
  type CircuitContext,
  type CircuitResults,
  ContractMaintenanceAuthority as RuntimeContractMaintenanceAuthority,
  type ContractState,
  createCircuitContext,
  type EncodedZswapLocalState,
  type Op,
  type ProofData,
  type QueryContext,
  sampleSigningKey,
  type SignatureVerifyingKey,
  type SigningKey
} from 'compact-runtime-ledger8';

import { type RuntimeLine } from '../era.js';
import { type CallProofDataView, type ExecutionContextParams, type ExecutionView } from './execution.js';

export {
  type AlignedValue,
  type CircuitContext,
  type CircuitResults,
  CompactError,
  type ConstructorContext,
  type ConstructorResult,
  ContractState,
  createCircuitContext,
  createConstructorContext,
  decodeZswapLocalState,
  emptyZswapLocalState,
  type EncodedZswapLocalState,
  encodeZswapLocalState,
  type Op,
  type ProofData,
  type QueryContext,
  signatureVerifyingKey,
  type StateValue,
  type WitnessContext,
  type ZswapLocalState
} from 'compact-runtime-ledger8';

/**
 * This line's `ContractMaintenanceAuthority`, with `deserialize`'s return type repaired.
 *
 * @remarks
 * onchain-runtime-v3 declares `static deserialize(raw: Uint8Array): ContractState` — an upstream
 * mistake in the generated `.d.ts`, and the exact one `@midnightntwrk/ledger-v8@8.1.2` carries on
 * the ledger side (see `internal/ledger/v8.ts`). The WASM really returns a
 * `ContractMaintenanceAuthority`: verified against the shipped 3.1.1 build, where
 * `deserialize(cma.serialize())` yields a value whose constructor is
 * `ContractMaintenanceAuthority` and which fails `instanceof ContractState`.
 *
 * Repairing it at the seam matters more here than the label suggests. `makeConversions` derives
 * `fromRuntimeMaintenanceAuthority`'s **parameter** from this return type, so unrepaired the
 * published `/v8/effect` signature asks for a `ContractState`: the authority a caller actually
 * holds is rejected at compile time, and the contract state that is accepted instead fails inside
 * WASM. The ledger 9 line declares this correctly, so without the repair the two eras would also
 * disagree on a signature that #388 requires to be identical.
 *
 * Re-check on each 3.x release — if upstream fixes the declaration, this cast becomes a no-op and
 * can go. `RuntimeBinding.tst.ts` pins the relationship on both lines.
 */
const ContractMaintenanceAuthority = RuntimeContractMaintenanceAuthority as unknown as {
  new (committee: SignatureVerifyingKey[], threshold: number, counter?: bigint): RuntimeContractMaintenanceAuthority;
  deserialize(raw: Uint8Array): RuntimeContractMaintenanceAuthority;
};

export { ContractMaintenanceAuthority };

/** This line's `ContractMaintenanceAuthority` instance type, unaffected by the repair above. */
export type ContractMaintenanceAuthority = RuntimeContractMaintenanceAuthority;

/**
 * The compact-runtime line this binding targets.
 *
 * @category era
 */
export const line = '0.16' satisfies RuntimeLine;

/**
 * Samples a fresh signing key in this line's native representation.
 *
 * @remarks
 * `kind` is accepted and **ignored**: onchain-runtime-v3 has no scheme concept at all — its
 * `SigningKey` is a bare hex string and `sampleSigningKey()` takes no argument — so BIP-340
 * Schnorr is the only thing this line can produce. Callers must consult the *ledger* era's
 * allowlist first (`internal/ledger/v8.ts` permits `schnorr` only), which is what makes ignoring
 * the argument safe rather than silently wrong.
 *
 * The key is returned in this line's native representation — a bare hex string — so that it stays
 * assignable to this line's own `signatureVerifyingKey`. {@link signingKeyHex} is what makes the
 * hex readable era-neutrally.
 *
 * @category constructors
 */
export const makeSampleSigningKey = (_kind: SignatureKind): SigningKey => sampleSigningKey();

/**
 * Extracts the hex value of a ledger 8 era signing key.
 *
 * @remarks
 * The identity: onchain-runtime-v3 has no tagged-key concept, so a `SigningKey` *is* its hex
 * string. Present so era-neutral code can read a key's hex without branching — the ledger 9 era's
 * counterpart reads `.value` off a tagged key.
 *
 * @category conversions
 */
export const signingKeyHex = (key: SigningKey): string => key;

/**
 * Contract events do not exist on this line, so there is no type to carry one.
 *
 * @remarks
 * `never` rather than an empty-object stand-in, and this is load-bearing: it makes
 * `ContractExecutable`'s `CallResult.events` a `never[]` on this era — a list that is *statically*
 * empty, not merely empty at run time. So the same `CallResult` type serves both eras while the
 * impossible case stays unconstructable, which is what #388 asks for.
 *
 * The VM-level `log` gather op does exist under onchain-runtime-v3, but its payload is a bare
 * `EncodedStateValue` against v4's `{ version, eventType, data }`, it has no emitting-contract
 * address, and 0.16 accumulates nothing on the circuit context. Events here would be a rebuild
 * against a different payload, not a binding.
 *
 * @category execution
 */
export type LogEvent = never;

/** This line's instantiation of the era-neutral call-trace entry. @category execution */
export type CallTraceEntry = CallProofDataView<
  QueryContext,
  AlignedValue,
  Op<AlignedValue>,
  EncodedZswapLocalState,
  never
>;

/** This line's instantiation of the era-neutral execution view. @category execution */
export type Execution<Result, PrivateState> = ExecutionView<
  Result,
  PrivateState,
  CallTraceEntry,
  EncodedZswapLocalState,
  LogEvent
>;

/**
 * Carries the facts `readExecution` needs but 0.16 does not record: the circuit id, the contract
 * address, and the query context as it stood *before* execution.
 *
 * A `Symbol` key, not a string, so it cannot collide with anything the generated contract reads —
 * and not a `WeakMap`, because the generated 0.16 circuit rebuilds the context
 * (`const context = { ...contextOrig_0, gasCost: … }`), which would break identity-keyed lookup.
 * Object spread copies own enumerable *symbol* properties as well as string ones, so this survives
 * that hop.
 */
const EXECUTION_META = Symbol('compact-js/runtime/0.16/executionMeta');

interface ExecutionMeta {
  readonly circuitId: string;
  readonly contractAddress: string;
  readonly initialQueryContext: QueryContext;
}

type AnnotatedContext<PS> = CircuitContext<PS> & { readonly [EXECUTION_META]?: ExecutionMeta };

/**
 * Builds a circuit-execution context for this line.
 *
 * @remarks
 * Two adaptations. The positional order differs — 0.16 takes the contract address first and has no
 * circuit-id parameter at all — and the circuit id, address and pre-execution query context are
 * recorded on the context so {@link readExecution} can rebuild a trace entry the newer line
 * supplies natively.
 *
 * The initial query context is snapshotted *here*, not read back later: the flat 0.16 context is
 * mutated in place during execution, so reading it afterwards would report the final state as the
 * initial one and silently corrupt transcript partitioning.
 *
 * @throws If `stateProvider` or `parentBlockHash` is supplied. This line has no `crossContractCall`
 * and no `ContractStateProvider`, so honouring a cross-contract call is impossible; ignoring the
 * provider would instead make such a call appear to succeed against stale state.
 *
 * @category execution
 */
export const createExecutionContext = <PS>(
  params: ExecutionContextParams<PS, ContractState, EncodedZswapLocalState, never>
): CircuitContext<PS> => {
  if (params.stateProvider !== undefined || params.parentBlockHash !== undefined) {
    throw new Error(
      `compact-runtime ${line} (ledger 8 era) cannot execute cross-contract calls: ` +
        'this line has no crossContractCall or ContractStateProvider. ' +
        'Use a build pinned to a later era to call across contracts.'
    );
  }

  const context = createCircuitContext(
    params.address,
    params.zswapLocalState,
    params.contractState,
    params.privateState
  );

  const meta: ExecutionMeta = {
    circuitId: params.circuitId,
    contractAddress: params.address,
    initialQueryContext: context.currentQueryContext
  };

  return Object.defineProperty(context, EXECUTION_META, {
    value: meta,
    enumerable: true,
    writable: false,
    configurable: false
  });
};

/**
 * Projects this line's circuit results into the era-neutral execution view.
 *
 * @remarks
 * The trace is **synthesised** as a single entry. That is faithful rather than lossy: without
 * `crossContractCall` this line can only ever produce one call, so a one-element trace is complete
 * by construction. The proof data 0.19 hangs off each `CallProofData` lives on `results.proofData`
 * here, and is moved across.
 *
 * `events` is always empty, and typed `never[]` — see {@link LogEvent}.
 *
 * @throws If the context was not built by {@link createExecutionContext}. Without the recorded
 * metadata the circuit id, address and pre-execution state are unrecoverable, and guessing them
 * would produce a trace that looks valid and proves the wrong call.
 *
 * @category execution
 */
export const readExecution = <Result, PS>(
  results: CircuitResults<PS, Result> & { readonly proofData: ProofData }
): Execution<Result, PS | undefined> => {
  const meta = (results.context as AnnotatedContext<PS>)[EXECUTION_META];
  if (meta === undefined) {
    throw new Error(
      `compact-runtime ${line} (ledger 8 era): circuit results carry no execution metadata. ` +
        'Build the context with createExecutionContext rather than createCircuitContext.'
    );
  }

  const entry: CallTraceEntry = {
    circuitId: meta.circuitId,
    contractAddress: meta.contractAddress,
    initialQueryContext: meta.initialQueryContext,
    finalQueryContext: results.context.currentQueryContext,
    publicTranscript: results.proofData.publicTranscript,
    input: results.proofData.input,
    output: results.proofData.output,
    privateTranscriptOutputs: results.proofData.privateTranscriptOutputs,
    zswapLocalState: results.context.currentZswapLocalState,
    // Only ever set for a cross-contract sub-call, which this line cannot make.
    commCommData: undefined
  };

  return {
    result: results.result,
    trace: [entry],
    privateState: results.context.currentPrivateState,
    zswapLocalState: results.context.currentZswapLocalState,
    events: []
  };
};
