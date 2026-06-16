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
import { ChargedState, ContractState, type ContractStateProvider } from '@midnight-ntwrk/compact-runtime';
import { ContractDeploy, ContractState as LedgerContractState, partitionTranscripts } from '@midnightntwrk/ledger-v9';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option } from 'effect';
import { vi } from 'vitest';

import { CCCInnerContract, CCCMiddleContract, CCCOuterContract, CCCSelfContract } from '../contract';
import { ledger as cccInnerLedger } from '../contract/managed/cccInner/contract';
import { ledger as cccSelfLedger } from '../contract/managed/cccSelf/contract';

// Wrap `partitionTranscripts` so it delegates to the real implementation by default; individual
// tests can override a single call (see the wrong-partition-count test below).
vi.mock('@midnightntwrk/ledger-v9', async (importActual) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importActual<typeof import('@midnightntwrk/ledger-v9')>();
  return { ...actual, partitionTranscripts: vi.fn(actual.partitionTranscripts) };
});

// The fixtures form a three-level call chain: `outer` calls `middle`, which calls the `inner` leaf.
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';
const ZERO_BLOCK_HASH = '0'.repeat(64);

const CCC_INNER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/cccInner');
const CCC_MIDDLE_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/cccMiddle');
const CCC_OUTER_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/cccOuter');
const CCC_SELF_ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/cccSelf');

const asLedgerContractState = (state: ContractState): LedgerContractState =>
  LedgerContractState.deserialize(state.serialize());

const asContractState = (state: LedgerContractState): ContractState =>
  ContractState.deserialize(state.serialize());

// The on-chain deploy (and its address) derived from an `initialize` result's contract state.
const deployOf = (result: { public: { contractState: ContractState } }): ContractDeploy =>
  new ContractDeploy(asLedgerContractState(result.public.contractState));

// All fixtures share the same coin public key and ZK-asset-backed configuration; they differ only by
// their compiled-assets path.
const testLayer = (assetsPath: string) =>
  Layer.mergeAll(ZKFileConfiguration.layer(assetsPath), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]]), { pathDelim: '_' }).pipe(ConfigProvider.constantCase)
      )
    )
  );

const innerExecutable = CompiledContract.make<CCCInnerContract>('CCCInner', CCCInnerContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_INNER_ASSETS_PATH),
  ContractExecutable.make
);

const middleExecutable = CompiledContract.make<CCCMiddleContract>('CCCMiddle', CCCMiddleContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_MIDDLE_ASSETS_PATH),
  ContractExecutable.make
);

const outerExecutable = CompiledContract.make<CCCOuterContract>('CCCOuter', CCCOuterContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_OUTER_ASSETS_PATH),
  ContractExecutable.make
);

const selfExecutable = CompiledContract.make<CCCSelfContract>('CCCSelf', CCCSelfContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_SELF_ASSETS_PATH),
  ContractExecutable.make
);

// A stand-in contract whose circuit returns a context with no zswap local state, used to exercise
// the runtime's "returned no zswap local state" guard (which cannot be triggered by a real circuit).
class NoZswapContract {
  witnesses = {};
  circuits = {};
  impureCircuits = {};
  provableCircuits = {
    noZswap: async () => ({
      result: undefined,
      context: { callProofDataTrace: [], callContext: { currentZswapLocalState: undefined, currentPrivateState: undefined } }
    })
  };
}

const noZswapExecutable = CompiledContract.make<CCCInnerContract>('NoZswap', NoZswapContract as unknown as typeof CCCInnerContract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(CCC_INNER_ASSETS_PATH),
  ContractExecutable.make
);

