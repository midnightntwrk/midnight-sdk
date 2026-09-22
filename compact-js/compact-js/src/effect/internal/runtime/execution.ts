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
 * The era-neutral shape of "execute one circuit", declared above both runtime bindings so each can
 * present the same view of a fundamentally different execution model (midnight-sdk#387 phase 3).
 *
 * @remarks
 * `ContractExecutable` used to speak compact-runtime 0.19's model directly: build a context with
 * `createCircuitContext(circuitId, address, …)`, then read `context.callProofDataTrace`,
 * `context.callContext` and `context.events`. None of that exists on 0.16 — it has one flat frame
 * and hands proof data back on `results.proofData`.
 *
 * Rather than fork the executable per era, each binding implements two functions against the types
 * here:
 *
 * - `createExecutionContext` — takes named parameters instead of 0.19's ten positional ones (0.16
 *   orders them differently and has fewer), and returns whatever context *that* line's generated
 *   contracts accept.
 * - `readExecution` — projects the line's results into {@link ExecutionView}.
 *
 * The type parameters keep this file era-agnostic: each binding instantiates them with its own
 * `QueryContext`, `AlignedValue` and so on, and the relational checks in `binding.ts` assert the
 * instantiation is self-consistent. Deliberately structural — nothing here imports a runtime
 * package, so this module stays above both seams.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first declaration, so under `stripInternal` the marker deleted {@link CallProofDataView} from the
 * emitted typings while `v0_16.d.ts` and `v0_19.d.ts` went on importing it — `.d.ts` files that
 * only looked sound because most consumers build with `skipLibCheck`. Privacy comes from
 * `package.json` `exports` blocking `./effect/internal/*` instead. See `internal/boundary.ts` for
 * why this note does not spell the tag out.
 */

/**
 * One entry of an execution's call trace: the data needed to prove a single circuit call and to
 * partition its transcript.
 *
 * @remarks
 * Mirrors compact-runtime 0.19's `CallProofData` because that is the richer of the two models, so
 * nothing is lost on the newer line. On 0.16 a single entry of this shape is *synthesised* from the
 * flat frame, which is faithful rather than lossy: a line with no `crossContractCall` can only
 * produce one call, so a one-element trace is complete by construction.
 */
export interface CallProofDataView<QueryContext, AlignedValue, Op, EncodedZswapLocalState, CommunicationCommitmentData> {
  readonly circuitId: string;
  readonly contractAddress: string;
  /**
   * The contract's ledger state *before* the call.
   *
   * @remarks
   * Must be captured at context construction, not read back afterwards. 0.16's flat context is
   * mutated in place during execution, so reading `currentQueryContext` at the end would report
   * the final state as the initial one and silently corrupt transcript partitioning.
   */
  readonly initialQueryContext: QueryContext;
  /** The contract's ledger state after the call. */
  readonly finalQueryContext: QueryContext;
  readonly publicTranscript: readonly Op[];
  readonly input: AlignedValue;
  readonly output: AlignedValue;
  readonly privateTranscriptOutputs: readonly AlignedValue[];
  readonly zswapLocalState: EncodedZswapLocalState;
  /** Present only when this call was a cross-contract sub-call, so never on ledger 8. */
  readonly commCommData?: CommunicationCommitmentData | undefined;
}

/**
 * The result of executing one root circuit, as `ContractExecutable` consumes it.
 *
 * @remarks
 * `result`, `privateState` and `zswapLocalState` belong to the root contract; `trace` covers every
 * call made (callees first, root last), and `events` is the whole execution's log-event list.
 *
 * On a line that cannot emit events, `LogEvent` is instantiated as `never`, which makes `events`
 * a `never[]` — statically empty rather than merely empty at run time. That is what lets the same
 * `CallResult` type serve both eras while keeping the impossible case unconstructable.
 */
export interface ExecutionView<Result, PrivateState, Trace, EncodedZswapLocalState, LogEvent> {
  readonly result: Result;
  readonly trace: readonly Trace[];
  readonly privateState: PrivateState;
  readonly zswapLocalState: EncodedZswapLocalState;
  readonly events: readonly LogEvent[];
}

/**
 * Named parameters for building an execution context.
 *
 * @remarks
 * Named rather than positional because the two lines disagree on both arity and order — 0.19 takes
 * `(circuitId, address, …)` and 0.16 takes `(address, …)` with no circuit id at all. A named object
 * means adding an era cannot silently shift an argument into the wrong slot.
 *
 * `stateProvider` and `parentBlockHash` exist only for cross-contract calls. A binding whose line
 * has no `crossContractCall` must *reject* them rather than ignore them: silently dropping a
 * provider would make a cross-contract call appear to succeed against stale state.
 */
export interface ExecutionContextParams<PrivateState, ContractState, EncodedZswapLocalState, ContractStateProvider> {
  readonly circuitId: string;
  readonly address: string;
  readonly zswapLocalState: EncodedZswapLocalState;
  readonly contractState: ContractState;
  readonly privateState: PrivateState;
  readonly stateProvider?: ContractStateProvider | undefined;
  readonly parentBlockHash?: string | undefined;
}
