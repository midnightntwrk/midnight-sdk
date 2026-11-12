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
  ContractExecutable,
  Ledger
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

// Delegates to the real implementation by default; one test overrides a single call. The
// compact-runtime seam re-exports this binding, so mocking the package reaches
// `CompactRuntime.sampleSigningKey` too — the technique `ContractExecutable.boundary.test.ts` uses.
vi.mock('@midnight-ntwrk/compact-runtime', async (importActual) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importActual<typeof import('@midnight-ntwrk/compact-runtime')>();
  return { ...actual, sampleSigningKey: vi.fn(actual.sampleSigningKey) };
});

const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const VALID_SIGNING_KEY = sampleSigningKey('schnorr').value;

// Captured before any test queues an override, so `afterEach` can restore the delegating default.
// `vi.restoreAllMocks()` does not reach a `vi.fn`, and neither it nor `mockClear` drains a
// `mockImplementationOnce` queue: an effect that fails before consuming its queued throw would
// leave it armed for whichever test runs next.
const delegatingSampleSigningKey = vi.mocked(sampleSigningKey).getMockImplementation()!;

// Passes `Contract.VerifierKey`'s `Brand.nominal` (which validates nothing) and is rejected by the
// ledger: the exact shape a user hits by pointing `--vk-path` at a `.prover` key.
const NOT_A_VERIFIER_KEY = Contract.VerifierKey(new Uint8Array([1, 2, 3]));

const asContractState = (contractState: LedgerContractState): ContractState =>
  ContractState.deserialize(contractState.serialize());

const makeTestLayer = (config: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(COUNTER_ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(config, { pathDelim: '_' }).pipe(ConfigProvider.constantCase)
      )
    )
  );

const testLayer = makeTestLayer(
  new Map([
    ['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY],
    ['KEYS_SIGNING', VALID_SIGNING_KEY]
  ])
);

// Omits `KEYS_SIGNING`, so `keyConfig.getSigningKey()` returns `None` — the only way to reach
// `createMaintenanceAuthority`'s `onNone` branch, which samples a key of its own.
const testLayerWithoutSigningKey = makeTestLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]]));

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

  // Asserts the three halves separately so a regression reads unambiguously: `isDie` names the
  // defect, the guard names the error type the maintenance path is declared to fail with, and
  // `message` names *which* guard caught it. Every guard on this path produces the same error
  // type, so without the message each test proves only "some guard caught it" — a guard whose
  // `try` has swallowed its neighbour's failure still passes. The CLI prints this message first
  // and the cause under a `(cause)` header, so a wrong lead here is what the user reads first.
  const expectConfigurationFailure = <A, E>(exit: Exit.Exit<A, E>, expectedMessage: string): void => {
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(false);
    const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
    expect(ContractConfigurationError.isConfigurationError(failure)).toBe(true);
    expect((failure as ContractConfigurationError.ContractConfigurationError).message).toContain(expectedMessage);
  };

  beforeEach(async () => {
    contract = counterContract.pipe(ContractExecutable.provide(testLayer));
    const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
    deployment = new ContractDeploy(LedgerContractState.deserialize(result.public.contractState.serialize()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(sampleSigningKey).mockReset();
    vi.mocked(sampleSigningKey).mockImplementation(delegatingSampleSigningKey);
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

        expectConfigurationFailure(exit, 'Failed to build the contract maintenance update');
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

        expectConfigurationFailure(exit, 'Failed to create a maintenance update for contract');
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

        // `addSignature` rejects for reasons that have nothing to do with the key material — a
        // `Signature` built against a second copy of the ledger package throws
        // `expected instance of Signature` here. Reporting those as a signing-key fault sends a
        // consumer with a duplicated dependency off to audit their keys, which is precisely the
        // failure the era seam exists to make legible.
        expectConfigurationFailure(exit, 'Failed to attach the signature to the maintenance update');
      }),
    30_000
  );

  it.effect(
    'fails in the error channel when the ledger rejects reading the data to sign',
    () =>
      Effect.gen(function* () {
        // A wasm-bindgen getter: it throws `null pointer passed to rust` if the update has already
        // been consumed. Nothing about that failure involves the signing key either.
        vi.spyOn(MaintenanceUpdate.prototype, 'dataToSign', 'get').mockImplementationOnce(() => {
          throw new Error('null pointer passed to rust');
        });

        const exit = yield* contract
          .removeContractOperation(Contract.ProvableCircuitId<CounterContract>('increment'), contractContext())
          .pipe(Effect.exit);

        expectConfigurationFailure(exit, 'Failed to read the data to sign from the maintenance update');
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

        expectConfigurationFailure(exit, 'Failed to read the operation for circuit');
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

        expectConfigurationFailure(exit, 'Failed to set the maintenance authority');
      }),
    30_000
  );

  it.effect(
    'samples a maintenance authority signing key tagged with the era scheme when none is configured',
    () =>
      Effect.gen(function* () {
        // Every other test in this file runs under a config provider that sets `KEYS_SIGNING`, so
        // `createMaintenanceAuthority`'s `Option.match` always takes `onSome: identity` and its
        // `onNone` branch never executes at all. This is the layer that reaches it. The tag matters
        // as much as the key: `SigningKey.make` otherwise defaults to platform-js's own constant,
        // which would label a non-schnorr sample as schnorr and sign with the wrong scheme while
        // still passing the allowlist check.
        const result = yield* counterContract
          .pipe(ContractExecutable.provide(testLayerWithoutSigningKey))
          .initialize({ count: 0 });

        expect(result.private.signingKey.tag).toBe(Ledger.era.defaultCmaSignatureKind);
      }),
    30_000
  );

  it.effect(
    'fails in the error channel when no signing key is configured and the runtime rejects sampling one',
    () =>
      Effect.gen(function* () {
        // The guard inside that `onNone` branch: unreached by every other test here, so deleting it
        // outright would not fail one of them.
        vi.mocked(sampleSigningKey).mockImplementationOnce(() => {
          throw new Error('unsupported signature scheme');
        });

        const exit = yield* counterContract
          .pipe(ContractExecutable.provide(testLayerWithoutSigningKey))
          .initialize({ count: 0 })
          .pipe(Effect.exit);

        expectConfigurationFailure(exit, 'Failed to sample a');
      }),
    30_000
  );
});