describe('cross-contract calls', () => {
  let inner: ContractExecutable.ContractExecutable<CCCInnerContract, undefined, unknown>;
  let middle: ContractExecutable.ContractExecutable<CCCMiddleContract, undefined, unknown>;
  let innerDeploy: ContractDeploy;
  let middleDeploy: ContractDeploy;
  let chainStates: Map<string, ContractState>;

  beforeEach(async () => {
    inner = innerExecutable.pipe(ContractExecutable.provide(testLayer(CCC_INNER_ASSETS_PATH)));
    const innerResult = await inner.initialize(undefined).pipe(Effect.runPromise);
    innerDeploy = deployOf(innerResult);

    middle = middleExecutable.pipe(ContractExecutable.provide(testLayer(CCC_MIDDLE_ASSETS_PATH)));
    const middleResult = await middle.initialize(undefined, { bytes: Buffer.from(innerDeploy.address, 'hex') }).pipe(Effect.runPromise);
    middleDeploy = deployOf(middleResult);

    chainStates = new Map([[innerDeploy.address, asContractState(innerDeploy.initialState)]]);
  });

  const middleContext = (stateProvider: ContractStateProvider) => ({
    address: ContractAddress.ContractAddress(middleDeploy.address),
    contractState: asContractState(middleDeploy.initialState),
    privateState: undefined,
    parentBlockHash: ZERO_BLOCK_HASH,
    stateProvider
  });

  // A state provider backed by the in-memory `chainStates` map — resolves any callee deployed above.
  const resolveFromChain: ContractStateProvider = {
    getContractState: async (_blockHash, address) => chainStates.get(address)
  };

  it.effect('stateProvider is called to resolve callee state', () =>
    Effect.gen(function* () {
      const getContractState = vi.fn<ContractStateProvider['getContractState']>(
        async (_blockHash, address) => chainStates.get(address)
      );

      yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext({ getContractState }),
        1n
      );

      expect(getContractState).toHaveBeenCalledWith(expect.any(String), innerDeploy.address);
    })
  );

  it.effect('incrementInner captures every sub-call plus the root, in trace order', () =>
    Effect.gen(function* () {
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        1n
      );

      // incrementInner calls inner.getV() then inner.setV(); both sub-calls precede the root.
      expect(result.calls.map((call) => call.circuitId)).toEqual(['getV', 'setV', 'incrementInner']);

      const rootCall = result.calls[result.calls.length - 1];
      const subCalls = result.calls.slice(0, -1);

      // The root call is no one's callee, so it carries no communication commitment.
      expect(Option.isNone(rootCall.communicationCommitment)).toBe(true);
      // Each sub-call is bound to its caller by a communication commitment, and targets `inner`
      // (a different contract than the root).
      for (const subCall of subCalls) {
        expect(Option.isSome(subCall.communicationCommitment)).toBe(true);
        expect(subCall.contractAddress).not.toBe(rootCall.contractAddress);
      }
    })
  );

  it.effect('getInner reads callee state and returns the root result plus one sub-call', () =>
    Effect.gen(function* () {
      const setVResult = yield* inner.circuit(
        Contract.ProvableCircuitId<CCCInnerContract>('setV'),
        { address: ContractAddress.ContractAddress(innerDeploy.address), contractState: chainStates.get(innerDeploy.address)!, privateState: undefined },
        5n
      );
      // inner.setV is a leaf call: a single entry with no communication commitment.
      expect(setVResult.calls).toHaveLength(1);
      expect(Option.isNone(setVResult.calls[0].communicationCommitment)).toBe(true);
      const contractState = setVResult.calls[setVResult.calls.length - 1].public.contractState;
      chainStates.get(innerDeploy.address)!.data = new ChargedState(contractState);

      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('getInner'),
        middleContext(resolveFromChain)
      );

      // The application-facing result belongs to the root contract.
      expect(result.result).toBe(5n);
      // getInner calls inner.getV(): one sub-call (commitment present) then the root (none).
      expect(result.calls.map((call) => call.circuitId)).toEqual(['getV', 'getInner']);
      expect(Option.isSome(result.calls[0].communicationCommitment)).toBe(true);
      expect(Option.isNone(result.calls[1].communicationCommitment)).toBe(true);
    })
  );

  it.effect('uses the exact expected contract address for each returned call', () =>
    Effect.gen(function* () {
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        1n
      );

      const [getV, setV, root] = result.calls;
      // The two sub-calls run against `inner`; the root runs against `middle`.
      expect(getV.contractAddress).toBe(innerDeploy.address);
      expect(setV.contractAddress).toBe(innerDeploy.address);
      expect(root.contractAddress).toBe(middleDeploy.address);
    })
  );

  it.effect('calls the same callee through different circuits with one address but distinct commitments', () =>
    Effect.gen(function* () {
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        1n
      );

      const [getV, setV] = result.calls;
      // incrementInner calls inner.getV() and inner.setV(): the same callee, two circuits.
      expect(getV.circuitId).toBe('getV');
      expect(setV.circuitId).toBe('setV');
      expect(getV.contractAddress).toBe(innerDeploy.address);
      expect(setV.contractAddress).toBe(getV.contractAddress);

      // Each call to the callee is bound to its caller by a distinct communication commitment.
      const getVCommitment = Option.getOrThrow(getV.communicationCommitment).commComm;
      const setVCommitment = Option.getOrThrow(setV.communicationCommitment).commComm;
      expect(getVCommitment).not.toEqual(setVCommitment);
    })
  );

  it.effect('includes the private input, output, and private transcript outputs for each call', () =>
    Effect.gen(function* () {
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        1n
      );

      for (const call of result.calls) {
        expect(call.private.input).toBeDefined();
        expect(call.private.output).toBeDefined();
        expect(Array.isArray(call.private.privateTranscriptOutputs)).toBe(true);
      }
    })
  );

  it.effect("contains the callee's post-execution contract state", () =>
    Effect.gen(function* () {
      // inner.v starts at 0; incrementInner reads it then writes 0 + 3.
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        3n
      );

      const getVCall = result.calls.find((call) => call.circuitId === 'getV')!;
      const setVCall = result.calls.find((call) => call.circuitId === 'setV')!;
      // The read-only sub-call still sees the pre-update value; the write sub-call carries the
      // callee's post-execution state.
      expect(cccInnerLedger(getVCall.public.contractState).v).toBe(0n);
      expect(cccInnerLedger(setVCall.public.contractState).v).toBe(3n);
    })
  );

  it.effect('takes the result, privateState, and zswapLocalState from the root, not the callee', () =>
    Effect.gen(function* () {
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        2n
      );

      // incrementInner returns [], even though its getV sub-call returned a Field value: the
      // application-facing values all belong to the root contract.
      expect(result.result).toEqual([]);
      expect(result.privateState).toBeUndefined();
      expect(result.zswapLocalState).toBeDefined();
    })
  );

  it.effect('partitions each call into guaranteed and fallible programs that match the original batch', () =>
    Effect.gen(function* () {
      const result = yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        middleContext(resolveFromChain),
        1n
      );

      // Recombining the partitioned guaranteed and fallible programs reproduces the original
      // (un-partitioned) public transcript of each call.
      for (const call of result.calls) {
        const [guaranteed, fallible] = call.public.partitionedTranscript;
        expect([...(guaranteed?.program ?? []), ...(fallible?.program ?? [])]).toEqual(call.public.publicTranscript);
      }
    })
  );

  it.effect('returns a ContractRuntimeError when the state provider cannot find a callee state', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        middle.circuit(
          Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
          middleContext({ getContractState: async () => undefined }),
          1n
        )
      );

      expect(ContractRuntimeError.isRuntimeError(error)).toBe(true);
    })
  );

  it.effect('fails with a defined error when a cross-contract call is attempted without a stateProvider', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        middle.circuit(
          Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
          {
            address: ContractAddress.ContractAddress(middleDeploy.address),
            contractState: asContractState(middleDeploy.initialState),
            privateState: undefined
          },
          1n
        )
      );

      expect(ContractRuntimeError.isRuntimeError(error)).toBe(true);
    })
  );

  it.effect('passes the exact parentBlockHash through to the state provider', () =>
    Effect.gen(function* () {
      const parentBlockHash = 'ab'.repeat(32);
      const getContractState = vi.fn<ContractStateProvider['getContractState']>(
        async (_blockHash, address) => chainStates.get(address)
      );

      yield* middle.circuit(
        Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
        { ...middleContext({ getContractState }), parentBlockHash },
        1n
      );

      expect(getContractState).toHaveBeenCalledWith(parentBlockHash, innerDeploy.address);
    })
  );

  it.effect('orders nested cross-contract calls from the deepest completed call back to the root', () =>
    Effect.gen(function* () {
      // Seed inner.v = 9 so the read flows root (outer) -> middle -> inner.
      const setVResult = yield* inner.circuit(
        Contract.ProvableCircuitId<CCCInnerContract>('setV'),
        { address: ContractAddress.ContractAddress(innerDeploy.address), contractState: chainStates.get(innerDeploy.address)!, privateState: undefined },
        9n
      );
      chainStates.get(innerDeploy.address)!.data = new ChargedState(setVResult.calls[0].public.contractState);
      // `middle` must also be resolvable as a callee of `outer`.
      chainStates.set(middleDeploy.address, asContractState(middleDeploy.initialState));

      const outer = outerExecutable.pipe(ContractExecutable.provide(testLayer(CCC_OUTER_ASSETS_PATH)));
      const outerResult = yield* outer.initialize(undefined, { bytes: Buffer.from(middleDeploy.address, 'hex') });
      const outerDeploy = deployOf(outerResult);

      const result = yield* outer.circuit(
        Contract.ProvableCircuitId<CCCOuterContract>('getThroughMiddle'),
        {
          address: ContractAddress.ContractAddress(outerDeploy.address),
          contractState: asContractState(outerDeploy.initialState),
          privateState: undefined,
          parentBlockHash: ZERO_BLOCK_HASH,
          stateProvider: resolveFromChain
        }
      );

      // inner.getV() (depth 2) completes first, then middle.getInner() (depth 1), then the root.
      expect(result.calls.map((call) => call.circuitId)).toEqual(['getV', 'getInner', 'getThroughMiddle']);
      expect(result.calls.map((call) => call.contractAddress)).toEqual([
        innerDeploy.address,
        middleDeploy.address,
        outerDeploy.address
      ]);
      // The root result is the value read all the way down the chain.
      expect(result.result).toBe(9n);
    })
  );

  it.effect('handles a self-call where a circuit calls another circuit on its own address', () =>
    Effect.gen(function* () {
      const self = selfExecutable.pipe(ContractExecutable.provide(testLayer(CCC_SELF_ASSETS_PATH)));
      // The deploy address is not known until after construction, so deploy with a zero address...
      const zeroAddress = Buffer.alloc(innerDeploy.address.length / 2);
      const selfResult = yield* self.initialize(undefined, { bytes: zeroAddress });
      const selfDeploy = deployOf(selfResult);
      const selfAddress = selfDeploy.address;
      const selfState = asContractState(selfDeploy.initialState);

      const leafContext = () => ({
        address: ContractAddress.ContractAddress(selfAddress),
        contractState: selfState,
        privateState: undefined
      });
      // ...give v a distinguishable value, then point `self` at this contract's own address.
      const setVResult = yield* self.circuit(Contract.ProvableCircuitId<CCCSelfContract>('setV'), leafContext(), 4n);
      selfState.data = new ChargedState(setVResult.calls[0].public.contractState);
      const setSelfResult = yield* self.circuit(
        Contract.ProvableCircuitId<CCCSelfContract>('setSelf'),
        leafContext(),
        { bytes: Buffer.from(selfAddress, 'hex') }
      );
      selfState.data = new ChargedState(setSelfResult.calls[0].public.contractState);
      // Sanity check: `self` now points at this contract's own address.
      expect(Buffer.from(cccSelfLedger(setSelfResult.calls[0].public.contractState).self.bytes).toString('hex')).toBe(selfAddress);

      const chain = new Map([[selfAddress, selfState]]);
      const result = yield* self.circuit(
        Contract.ProvableCircuitId<CCCSelfContract>('callSelfGet'),
        {
          address: ContractAddress.ContractAddress(selfAddress),
          contractState: selfState,
          privateState: undefined,
          parentBlockHash: ZERO_BLOCK_HASH,
          stateProvider: { getContractState: async (_blockHash, address) => chain.get(address) }
        }
      );

      // callSelfGet calls getV() on its own address: one sub-call then the root.
      expect(result.calls.map((call) => call.circuitId)).toEqual(['getV', 'callSelfGet']);
      // The sub-call (callee) and the root execute against the same (self) address.
      expect(result.calls[0].contractAddress).toBe(selfAddress);
      expect(result.calls[1].contractAddress).toBe(selfAddress);
      expect(Option.isSome(result.calls[0].communicationCommitment)).toBe(true);
      expect(Option.isNone(result.calls[1].communicationCommitment)).toBe(true);
      expect(result.result).toBe(4n);
    })
  );

  it.effect('returns a ContractRuntimeError when transcript partitioning returns the wrong number of items', () =>
    Effect.gen(function* () {
      // Force the partitioner to return fewer pairs than there are calls for this run only.
      vi.mocked(partitionTranscripts).mockReturnValueOnce([]);

      const error = yield* Effect.flip(
        middle.circuit(
          Contract.ProvableCircuitId<CCCMiddleContract>('incrementInner'),
          middleContext(resolveFromChain),
          1n
        )
      );

      expect(ContractRuntimeError.isRuntimeError(error)).toBe(true);
      expect(String((error as ContractRuntimeError.ContractRuntimeError).cause)).toContain('transcript partition pairs');
    })
  );

  it.effect('throws the explicit error when the runtime returns no zswap local state', () =>
    Effect.gen(function* () {
      const noZswap = noZswapExecutable.pipe(ContractExecutable.provide(testLayer(CCC_INNER_ASSETS_PATH)));

      const exit = yield* Effect.exit(
        noZswap.circuit(
          Contract.ProvableCircuitId<CCCInnerContract>('noZswap' as never),
          { address: ContractAddress.ContractAddress(innerDeploy.address), contractState: asContractState(innerDeploy.initialState), privateState: undefined }
        )
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toMatchObject({ message: expect.stringContaining('returned no zswap local state') });
      }
    })
  );
});
