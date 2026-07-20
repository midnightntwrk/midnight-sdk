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
import { beforeEach,describe, expect, it } from '@effect/vitest';
import {
  CompiledContract,
  Contract,
  ContractExecutable} from '@midnight-ntwrk/compact-js/effect';
import * as ContractConfigurationError from '@midnight-ntwrk/compact-js/effect/ContractConfigurationError';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractState, sampleSigningKey } from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import {
  ContractDeploy,
  ContractState as LedgerContractState,
  type ReplaceAuthority,
  type VerifierKeyInsert,
  type VerifierKeyRemove,
  verifySignature
} from '@midnightntwrk/ledger-v9';
import { ConfigProvider, Effect, Layer, Option } from 'effect';

import { CounterContract } from '../contract';

const COUNTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/counter');

const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const INVALID_COIN_PUBLIC_KEY = 'INVALIDd9da5fcd4c601';
// Ledger v9 signing keys are tagged objects; the configuration layer expects the bare hex string.
const VALID_SIGNING_KEY = sampleSigningKey('schnorr').value;
const VALID_ECDSA_SIGNING_KEY = sampleSigningKey('ecdsa').value;

const asLedgerContractState = (contractState: ContractState): LedgerContractState =>
  LedgerContractState.deserialize(contractState.serialize());

const asContractState = (contractState: LedgerContractState): ContractState =>
  ContractState.deserialize(contractState.serialize());

