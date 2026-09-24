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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { sampleContractAddress } from 'compact-runtime-ledger8';
import { describe, expect, it } from 'vitest';

import * as V0_16 from '../../src/effect/internal/runtime/v0_16.js';

/**
 * The ledger 8 **execution adapter**: the seam that lets one `ContractExecutable` drive both
 * runtime lines.
 *
 * @remarks
 * `ContractExecutable` is written against compact-runtime 0.19's call-tree model — it builds a
 * context with `createCircuitContext(circuitId, address, …)` and then reads
 * `context.callProofDataTrace`, `context.callContext` and `context.events`. None of that exists on
 * 0.16, which has a single flat frame and returns `results.proofData` instead.
 *
 * Rather than fork the executable, each binding supplies two functions —
 * `createExecutionContext` and `readExecution` — that present the same era-neutral view. On 0.19
 * both are thin pass-throughs. On 0.16 the context is built flat and the trace is *synthesised* as
 * a single entry, which is faithful because a line without cross-contract calls can only ever
 * produce one call.
 *
 * These tests pin the synthesis against the real WASM, because the interesting parts cannot be
 * checked by types: that the query context is captured *before* execution (the flat context
 * mutates in place, so reading it afterwards would report the final state as the initial one), and
 * that the metadata survives the generated contract's `{ ...contextOrig }` spread.
 */
const ERA8_COUNTER = resolve(import.meta.dirname, '../contract/managed-v8/counter');
const FIXTURE_PRESENT = existsSync(resolve(ERA8_COUNTER, 'contract/index.js'));

const describeWithFixture = FIXTURE_PRESENT ? describe : describe.skip;

describeWithFixture('ledger 8 execution adapter', () => {
  const CIRCUIT_ID = 'increment';

  const setup = async () => {
    const module = (await import(resolve(ERA8_COUNTER, 'contract/index.js'))) as {
      Contract: new (witnesses: Record<string, unknown>) => {
        initialState: (context: unknown) => {
          currentContractState: V0_16.ContractState;
          currentPrivateState: unknown;
        };
        circuits: Record<
          string,
          (context: unknown) => V0_16.CircuitResults<unknown, unknown> & { readonly proofData: V0_16.ProofData }
        >;
      };
    };
    const contract = new module.Contract({
      private_increment: ({ privateState }: { privateState: unknown }) => [privateState, []]
    });
    const constructorContext = V0_16.createConstructorContext({ count: 0 }, '0'.repeat(64));
    const { currentContractState, currentPrivateState } = contract.initialState(constructorContext);
    const address = sampleContractAddress();

    const executionContext = V0_16.createExecutionContext({
      circuitId: CIRCUIT_ID,
      address,
      zswapLocalState: V0_16.emptyZswapLocalState('0'.repeat(64)),
      contractState: currentContractState,
      privateState: currentPrivateState
    });

    return { contract, executionContext, address };
  };

  it('builds a context the generated ledger 8 contract accepts', async () => {
    const { contract, executionContext } = await setup();

    // 0.16's own type guard requires `currentQueryContext`; the adapter must not have replaced the
    // flat context with a wrapper, or the contract rejects it outright.
    expect(executionContext.currentQueryContext).toBeDefined();
    expect(() => contract.circuits[CIRCUIT_ID]!(executionContext)).not.toThrow();
  });

  it('synthesises a single-entry call trace carrying the circuit id and address', async () => {
    const { contract, executionContext, address } = await setup();
    const results = contract.circuits[CIRCUIT_ID]!(executionContext);

    const execution = V0_16.readExecution(results);

    // One entry, because a line with no cross-contract calls cannot produce more.
    expect(execution.trace).toHaveLength(1);
    expect(execution.trace[0]!.circuitId).toBe(CIRCUIT_ID);
    expect(execution.trace[0]!.contractAddress).toBe(address);
  });

  it('carries the proof data from results onto the trace entry', async () => {
    const { contract, executionContext } = await setup();
    const results = contract.circuits[CIRCUIT_ID]!(executionContext);

    const entry = V0_16.readExecution(results).trace[0]!;

    // 0.19 puts these on each `CallProofData`; on 0.16 they live on `results.proofData`, so the
    // adapter has to move them across or transaction assembly has nothing to prove.
    expect(entry.publicTranscript.length).toBeGreaterThan(0);
    expect(entry.input).toBeDefined();
    expect(entry.output).toBeDefined();
    expect(entry.privateTranscriptOutputs).toBeDefined();
  });

  it('captures the initial query context from before execution, not after', async () => {
    const { contract, executionContext } = await setup();
    // Snapshot the pre-execution state value for comparison. The flat 0.16 context is mutated in
    // place by the circuit, so an adapter that read `currentQueryContext` during `readExecution`
    // would hand back the *final* state as the initial one and silently corrupt transcript
    // partitioning.
    const before = executionContext.currentQueryContext.state.toString(true);

    const results = contract.circuits[CIRCUIT_ID]!(executionContext);
    const entry = V0_16.readExecution(results).trace[0]!;

    expect(entry.initialQueryContext.state.toString(true)).toBe(before);
    expect(entry.finalQueryContext.state.toString(true)).not.toBe(before);
  });

  it('reports no contract events, because the era cannot emit them', async () => {
    const { contract, executionContext } = await setup();
    const results = contract.circuits[CIRCUIT_ID]!(executionContext);

    const execution = V0_16.readExecution(results);

    // Not "none were emitted" but "none can be": onchain-runtime-v3 has no addressed, versioned
    // log payload and 0.16 accumulates nothing on the context.
    expect(execution.events).toEqual([]);
  });

  it('surfaces the root private and zswap state', async () => {
    const { contract, executionContext } = await setup();
    const results = contract.circuits[CIRCUIT_ID]!(executionContext);

    const execution = V0_16.readExecution(results);

    expect(execution.privateState).toBeDefined();
    expect(execution.zswapLocalState).toBeDefined();
  });

  it('refuses a cross-contract state provider rather than ignoring it', async () => {
    // The dangerous failure mode: silently dropping the provider would make a cross-contract call
    // look like it succeeded against stale state. 0.16 has no `crossContractCall` at all, so this
    // has to fail loudly at context construction.
    //
    // The cast is the point, not a workaround: this binding types its `stateProvider` slot as
    // `never`, so a typed caller cannot even express this. The run-time guard exists for callers
    // that reach the seam from JavaScript or through an `any`, and that is what is exercised here.
    expect(() =>
      V0_16.createExecutionContext({
        circuitId: CIRCUIT_ID,
        address: sampleContractAddress(),
        zswapLocalState: V0_16.emptyZswapLocalState('0'.repeat(64)),
        contractState: new V0_16.ContractState(),
        privateState: { count: 0 },
        stateProvider: { getContractState: async () => undefined } as never
      })
    ).toThrow(/cross-contract/i);
  });
});
