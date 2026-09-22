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

import { resolve } from 'node:path';

import { NodeContext } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { CompiledContract, Contract, ContractExecutable, ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import {
  ChargedState,
  ContractState,
  emptyZswapLocalState,
  QueryContext,
  sampleContractAddress,
  StateValue
} from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from 'effect';

import { type CounterContract } from '../contract';

/**
 * **Which query context each of a call's partition inputs comes from** (midnight-sdk#400).
 *
 * @remarks
 * `ContractCallPublic` reports `block` and `effects` from the call's **pre**-execution query context
 * and `comIndices` from its **post**-execution one — the split `partitionAllTranscripts` makes when
 * it builds a pre-transcript, and the one a consumer redoing that partition in another ledger era
 * has to make too. Reading any of the three from the wrong context is silent: the value is still
 * plain data of the right type, the partition still succeeds, and only a cross-era recomposition
 * notices.
 *
 * No compiled fixture can show the difference. `comIndices` is populated by shielded coin receives,
 * and none of the fixtures in `test/contract/` performs one — so on every real execution available
 * here the two contexts' commitment maps are both empty and an assertion over them passes whichever
 * context it reads. Hence the stand-in below: it fabricates a *trace* whose two contexts differ
 * observably, and lets the real ledger partitioner, the real conversions and the real assembly run
 * over it. The query contexts themselves are built from a real runtime `QueryContext`, so every
 * value that crosses the WASM boundary is one the ledger actually accepts.
 *
 * `ContractExecutable.boundary.test.ts` covers the same wrapper's siblings; the rejection case here
 * belongs with the fixture that can trigger it deterministically.
 */
const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
// A 32-byte coin commitment, hex encoded — the key type of `QueryContext.comIndices`.
const COMMITMENT = 'ab'.repeat(32);
const COMMITMENT_INDEX = 7n;
// Two clocks far enough apart that neither could be the other's wall-clock reading.
const PRE_EXECUTION_SECONDS = 1_000_000_000n;
const POST_EXECUTION_SECONDS = 2_000_000_000n;

const testLayer = Layer.mergeAll(ZKFileConfiguration.layer(COUNTER_ASSETS_PATH), Configuration.layer).pipe(
  Layer.provideMerge(NodeContext.layer),
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromMap(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]]), { pathDelim: '_' }).pipe(
        ConfigProvider.constantCase
      )
    )
  )
);

/**
 * A pair of query-context stand-ins that differ in every value the executable reads off them.
 *
 * Spread from a real runtime `QueryContext`'s own `block` and `effects` rather than written from
 * scratch: both are assigned onto a ledger `QueryContext` by `Ledger.fromRuntimeQueryContext`
 * through a WASM setter, which rejects an incomplete shape. `state` and `address` stay the real
 * object's, because the assembly reads `finalQueryContext.state.state` and converts it for real.
 */
const queryContexts = (address: string) => {
  const real = new QueryContext(new ChargedState(StateValue.newNull()), address);
  return {
    initialQueryContext: {
      state: real.state,
      address: real.address,
      block: { ...real.block, secondsSinceEpoch: PRE_EXECUTION_SECONDS },
      effects: real.effects,
      // Empty on the pre-execution side: a call discovers commitments while it runs, so reading
      // this context would be the plausible-looking mistake.
      comIndices: new Map<string, bigint>()
    },
    finalQueryContext: {
      state: real.state,
      address: real.address,
      block: { ...real.block, secondsSinceEpoch: POST_EXECUTION_SECONDS },
      effects: real.effects,
      comIndices: new Map([[COMMITMENT, COMMITMENT_INDEX]])
    }
  };
};

/**
 * A contract whose circuit returns a hand-built 0.19 execution result rather than running anything.
 * The same technique `CrossContractCall.test.ts` uses for its no-zswap stand-in: everything
 * downstream of `readExecution` — conversions, partitioning, assembly — is the real implementation.
 */