const testLayer = (configMap: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(COUNTER_ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(
      Layer.setConfigProvider(ConfigProvider.fromMap(configMap, { pathDelim: '_' }).pipe(ConfigProvider.constantCase))
    )
  );

describe('ContractExecutable', () => {
  const initialPS = { count: 0 };
  const counterContract = CompiledContract.make<CounterContract>('Counter', CounterContract).pipe(
    CompiledContract.withWitnesses({
      private_increment: ({ privateState }) => [{ count: privateState.count + 1 }, []]
    }),
    CompiledContract.withCompiledFileAssets(COUNTER_ASSETS_PATH),
    ContractExecutable.make
  );

  describe('initialize', () => {
    it.effect('should initialize a new instance', () =>
      Effect.gen(function* () {
        const contract = counterContract.pipe(
          ContractExecutable.provide(testLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]])))
        );
        const result = yield* contract.initialize(initialPS);

        expect(result.public.contractState).toBeDefined();
        expect(result.public.contractState.data).toBeDefined();
        expect(result.private.signingKey).toBeDefined();
        expect(result.private.privateState).toMatchObject(initialPS);
      })
    );

    it.effect('should return the given signing key', () =>
      Effect.gen(function* () {
        const contract = counterContract.pipe(
          ContractExecutable.provide(
            testLayer(
              new Map([
                ['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY],
                ['KEYS_SIGNING', VALID_SIGNING_KEY]
              ])
            )
          )
        );
        const result = yield* contract.initialize(initialPS);

        expect(result.public.contractState).toBeDefined();
        expect(result.private.signingKey).toEqual(SigningKey.make(VALID_SIGNING_KEY));
      })
    );

    it.effect('should derive an ECDSA maintenance authority from an ECDSA signing key', () =>
      Effect.gen(function* () {
        const contract = counterContract.pipe(
          ContractExecutable.provide(
            testLayer(
              new Map([
                ['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY],
                ['KEYS_SIGNING', VALID_ECDSA_SIGNING_KEY],
                ['KEYS_SIGNING_KIND', 'ecdsa']
              ])
            )
          )
        );
        const result = yield* contract.initialize(initialPS);

        expect(result.private.signingKey).toEqual(SigningKey.make(VALID_ECDSA_SIGNING_KEY, 'ecdsa'));
        // The CMA verifying key must be derived with the caller-supplied scheme, not coerced to Schnorr.
        const committee = asLedgerContractState(result.public.contractState).maintenanceAuthority.committee;
        expect(committee).toHaveLength(1);
        expect(committee[0].tag).toEqual('ecdsa');
      })
    );

    it.effect('should fail with an invalid CoinPublicKey', () =>
      Effect.gen(function* () {
        const contract = counterContract.pipe(
          ContractExecutable.provide(testLayer(new Map([['KEYS_COIN_PUBLIC', INVALID_COIN_PUBLIC_KEY]])))
        );
        const error = yield* contract.initialize({ count: 0 }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(ContractConfigurationError.ContractConfigurationError);
      })
    );
  });

  describe('circuits', () => {
    let contract: ContractExecutable.ContractExecutable<
      CounterContract,
      Contract.Contract.PrivateState<CounterContract>,
      unknown
    >;
    let deployment: ContractDeploy;

    // Create and initialize a new contract instance for each test.
    beforeEach(async () => {
      contract = counterContract.pipe(
        ContractExecutable.provide(testLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]])))
      );
      const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
      deployment = new ContractDeploy(asLedgerContractState(result.public.contractState));
    });

    it('should return identifiers of provable circuits', () => {
      const circuitIds = contract.getProvableCircuitIds();

      expect(circuitIds.length).toBeGreaterThan(0);
    });

    it.effect('should return updated contract state', () =>
      Effect.gen(function* () {
        const result = yield* contract.circuit(Contract.ProvableCircuitId<CounterContract>('increment'), {
          address: ContractAddress.ContractAddress(deployment.address),
          contractState: asContractState(deployment.initialState),
          privateState: { count: 0 }
        });

        expect(result.calls[result.calls.length - 1].public.contractState).toBeDefined();
        expect(result.privateState).toMatchObject({ count: 1 });
      })
    );

  });

  describe('contract maintenance operations', () => {
    let contract: ContractExecutable.ContractExecutable<
      CounterContract,
      Contract.Contract.PrivateState<CounterContract>,
      unknown
    >;
    let deployment: ContractDeploy;

    // Create and initialize a new contract instance for each test.
    beforeEach(async () => {
      contract = counterContract.pipe(
        ContractExecutable.provide(testLayer(new Map([
          ['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY],
          ['KEYS_SIGNING', VALID_SIGNING_KEY]
        ])))
      );
      const result = await contract.initialize({ count: 0 }).pipe(Effect.runPromise);
      deployment = new ContractDeploy(asLedgerContractState(result.public.contractState));
    });

    it.effect('replaceContractMaintenanceAuthority should return new signing key', () =>
      Effect.gen(function* () {
        const result = yield* contract.replaceContractMaintenanceAuthority(
          Option.none(),
          {
            address: ContractAddress.ContractAddress(deployment.address),
            contractState: asContractState(deployment.initialState),
          }
        );

        expect(result.public.maintenanceUpdate).toBeDefined();
        expect(result.public.maintenanceUpdate.counter).toEqual(deployment.initialState.maintenanceAuthority.counter);
        expect(
          (result.public.maintenanceUpdate.updates[0] as ReplaceAuthority).authority.counter
            - deployment.initialState.maintenanceAuthority.counter
        ).toEqual(1n);
        expect(result.private.signingKey).not.toEqual(SigningKey.make(VALID_SIGNING_KEY));
      })
    );

    it.effect('removeContractOperation should work', () =>
      Effect.gen(function* () {
        const result = yield* contract.removeContractOperation(
          Contract.ProvableCircuitId<CounterContract>('increment'),
          {
            address: ContractAddress.ContractAddress(deployment.address),
            contractState: asContractState(deployment.initialState),
          }
        );

        expect(result.public.maintenanceUpdate).toBeDefined();
        expect(result.public.maintenanceUpdate.counter).toEqual(deployment.initialState.maintenanceAuthority.counter);
        expect((result.public.maintenanceUpdate.updates[0] as VerifierKeyRemove).operation).toEqual('increment');
        expect(result.private.signingKey).toEqual(SigningKey.make(VALID_SIGNING_KEY));
      })
    );

    it.effect('addOrReplaceContractOperation should work', () =>
      Effect.gen(function* () {
        const result = yield* contract.addOrReplaceContractOperation(
          Contract.ProvableCircuitId<CounterContract>('increment'),
          Contract.VerifierKey(deployment.initialState.operation('increment')!.verifierKey),
          {
            address: ContractAddress.ContractAddress(deployment.address),
            contractState: asContractState(deployment.initialState),
          }
        );

        expect(result.public.maintenanceUpdate).toBeDefined();
        expect(result.public.maintenanceUpdate.counter).toEqual(deployment.initialState.maintenanceAuthority.counter);
        expect((result.public.maintenanceUpdate.updates[0] as VerifierKeyInsert).operation).toEqual('increment');
        expect(result.private.signingKey).toEqual(SigningKey.make(VALID_SIGNING_KEY));
      })
    );

    it.effect('should sign a maintenance update with an ECDSA key that verifies against the installed authority', () =>
      Effect.gen(function* () {
        const ecdsaContract = counterContract.pipe(
          ContractExecutable.provide(
            testLayer(
              new Map([
                ['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY],
                ['KEYS_SIGNING', VALID_ECDSA_SIGNING_KEY],
                ['KEYS_SIGNING_KIND', 'ecdsa']
              ])
            )
          )
        );
        const deployResult = yield* ecdsaContract.initialize({ count: 0 });
        const ecdsaDeployment = new ContractDeploy(asLedgerContractState(deployResult.public.contractState));
        const installedAuthority = ecdsaDeployment.initialState.maintenanceAuthority.committee[0];

        const result = yield* ecdsaContract.removeContractOperation(
          Contract.ProvableCircuitId<CounterContract>('increment'),
          {
            address: ContractAddress.ContractAddress(ecdsaDeployment.address),
            contractState: asContractState(ecdsaDeployment.initialState),
          }
        );

        const [, signature] = result.public.maintenanceUpdate.signatures[0];
        expect(installedAuthority.tag).toEqual('ecdsa');
        expect(signature.tag).toEqual('ecdsa');
        expect(verifySignature(installedAuthority, result.public.maintenanceUpdate.dataToSign, signature)).toBe(true);
      })
    );

    it.effect('should fail loudly when the signing key uses an unsupported signature scheme', () =>
      Effect.gen(function* () {
        // The typed API advertises only 'schnorr' | 'ecdsa'; a scheme outside that set must be
        // rejected at the boundary rather than silently coerced to Schnorr.
        const unsupportedKey = SigningKey.make(VALID_SIGNING_KEY, 'rsa' as SigningKey.SignatureKind);
        const error = yield* contract.replaceContractMaintenanceAuthority(
          Option.some(unsupportedKey),
          {
            address: ContractAddress.ContractAddress(deployment.address),
            contractState: asContractState(deployment.initialState),
          }
        ).pipe(Effect.flip);

        expect(error).toBeInstanceOf(ContractConfigurationError.ContractConfigurationError);
        expect((error as ContractConfigurationError.ContractConfigurationError).message).toContain('rsa');
      })
    );
  });
});
