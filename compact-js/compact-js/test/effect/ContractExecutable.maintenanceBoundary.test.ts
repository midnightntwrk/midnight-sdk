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
  ContractConfigurationError,
  ContractExecutable
} from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractState, sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import {
  ContractDeploy,
  ContractState as LedgerContractState,
  MaintenanceUpdate
} from '@midnightntwrk/ledger-v9';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from 'effect';
import { vi } from 'vitest';

import { CounterContract } from '../contract';

const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const VALID_SIGNING_KEY = sampleSigningKey('schnorr').value;

// Passes `Contract.VerifierKey`'s `Brand.nominal` (which validates nothing) and is rejected by the
// ledger: the exact shape a user hits by pointing `--vk-path` at a `.prover` key.
const NOT_A_VERIFIER_KEY = Contract.VerifierKey(new Uint8Array([1, 2, 3]));

const asContractState = (contractState: LedgerContractState): ContractState =>
  ContractState.deserialize(contractState.serialize());

const testLayer = Layer.mergeAll(ZKFileConfiguration.layer(COUNTER_ASSETS_PATH), Configuration.layer).pipe(
  Layer.provideMerge(NodeContext.layer),
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromMap(
        new Map([
          ['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY],
          ['KEYS_SIGNING', VALID_SIGNING_KEY]
        ]),
        { pathDelim: '_' }
      ).pipe(ConfigProvider.constantCase)
    )
  )
);

/**
 * The contract maintenance path crosses both WASM boundaries outside any `Effect.try` callback, and
 * `createSignedMaintenanceUpdate`/`createMaintenanceAuthority` are synchronous `Either`-returning
 * helpers `yield*`-ed from an `Effect.gen` body — so an unguarded throw there is a *defect*, not a
 * failure. A defect escapes a consumer's `catchAll` over the declared error channel, and the CLI
 * (which runs with `disableErrorReporting`) exits non-zero printing nothing at all.
 *
 * Every test here asserts through `Cause.failureOption`: a defect leaves `Exit.isFailure` `true`
 * while `failureOption` goes `None`, so asserting on the exit alone would pass against exactly the
 * unwrapped calls these tests exist to catch.
 */
describe('ContractExecutable maintenance boundary', () => {
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

  const contractContext = () => ({
    address: ContractAddress.ContractAddress(deployment.address),
    contractState: asContractState(deployment.initialState)
  });

  // Asserts the two halves separately so a regression reads unambiguously: `isDie` names the
  // defect, and the guard names the error type the maintenance path is declared to fail with.
  const expectConfigurationFailure = <A, E>(exit: Exit.Exit<A, E>): void => {
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(false);
    const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
    expect(ContractConfigurationError.isConfigurationError(failure)).toBe(true);
  };

  beforeEach(async () => {
    contract = counterContract.pipe(ContractExecutable.provide(testLayer));
    const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
    deployment = new ContractDeploy(LedgerContractState.deserialize(result.public.contractState.serialize()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect(
    'fails in the error channel when the ledger rejects the verifier key of an add-or-replace update',
    () =>
      Effect.gen(function* () {
        const exit = yield* contract
          .addOrReplaceContractOperation(
            Contract.ProvableCircuitId<CounterContract>('increment'),
            NOT_A_VERIFIER_KEY,
            contractContext()
          )
          .pipe(Effect.exit);

        expectConfigurationFailure(exit);
      }),
    30_000
  );

  it.effect(
    'fails in the error channel when the ledger rejects the maintenance update construction',
    () =>
      Effect.gen(function* () {
        // The counter read at the `MaintenanceUpdate` construction site, which is the runtime
        // getter that traps on a state built against a second WASM instantiation.
        vi.spyOn(ContractState.prototype, 'maintenanceAuthority', 'get').mockImplementationOnce(() => {
          throw new Error('memory access out of bounds');
        });

        const exit = yield* contract
          .removeContractOperation(Contract.ProvableCircuitId<CounterContract>('increment'), contractContext())
          .pipe(Effect.exit);

        expectConfigurationFailure(exit);
      }),
    30_000
  );

  it.effect(
    'fails in the error channel when the ledger rejects the maintenance update signature',
    () =>
      Effect.gen(function* () {
        vi.spyOn(MaintenanceUpdate.prototype, 'addSignature').mockImplementationOnce(() => {
          throw new Error('invalid type: byte array, expected a string');
        });

        const exit = yield* contract
          .removeContractOperation(Contract.ProvableCircuitId<CounterContract>('increment'), contractContext())
          .pipe(Effect.exit);

        expectConfigurationFailure(exit);
      }),
    30_000
  );

  it.effect(
    'fails in the error channel when the runtime rejects reading an operation during initialization',
    () =>
      Effect.gen(function* () {
        vi.spyOn(ContractState.prototype, 'operation').mockImplementationOnce(() => {
          throw new Error('memory access out of bounds');
        });

        const exit = yield* contract.initialize({ count: 0 }).pipe(Effect.exit);

        expectConfigurationFailure(exit);
      }),
    30_000
  );

  it.effect(
    'fails in the error channel when the runtime rejects setting the maintenance authority',
    () =>
      Effect.gen(function* () {
        vi.spyOn(ContractState.prototype, 'maintenanceAuthority', 'set').mockImplementationOnce(() => {
          throw new Error('expected instance of ContractMaintenanceAuthority');
        });

        const exit = yield* contract.initialize({ count: 0 }).pipe(Effect.exit);

        expectConfigurationFailure(exit);
      }),
    30_000
  );
});
