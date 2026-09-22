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

// Imported directly rather than through the binding: `sampleContractAddress` is a test helper, and
// widening the `CompactRuntime` facade for a fixture would be the wrong trade. Tests are exempt
// from the seam's `no-restricted-imports` rule for exactly this.
import { sampleContractAddress } from 'compact-runtime-ledger8';
import { describe, expect, it } from 'vitest';

import * as V0_16 from '../../src/effect/internal/runtime/v0_16.js';

/**
 * End-to-end proof that the **ledger 8 era can execute a contract** (midnight-sdk#387 phase 3,
 * feasibility question recorded on #388).
 *
 * @remarks
 * This is the test the phase-3 answer rests on. Everything else about ledger 8 — the era bindings,
 * the capability split, a future `/v8` entry — is only worth building if a contract compiled for
 * that era actually runs, and that could not be settled by reading `.d.ts` diffs. It needed the
 * real compiler and the real WASM.
 *
 * What it establishes:
 *
 * 1. `counter.compact` compiles **unchanged** under compactc 0.31.1 (Compact language 0.23.0) — no
 *    source downgrade was needed, despite the current sources targeting language 0.26.0.
 * 2. That artifact declares `checkRuntimeVersion('0.16.0')`, which pins the era pairing
 *    empirically rather than by inference from release dates: ledger 8 ↔ compact-runtime 0.16 ↔
 *    onchain-runtime-v3 ↔ compactc 0.31.x.
 * 3. A circuit runs to completion on the 0.16 line and produces a public transcript.
 * 4. The shape difference that `ContractExecutable` must absorb is exactly this: 0.16 returns
 *    `results.proofData`, while 0.19 returns a `context.callProofDataTrace`. Asserted in both
 *    directions below so the adapter has a pinned contract to build against.
 *
 * Runs only under `vitest.era8.config.ts`, whose alias points `@midnight-ntwrk/compact-runtime` at
 * the 0.16 line — see that file for why a generated artifact's bare import forces this.
 *
 * The fixture is generated, not committed (`yarn compact-v8`), so the suite skips rather than fails
 * when it is absent — mirroring how `managed/` is treated for the ledger 9 fixtures.
 */
const ERA8_COUNTER = resolve(import.meta.dirname, '../contract/managed-v8/counter');
const FIXTURE_PRESENT = existsSync(resolve(ERA8_COUNTER, 'contract/index.js'));

const describeWithFixture = FIXTURE_PRESENT ? describe : describe.skip;

describeWithFixture('ledger 8 era execution', () => {
  const loadContract = async () => {
    const module = await import(resolve(ERA8_COUNTER, 'contract/index.js'));
    return module as {
      Contract: new (witnesses: Record<string, unknown>) => {
        initialState: (context: unknown) => {
          currentContractState: V0_16.ContractState;
          currentPrivateState: unknown;
        };
        circuits: Record<string, (context: unknown) => { result: unknown; proofData: { publicTranscript: unknown[] } }>;
      };
    };
  };

  it('binds the compact-runtime 0.16 line', () => {
    expect(V0_16.line).toBe('0.16');
  });

  it('loads an artifact compiled for runtime 0.16 without a version mismatch', async () => {
    // The whole point of the aliased project: this import is what throws
    // `Version mismatch: compiled code expects 0.16.0, runtime is 0.19.0-rc.0` in the default one.
    const module = await loadContract();
    expect(module.Contract).toBeTypeOf('function');
  });

  it('constructs initial contract state on the ledger 8 runtime', async () => {
    const { Contract } = await loadContract();
    const contract = new Contract({
      private_increment: ({ privateState }: { privateState: unknown }) => [privateState, []]
    });

    const constructorContext = V0_16.createConstructorContext({ count: 0 }, '0'.repeat(64));
    const { currentContractState } = contract.initialState(constructorContext);

    // The circuits the ledger 9 fixture also exposes — so the era difference is in the plumbing,
    // not in what the contract offers.
    const operations = currentContractState.operations().map(String);
    expect(operations.sort()).toEqual(['decrement', 'increment', 'reset']);
  });

  it('runs a circuit and records a public transcript', async () => {
    const { Contract } = await loadContract();
    const contract = new Contract({
      private_increment: ({ privateState }: { privateState: unknown }) => [privateState, []]
    });

    const constructorContext = V0_16.createConstructorContext({ count: 0 }, '0'.repeat(64));
    const { currentContractState, currentPrivateState } = contract.initialState(constructorContext);

    // The 0.16 signature: contract address FIRST and no circuit id, against 0.19's one options
    // object. This shape difference is half of what the adapter absorbs.
    const circuitContext = V0_16.createCircuitContext(
      sampleContractAddress(),
      '0'.repeat(64),
      currentContractState,
      currentPrivateState
    );
    const results = contract.circuits.increment(circuitContext);

    expect(results.result).toEqual([]);
    expect(results.proofData.publicTranscript.length).toBeGreaterThan(0);
  });

  it('returns proof data on the results, not a call-proof trace on the context', async () => {
    // Pins the adapter's job from the 0.16 side. The mirror assertion for 0.19 lives in the type
    // tests (`RuntimeBinding.tst.ts`), which check `CircuitContext` carries `callProofDataTrace`
    // and `events` on that line and not on this one.
    const { Contract } = await loadContract();
    const contract = new Contract({
      private_increment: ({ privateState }: { privateState: unknown }) => [privateState, []]
    });

    const constructorContext = V0_16.createConstructorContext({ count: 0 }, '0'.repeat(64));
    const { currentContractState, currentPrivateState } = contract.initialState(constructorContext);
    const circuitContext = V0_16.createCircuitContext(
      sampleContractAddress(),
      '0'.repeat(64),
      currentContractState,
      currentPrivateState
    );
    const results = contract.circuits.increment(circuitContext);

    expect(results.proofData).toBeDefined();
    expect('callProofDataTrace' in (results as { context?: object }).context!).toBe(false);
  });
});