const standInContract = (address: string, contexts: ReturnType<typeof queryContexts>) =>
  class {
    witnesses = {};
    circuits = {};
    impureCircuits = {};
    provableCircuits = {
      probe: async () => ({
        result: undefined,
        context: {
          callProofDataTrace: [
            {
              circuitId: 'probe',
              contractAddress: address,
              ...contexts,
              publicTranscript: [],
              input: { value: [], alignment: [] },
              output: { value: [], alignment: [] },
              privateTranscriptOutputs: [],
              zswapLocalState: emptyZswapLocalState(VALID_COIN_PUBLIC_KEY),
              commCommData: undefined
            }
          ],
          callContext: {
            currentPrivateState: { count: 0 },
            currentZswapLocalState: emptyZswapLocalState(VALID_COIN_PUBLIC_KEY)
          },
          events: []
        }
      })
    };
  };

const executableOver = (contract: ReturnType<typeof standInContract>) =>
  CompiledContract.make<CounterContract>('PartitionInputs', contract as unknown as typeof CounterContract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(COUNTER_ASSETS_PATH),
    ContractExecutable.make,
    ContractExecutable.provide(testLayer)
  );

const probe = (contract: ReturnType<typeof standInContract>, address: string) =>
  executableOver(contract).circuit(Contract.ProvableCircuitId<CounterContract>('probe' as never), {
    address: ContractAddress.ContractAddress(address),
    // A real, empty contract state: `createExecutionContext` builds a genuine 0.19 circuit context
    // before the stand-in circuit is called, and rejects anything else. Nothing reads it — the
    // fabricated trace below carries the contexts the assertions are about.
    contractState: new ContractState(),
    privateState: { count: 0 }
  });

describe('ContractCallPublic partition inputs', () => {
  it.effect('reports the block context from before the call, not after it', () =>
    Effect.gen(function* () {
      const address = sampleContractAddress();
      const contexts = queryContexts(address);

      const result = yield* probe(standInContract(address, contexts), address);

      // A pre-transcript describes the state a call ran *against*, so the block context that
      // belongs on it is the one the call started with.
      expect(result.calls[0]!.public.block.secondsSinceEpoch).toBe(PRE_EXECUTION_SECONDS);
      expect(result.calls[0]!.public.block.secondsSinceEpoch).not.toBe(POST_EXECUTION_SECONDS);
    })
  );

  it.effect('reports the commitment indices from after the call, not before it', () =>
    Effect.gen(function* () {
      const address = sampleContractAddress();
      const contexts = queryContexts(address);

      const result = yield* probe(standInContract(address, contexts), address);

      // The mirror image of `block`: commitments are what the call *discovered*, and they are what
      // the partitioner matches callers to callees on. Taking them from the pre-execution context
      // would hand a consumer an empty map and a partition they cannot reproduce.
      expect(result.calls[0]!.public.comIndices.size).toBe(1);
      expect(result.calls[0]!.public.comIndices.get(COMMITMENT)).toBe(COMMITMENT_INDEX);
    })
  );

  it.effect('fails in the error channel, not as a defect, when reading the partition inputs is rejected', () =>
    Effect.gen(function* () {
      const address = sampleContractAddress();
      const contexts = queryContexts(address);
      // `block` is a wasm-bindgen getter on a live `QueryContext`, so it traps on a freed or
      // foreign pointer rather than returning. The read sits in an `Effect.gen` body inside
      // `Effect.forEach`, where a throw is a defect — and the terminating `Effect.mapError` maps
      // the error channel only, so an unwrapped read would make the declared
      // `ContractExecutionError` channel unsound.
      //
      // Exactly two reads of this context's `block` happen, in a fixed order: the conversion in
      // `partitionAllTranscripts` (already inside a wrapper), then the assembly read under test.
      // Throwing on the first would prove nothing about the second, hence the counter — and the
      // count is reliable here only because nothing executes: a real circuit reads `block` from
      // the VM an unspecified number of times.
      let reads = 0;
      const block = contexts.initialQueryContext.block;
      Object.defineProperty(contexts.initialQueryContext, 'block', {
        get: () => {
          if (++reads >= 2) {
            throw new Error('null pointer passed to rust');
          }
          return block;
        }
      });

      const exit = yield* probe(standInContract(address, contexts), address).pipe(Effect.exit);

      // `Cause.failureOption` is what separates the two outcomes: a defect leaves this `None` while
      // `Exit.isFailure` stays `true`, so asserting on the exit alone would pass against exactly
      // the unwrapped read this test exists to catch.
      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(false);
      const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
      expect(ContractRuntimeError.isRuntimeError(failure)).toBe(true);
      expect(String((failure as ContractRuntimeError.ContractRuntimeError).cause)).toContain('partition inputs');
    })
  );
});
