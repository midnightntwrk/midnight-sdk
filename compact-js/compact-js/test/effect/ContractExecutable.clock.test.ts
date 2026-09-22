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
import { beforeEach, describe, expect, it } from '@effect/vitest';
import { CompiledContract, Contract, ContractExecutable } from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { ContractDeploy, ContractState as LedgerContractState } from '@midnightntwrk/ledger-v9';
import { ConfigProvider, Effect, Layer, TestClock } from 'effect';

import { CounterContract } from '../contract';

/**
 * **Where a call's execution clock comes from** (midnight-sdk#403).
 *
 * @remarks
 * `block.secondsSinceEpoch` is a wall-clock reading, and midnight-sdk#400 put `block` on the public
 * result — so without a way to pin it, every `CallResult` a consumer records differs on the next
 * run. Both compact-runtime lines accept an optional `time` and default it to
 * `Math.floor(Date.now() / 1_000)`; compact-js simply never passed one.
 *
 * It is taken from the effect's own `Clock` rather than from a new member on `CircuitContext`.
 * `Clock` is one of Effect's default services, so this costs no public API and no change to
 * `circuit`'s signature: production behaviour is identical (the live clock *is* `Date.now()`), and
 * a consumer recording fixtures pins it the way they pin everything else — with a layer at the
 * composition root. The read merely moves from inside compact-runtime, where nothing could reach
 * it, to compact-js, where the caller already controls the runtime.
 *
 * `block` has no other clock-driven member: `lastBlockTime` is `0n` and `secondsSinceEpochErr` is
 * `0` on this path, so pinning this one value makes the whole of `block` reproducible.
 */
const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const FIXED_MILLIS = 1_700_000_000_000;
const FIXED_SECONDS = 1_700_000_000n;

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

describe('ContractExecutable execution clock', () => {
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

  beforeEach(async () => {
    contract = counterContract.pipe(ContractExecutable.provide(testLayer));
    const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
    deployment = new ContractDeploy(LedgerContractState.deserialize(result.public.contractState.serialize()));
  });

  const increment = () =>
    contract.circuit(Contract.ProvableCircuitId<CounterContract>('increment'), {
      address: ContractAddress.ContractAddress(deployment.address),
      contractState: ContractState.deserialize(deployment.initialState.serialize()),
      privateState: { count: 0 }
    });

  it.effect(
    'stamps the call\'s block clock from the effect\'s own Clock',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(FIXED_MILLIS);

        const result = yield* increment();

        // Milliseconds in, seconds out: the runtime's `time` parameter is seconds since the epoch,
        // and reading it back off `block` is what proves the conversion happens on the way in
        // rather than being left to the caller.
        expect(result.calls[0]!.public.block.secondsSinceEpoch).toBe(FIXED_SECONDS);
      }),
    30_000
  );

  it.effect(
    'reads the clock afresh for each call rather than once per executable',
    () =>
      Effect.gen(function* () {
        // Two calls on one executable, an hour apart on the injected clock. Asserting they *differ
        // by exactly that hour* is what makes this non-vacuous: were the clock still coming from
        // `Date.now()` inside compact-runtime, both readings would instead be the same wall-clock
        // second and neither would match. It also pins that the value is not captured once when the
        // executable is built, which would make the second recording wrong rather than merely
        // unreproducible.
        yield* TestClock.setTime(FIXED_MILLIS);
        const first = yield* increment();
        yield* TestClock.setTime(FIXED_MILLIS + 3_600_000);
        const second = yield* increment();

        expect(first.calls[0]!.public.block.secondsSinceEpoch).toBe(FIXED_SECONDS);
        expect(second.calls[0]!.public.block.secondsSinceEpoch).toBe(FIXED_SECONDS + 3_600n);
      }),
    30_000
  );

  it.live(
    'falls back to the wall clock when nothing overrides it',
    () =>
      Effect.gen(function* () {
        const before = BigInt(Math.floor(Date.now() / 1_000));

        const result = yield* increment();

        // Taking the clock from the context must not change the default. `it.live` runs against the
        // real `Clock`, which is the same reading compact-runtime would have taken itself — so a
        // consumer who provides nothing sees exactly the previous behaviour.
        expect(result.calls[0]!.public.block.secondsSinceEpoch).toBeGreaterThanOrEqual(before);
      }),
    30_000
  );
});
