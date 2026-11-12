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
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import {
  CompiledContract,
  Contract,
  ContractExecutable,
  ContractRuntimeError
} from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ChargedState, ContractState, decodeZswapLocalState } from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { ContractDeploy, ContractState as LedgerContractState } from '@midnightntwrk/ledger-v9';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from 'effect';
import { vi } from 'vitest';

import { CounterContract } from '../contract';

// Wrap `decodeZswapLocalState` so it delegates to the real implementation by default; the test
// below overrides a single call. The compact-runtime seam re-exports this binding, so mocking the
// package reaches `CompactRuntime.decodeZswapLocalState` too — the same technique
// `CrossContractCall.test.ts` uses for the ledger.
vi.mock('@midnight-ntwrk/compact-runtime', async (importActual) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importActual<typeof import('@midnight-ntwrk/compact-runtime')>();
  return { ...actual, decodeZswapLocalState: vi.fn(actual.decodeZswapLocalState) };
});

// Captured before any test queues an override, so `afterEach` can restore the delegating default.
const delegatingDecodeZswapLocalState = vi.mocked(decodeZswapLocalState).getMockImplementation()!;

const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';

const asContractState = (contractState: LedgerContractState): ContractState =>
  ContractState.deserialize(contractState.serialize());

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
 * The compact-runtime seam only changes where a binding is resolved — it does not make the call
 * safe. These pin that `ContractExecutable`'s declared error channel stays sound when the runtime
 * rejects a value, rather than the rejection escaping as a defect that a consumer's `catchAll`
 * cannot intercept.
 */
describe('ContractExecutable runtime boundary', () => {
  const counterContract = CompiledContract.make<CounterContract>('Counter', CounterContract).pipe(
    CompiledContract.withWitnesses({
      private_increment: ({ privateState }) => [{ count: privateState.count + 1 }, []]
    }),
    CompiledContract.withCompiledFileAssets(COUNTER_ASSETS_PATH),
    ContractExecutable.make
  );

  let contract: ContractExecutable.ContractExecutable<
    CounterContract,
    Contract.Contract.PrivateState<CounterContract>,
    unknown
  >;
  let deployment: ContractDeploy;

  // `mockClear` alone is not enough, and neither is `vi.restoreAllMocks()`: neither drains a
  // `mockImplementationOnce` queue, and `restoreAllMocks` does not reach a `vi.fn` at all. A test
  // that fails before consuming its queued throw would leave it armed for whichever test runs
  // next, surfacing as a confusing failure in an unrelated case. `mockReset` drains the queue but
  // also drops the delegating implementation, so it is put back.
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(decodeZswapLocalState).mockReset();
    vi.mocked(decodeZswapLocalState).mockImplementation(delegatingDecodeZswapLocalState);
  });

  beforeEach(async () => {
    contract = counterContract.pipe(ContractExecutable.provide(testLayer));
    const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
    deployment = new ContractDeploy(LedgerContractState.deserialize(result.public.contractState.serialize()));
  });

  it.effect(
    'fails in the error channel, not as a defect, when the runtime rejects the resulting zswap local state',
    () =>
      Effect.gen(function* () {
        vi.mocked(decodeZswapLocalState).mockImplementationOnce(() => {
          throw new Error('expected instance of ZswapLocalState');
        });

        const exit = yield* contract
          .circuit(Contract.ProvableCircuitId<CounterContract>('increment'), {
            address: ContractAddress.ContractAddress(deployment.address),
            contractState: asContractState(deployment.initialState),
            privateState: { count: 0 }
          })
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBe(true);
        // `Cause.failureOption` is what separates the two outcomes: a defect makes this `None`
        // while `Exit.isFailure` stays `true`, so asserting on the exit alone would pass against
        // the unwrapped call this test exists to catch.
        const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
        expect(ContractRuntimeError.isRuntimeError(failure)).toBe(true);
      }),
    30_000
  );

  it.effect(
    'fails in the error channel, not as a defect, when the ledger rejects reading a call\'s final state',
    () =>
      Effect.gen(function* () {
        // `entry.finalQueryContext.state.state` is two chained wasm-bindgen getters read while
        // mapping the trace — `ChargedState.state` compiles to `wasm.chargedstate_state(...)`, so
        // it traps on a freed or foreign pointer. It sits in an `Effect.gen` body inside
        // `Effect.forEach`, where a throw is a defect: the terminating `Effect.mapError` maps the
        // error channel only. Its sibling on the same object (`comIndices`, in
        // `partitionAllTranscripts`) is already held inside `Ledger.tryConvert`.
        //
        // A single-call circuit reads this getter three times, on three distinct objects, in a
        // fixed order: building the execution context, converting the initial query context in
        // `partitionAllTranscripts` (both already inside a wrapper), and finally the trace mapping.
        // Hence the counter — `mockImplementationOnce` would be consumed by the first read and
        // this test would pass against exactly the unwrapped call it exists to catch.
        const chargedState = Object.getOwnPropertyDescriptor(ChargedState.prototype, 'state')!;
        let reads = 0;
        vi.spyOn(ChargedState.prototype, 'state', 'get').mockImplementation(function (this: ChargedState) {
          if (++reads >= 3) {
            throw new Error('null pointer passed to rust');
          }
          return chargedState.get!.call(this);
        });

        const exit = yield* contract
          .circuit(Contract.ProvableCircuitId<CounterContract>('increment'), {
            address: ContractAddress.ContractAddress(deployment.address),
            contractState: asContractState(deployment.initialState),
            privateState: { count: 0 }
          })
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(false);
        const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
        expect(ContractRuntimeError.isRuntimeError(failure)).toBe(true);
      }),
    30_000
  );

  it.effect(
    'reports a rejected contract constructor as an initialization failure, not a coin public key one',
    () =>
      Effect.gen(function* () {
        // `initialState` runs the user's constructor and witnesses. Folded into one `try` with
        // `createConstructorContext`, every non-`CompactError` it throws — a witness with a typo, a
        // `throw 'insufficient balance'` — was reported as 'Failed to configure constructor context
        // with coin public key', sending a dApp author to check their wallet configuration.
        vi.spyOn(CounterContract.prototype, 'initialState').mockImplementationOnce(() => {
          throw new Error("witness 'private_increment' is not a function");
        });

        const exit = yield* contract.initialize({ count: 0 }).pipe(Effect.exit);

        expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(false);
        const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
        expect(ContractRuntimeError.isRuntimeError(failure)).toBe(true);
        expect((failure as ContractRuntimeError.ContractRuntimeError).message).toContain(
          'Failed to initialize contract'
        );
      }),
    30_000
  );
});
