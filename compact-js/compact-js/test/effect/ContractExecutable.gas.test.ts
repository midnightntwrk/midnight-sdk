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
import { CompiledContract, Contract, ContractExecutable, ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractState } from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { ContractDeploy, ContractState as LedgerContractState } from '@midnightntwrk/ledger-v9';
import { ConfigProvider, Effect, Layer } from 'effect';

import { CounterContract } from '../contract';

/**
 * **What a call costs, and how to cap it** (midnight-sdk#403's closing observation).
 *
 * @remarks
 * Both compact-runtime lines take a gas limit and report a running cost, and compact-js threaded
 * neither — so a consumer could neither measure a call's cost nor refuse to pay an unbounded one.
 *
 * The limit is deliberately **per query**, not per circuit: both lines hold it on the context and
 * hand the same value to every `query`, never decrementing it. `queryGasLimit` is named for that.
 * Measuring the whole execution is what `gasCosts` is for, and the two tests below are a pair — a
 * limit above every individual query passes while the zero limit fails, which is what shows the
 * value reaches the runtime at all rather than being dropped as it used to be.
 */
const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const NO_GAS = { readTime: 0n, computeTime: 0n, bytesWritten: 0n, bytesDeleted: 0n };
const AMPLE_GAS = { readTime: 10n ** 12n, computeTime: 10n ** 12n, bytesWritten: 10n ** 6n, bytesDeleted: 10n ** 6n };

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

describe('ContractExecutable gas', () => {
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
  let address: ContractAddress.ContractAddress;

  beforeEach(async () => {
    contract = counterContract.pipe(ContractExecutable.provide(testLayer));
    const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
    deployment = new ContractDeploy(LedgerContractState.deserialize(result.public.contractState.serialize()));
    address = ContractAddress.ContractAddress(deployment.address);
  });

  const increment = (queryGasLimit?: ContractExecutable.ContractExecutable.GasCost) =>
    contract.circuit(Contract.ProvableCircuitId<CounterContract>('increment'), {
      address,
      contractState: ContractState.deserialize(deployment.initialState.serialize()),
      privateState: { count: 0 },
      queryGasLimit
    });

  it.effect(
    'reports what each contract in the call tree spent',
    () =>
      Effect.gen(function* () {
        const result = yield* increment();

        // Keyed by contract, because that is how the runtime accumulates it — a contract called
        // twice has one entry covering both calls, which is why this is on the result rather than
        // on each `ContractCall`.
        const spent = result.gasCosts[address];
        expect(spent).toBeDefined();
        expect(spent!.computeTime).toBeGreaterThan(0n);
        expect(spent!.readTime).toBeGreaterThan(0n);
      }),
    30_000
  );

  it.effect(
    'executes unchanged under a limit no single query reaches',
    () =>
      Effect.gen(function* () {
        const result = yield* increment(AMPLE_GAS);

        expect(result.calls).toHaveLength(1);
        expect(result.privateState).toMatchObject({ count: 1 });
      }),
    30_000
  );

  it.effect(
    'fails with a runtime error when the limit leaves no budget',
    () =>
      Effect.gen(function* () {
        const error = yield* increment(NO_GAS).pipe(Effect.flip);

        // The runtime throws `ran out of gas budget` from inside the circuit call, which is already
        // within the executable's `Effect.tryPromise` — so exhaustion arrives as a typed failure
        // rather than as a defect the caller cannot see in the signature.
        expect(ContractRuntimeError.isRuntimeError(error)).toBe(true);
      }),
    30_000
  );
});
