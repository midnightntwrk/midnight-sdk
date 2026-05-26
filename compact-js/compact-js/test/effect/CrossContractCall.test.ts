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
import { vi } from 'vitest';
import { ChargedState, ContractState, type ContractStateProvider } from '@midnight-ntwrk/compact-runtime';
import { CompiledContract, Contract, ContractExecutable } from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { ContractDeploy, ContractState as LedgerContractState } from '@midnight-ntwrk/ledger-v8';
import { ConfigProvider, Effect, Layer } from 'effect';

import { CCCInnerContract, CCCOuterContract } from '../contract';

const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const ZERO_BLOCK_HASH = '0'.repeat(64);

const CCC_INNER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/cccInner');
const CCC_OUTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/cccOuter');

const asLedgerContractState = (state: ContractState): LedgerContractState =>
  LedgerContractState.deserialize(state.serialize());

const asContractState = (state: LedgerContractState): ContractState =>
  ContractState.deserialize(state.serialize());

const innerTestLayer = (configMap: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(CCC_INNER_ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(configMap, { pathDelim: '_' }).pipe(ConfigProvider.constantCase)))
  );

const outerTestLayer = (configMap: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(CCC_OUTER_ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(configMap, { pathDelim: '_' }).pipe(ConfigProvider.constantCase)))
  );

const innerExecutable = CompiledContract.make<CCCInnerContract>('CCCInner', CCCInnerContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_INNER_ASSETS_PATH),
  ContractExecutable.make
);

const outerExecutable = CompiledContract.make<CCCOuterContract>('CCCOuter', CCCOuterContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_OUTER_ASSETS_PATH),
  ContractExecutable.make
);

describe('cross-contract calls', () => {
  let inner: ContractExecutable.ContractExecutable<CCCInnerContract, undefined, unknown>;
  let outer: ContractExecutable.ContractExecutable<CCCOuterContract, undefined, unknown>;
  let innerDeploy: ContractDeploy;
  let outerDeploy: ContractDeploy;
  let chainStates: Map<string, ContractState>;

  beforeEach(async () => {
    inner = innerExecutable.pipe(ContractExecutable.provide(innerTestLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]]))));
    const innerResult = await inner.initialize(undefined).pipe(Effect.runPromise);
    innerDeploy = new ContractDeploy(asLedgerContractState(innerResult.public.contractState));

    outer = outerExecutable.pipe(ContractExecutable.provide(outerTestLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]]))));
    const outerResult = await outer.initialize(undefined, { bytes: Buffer.from(innerDeploy.address, 'hex') }).pipe(Effect.runPromise);
    outerDeploy = new ContractDeploy(asLedgerContractState(outerResult.public.contractState));

    chainStates = new Map([[innerDeploy.address, asContractState(innerDeploy.initialState)]]);
  });

  const outerContext = (stateProvider: ContractStateProvider) => ({
    address: ContractAddress.ContractAddress(outerDeploy.address),
    contractState: asContractState(outerDeploy.initialState),
    privateState: undefined,
    parentBlockHash: ZERO_BLOCK_HASH,
    stateProvider
  });

  it.effect('stateProvider is called to resolve callee state', () =>
    Effect.gen(function* () {
      const getContractState = vi.fn<ContractStateProvider['getContractState']>(
        async (_blockHash, address) => chainStates.get(address)
      );

      yield* outer.circuit(
        Contract.ProvableCircuitId<CCCOuterContract>('incrementInner'),
        outerContext({ getContractState }),
        1n
      );

      expect(getContractState).toHaveBeenCalledWith(expect.any(String), innerDeploy.address);
    })
  );

  it.effect('getInner reads callee state from stateProvider', () =>
    Effect.gen(function* () {
      const { public: { contractState } } = yield* inner.circuit(
        Contract.ProvableCircuitId<CCCInnerContract>('setV'),
        { address: ContractAddress.ContractAddress(innerDeploy.address), contractState: chainStates.get(innerDeploy.address)!, privateState: undefined },
        5n
      );
      chainStates.get(innerDeploy.address)!.data = new ChargedState(contractState);

      const { private: { result } } = yield* outer.circuit(
        Contract.ProvableCircuitId<CCCOuterContract>('getInner'),
        outerContext({ getContractState: async (_blockHash, address) => chainStates.get(address) })
      );

      expect(result).toBe(5n);
    })
  );
});
