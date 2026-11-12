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

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Command } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { NodeContext } from '@effect/platform-node';
import { describe, it } from '@effect/vitest';
import { CompiledContract, ContractExecutable } from '@midnight-ntwrk/compact-js/effect';
import { circuitCommand } from '@midnight-ntwrk/compact-js-command/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { type ContractState as RuntimeContractState } from '@midnight-ntwrk/compact-runtime';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import { ContractDeploy, ContractState as LedgerContractState } from '@midnightntwrk/ledger-v9';
import { ConfigProvider, Effect, Layer } from 'effect';
import { afterAll, beforeAll } from 'vitest';

import { Contract as CCCMintCaller_ } from '../../../compact-js/test/contract/managed/cccMintCaller/contract/index';
import { Contract as CCCMinter_ } from '../../../compact-js/test/contract/managed/cccMinter/contract/index';
import { ensureRemovePath } from './cleanup.js';
import { testLayer } from './testLayer.js';

type CCCMinterContract = CCCMinter_<undefined>;
const CCCMinterContract = CCCMinter_;
type CCCMintCallerContract = CCCMintCaller_<undefined>;
const CCCMintCallerContract = CCCMintCaller_;

const COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';

const MINTER_ASSETS_PATH = resolve(import.meta.dirname, '../../../compact-js/test/contract/managed/cccMinter');
const CALLER_ASSETS_PATH = resolve(import.meta.dirname, '../../../compact-js/test/contract/managed/cccMintCaller');
const CALLER_CONFIG_FILEPATH = resolve(import.meta.dirname, '../contract/cccMintCaller/contract.config.ts');
const WORK_ROOT = mkdtempSync(join(tmpdir(), 'ccc-coins-'));

const assetsLayer = (assetsPath: string) =>
  Layer.mergeAll(ZKFileConfiguration.layer(assetsPath), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([['KEYS_COIN_PUBLIC', COIN_PUBLIC_KEY]]), { pathDelim: '_' }).pipe(
          ConfigProvider.constantCase
        )
      )
    )
  );

const asLedgerContractState = (state: RuntimeContractState): LedgerContractState =>
  LedgerContractState.deserialize(state.serialize());

let minterAddress: string;
let callerAddress: string;
let minterStateBytes: Uint8Array;
let callerStateBytes: Uint8Array;

beforeAll(async () => {
  const fixtures = await Effect.runPromise(
    Effect.gen(function* () {
      const minter = CompiledContract.make<CCCMinterContract>('CCCMinter', CCCMinterContract).pipe(
        CompiledContract.withVacantWitnesses,
        CompiledContract.withCompiledFileAssets(MINTER_ASSETS_PATH),
        ContractExecutable.make,
        ContractExecutable.provide(assetsLayer(MINTER_ASSETS_PATH))
      );
      const minterDeploy = new ContractDeploy(asLedgerContractState((yield* minter.initialize(undefined)).public.contractState));

      const caller = CompiledContract.make<CCCMintCallerContract>('CCCMintCaller', CCCMintCallerContract).pipe(
        CompiledContract.withVacantWitnesses,
        CompiledContract.withCompiledFileAssets(CALLER_ASSETS_PATH),
        ContractExecutable.make,
        ContractExecutable.provide(assetsLayer(CALLER_ASSETS_PATH))
      );
      const callerResult = yield* caller.initialize(undefined, { bytes: Buffer.from(minterDeploy.address, 'hex') });
      const callerDeploy = new ContractDeploy(asLedgerContractState(callerResult.public.contractState));

      return {
        minterAddress: minterDeploy.address,
        callerAddress: callerDeploy.address,
        minterStateBytes: minterDeploy.initialState.serialize(),
        callerStateBytes: callerDeploy.initialState.serialize()
      };
    })
  );
  ({ minterAddress, callerAddress, minterStateBytes, callerStateBytes } = fixtures);
}, 60_000);

afterAll(async () => {
  await Effect.runPromise(ensureRemovePath(WORK_ROOT).pipe(Effect.provide(NodeContext.layer)));
});

const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

type EncodedOutput = { readonly recipient: { readonly is_left: boolean; readonly right: { readonly bytes: number[] } } };
type CallZswapState = {
  readonly contractAddress: string;
  readonly circuitId: string;
  readonly zswapLocalState: { readonly outputs: readonly EncodedOutput[] };
};

describe('Circuit Command (a callee that mints a shielded coin)', () => {
  it.effect('--output-zswap-calls holds the callee\'s coin, which --output-zswap does not', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const statesIn = join(WORK_ROOT, 'contract-states-in');
      const modulesIn = join(WORK_ROOT, 'contract-modules-in');
      yield* fs.makeDirectory(statesIn, { recursive: true });
      yield* fs.makeDirectory(modulesIn, { recursive: true });
      yield* fs.writeFile(join(statesIn, minterAddress), minterStateBytes);
      // Symlinked for the reason `CircuitCrossContract.test.ts` gives.
      yield* fs.symlink(MINTER_ASSETS_PATH, join(modulesIn, minterAddress));
      const input = join(WORK_ROOT, 'input.bin');
      yield* fs.writeFile(input, callerStateBytes);
      const ps = join(WORK_ROOT, 'input.ps.json');
      yield* fs.writeFileString(ps, JSON.stringify(null));
      const outputZswap = join(WORK_ROOT, 'zswap.json');
      const zswapCalls = join(WORK_ROOT, 'zswap-calls.json');

      yield* cli([
        'node', 'circuit.ts',
        '-c', CALLER_CONFIG_FILEPATH,
        '--input', input,
        '--input-ps', ps,
        '--contract-states-dir', statesIn,
        '--contract-modules-dir', modulesIn,
        '--output', join(WORK_ROOT, 'output.bin'),
        '--output-ps', join(WORK_ROOT, 'output.ps.json'),
        '--output-zswap', outputZswap,
        '--output-zswap-calls', zswapCalls,
        '--output-result', join(WORK_ROOT, 'result.json'),
        callerAddress, 'mintThroughCallee'
      ]);

      const calls = JSON.parse(yield* fs.readFileString(zswapCalls)) as readonly CallZswapState[];
      expect(calls.map(({ contractAddress, circuitId }) => [contractAddress, circuitId])).toEqual([
        [minterAddress, 'mint'],
        [callerAddress, 'mintThroughCallee']
      ]);
      const [minterCall, rootCall] = calls;

      // The minter mints to itself, so the coin is an output of the minter's own state.
      expect(minterCall!.zswapLocalState.outputs).toHaveLength(1);
      const { recipient } = minterCall!.zswapLocalState.outputs[0]!;
      expect(recipient.is_left).toBe(false);
      expect(Buffer.from(recipient.right.bytes).toString('hex')).toBe(minterAddress);

      // The root minted nothing, and `--output-zswap` is the root's state alone.
      expect(rootCall!.zswapLocalState.outputs).toEqual([]);
      expect(JSON.parse(yield* fs.readFileString(outputZswap)).outputs).toEqual([]);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );
});
