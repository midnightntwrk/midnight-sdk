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
import { circuitCommand, ConfigCompiler } from '@midnight-ntwrk/compact-js-command/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractState as RuntimeContractState } from '@midnight-ntwrk/compact-runtime';
import {
  type ContractCall,
  ContractDeploy,
  ContractState as LedgerContractState,
  Intent,
  type PreBinding,
  type PreProof,
  type SignatureEnabled
} from '@midnight-ntwrk/ledger-v8';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import { ConfigProvider, Console, Effect, Layer } from 'effect';
import { afterAll, beforeAll } from 'vitest';

import { Contract as CCCInner_, ledger as innerLedger } from '../../../compact-js/test/contract/managed/cccInner/contract/index';
import { Contract as CCCMiddle_ } from '../../../compact-js/test/contract/managed/cccMiddle/contract/index';
import { ensureRemovePath } from './cleanup.js';
import * as MockConsole from './MockConsole.js';

// The CCC fixtures are untyped test contracts; pin their private state to `undefined`, mirroring
// `compact-js/test/contract/index.ts`. Importing the managed declaration files (rather than that
// barrel source) keeps these references outside this package's test `rootDir`.
type CCCInnerContract = CCCInner_<undefined>;
const CCCInnerContract = CCCInner_;
type CCCMiddleContract = CCCMiddle_<undefined>;
const CCCMiddleContract = CCCMiddle_;

const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';

const CCC_INNER_ASSETS_PATH = resolve(import.meta.dirname, '../../../compact-js/test/contract/managed/cccInner');
const CCC_MIDDLE_ASSETS_PATH = resolve(import.meta.dirname, '../../../compact-js/test/contract/managed/cccMiddle');

const MIDDLE_CONFIG_FILEPATH = resolve(import.meta.dirname, '../contract/cccMiddle/contract.config.ts');
// A working root unique to this process, outside the repo tree, so parallel test files never share
// or race on filesystem state. Each test gets its own subdirectory within it.
const WORK_ROOT = mkdtempSync(join(tmpdir(), 'ccc-circuit-'));

const asLedgerContractState = (state: RuntimeContractState): LedgerContractState =>
  LedgerContractState.deserialize(state.serialize());

/** Read the `cccInner` ledger value `v` from a ledger-serialized contract-state file's bytes. */
const innerV = (bytes: Uint8Array): bigint =>
  innerLedger(RuntimeContractState.deserialize(LedgerContractState.deserialize(bytes).serialize()).data).v;

const innerTestLayer = (configMap: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(CCC_INNER_ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(configMap, { pathDelim: '_' }).pipe(ConfigProvider.constantCase)))
  );

const middleTestLayer = (configMap: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(CCC_MIDDLE_ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(Layer.setConfigProvider(ConfigProvider.fromMap(configMap, { pathDelim: '_' }).pipe(ConfigProvider.constantCase)))
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

const testLayer: Layer.Layer<ConfigCompiler.ConfigCompiler | NodeContext.NodeContext | FileSystem.FileSystem> =
  Effect.gen(function* () {
    const console = yield* MockConsole.make;
    return Layer.mergeAll(
      Console.setConsole(console),
      ConfigCompiler.layer.pipe(Layer.provideMerge(NodeContext.layer))
    );
  }).pipe(Layer.unwrapEffect);

// A `cccMiddle` (root) and the `cccInner` it targets, deployed once for the whole file. Deploying is
// the expensive part (proving), and the resulting initial states never change, so each test reuses
// these bytes rather than re-deploying — keeping the per-process count of heavy runtime executions
// low. `middleStateBytes`/`innerStateBytes` are ledger-serialized contract states, exactly the
// `--input` / `--contract-states-dir` format the command consumes.
let innerAddress: string;
let middleAddress: string;
let innerStateBytes: Uint8Array;
let middleStateBytes: Uint8Array;

beforeAll(async () => {
  const fixtures = await Effect.runPromise(Effect.gen(function* () {
    const inner = innerExecutable.pipe(
      ContractExecutable.provide(innerTestLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]])))
    );
    const innerResult = yield* inner.initialize(undefined);
    const innerDeploy = new ContractDeploy(asLedgerContractState(innerResult.public.contractState));

    const middle = middleExecutable.pipe(
      ContractExecutable.provide(middleTestLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]])))
    );
    const middleResult = yield* middle.initialize(undefined, { bytes: Buffer.from(innerDeploy.address, 'hex') });
    const middleDeploy = new ContractDeploy(asLedgerContractState(middleResult.public.contractState));

    return {
      innerAddress: innerDeploy.address,
      middleAddress: middleDeploy.address,
      innerStateBytes: innerDeploy.initialState.serialize(),
      middleStateBytes: middleDeploy.initialState.serialize()
    };
  }));
  ({ innerAddress, middleAddress, innerStateBytes, middleStateBytes } = fixtures);
}, 60_000);

afterAll(async () => {
  // Only remove this process's own temp tree. The compiled `.js` next to the config is a shared
  // repo-local artifact (gitignored, recompiled each run); deleting it here can race other test
  // files, so it is deliberately left in place.
  await Effect.runPromise(ensureRemovePath(WORK_ROOT).pipe(Effect.provide(NodeContext.layer)));
});

interface Workspace {
  readonly input: string;
  readonly ps: string;
  readonly statesIn: string;
  readonly statesOut: string;
  readonly output: string;
  readonly outputOc: string;
  readonly outputPs: string;
  readonly outputZswap: string;
  readonly outputResult: string;
}

let workspaceCounter = 0;

/**
 * Lays down a fresh, isolated working directory seeded with the command's inputs: the middle (root)
 * state at `--input`, the inner (callee) state under the `--contract-states-dir` directory named by
 * its address, and a `null` private state. Returns the absolute paths for the command's options.
 */
const prepareWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = join(WORK_ROOT, `t${++workspaceCounter}`);
  const statesIn = join(dir, 'contract-states-in');
  yield* fs.makeDirectory(statesIn, { recursive: true });
  yield* fs.writeFile(join(statesIn, innerAddress), innerStateBytes);
  const input = join(dir, 'input.bin');
  yield* fs.writeFile(input, middleStateBytes);
  const ps = join(dir, 'input.ps.json');
  yield* fs.writeFileString(ps, JSON.stringify(null));
  return {
    input,
    ps,
    statesIn,
    statesOut: join(dir, 'contract-states-out'),
    output: join(dir, 'output.bin'),
    outputOc: join(dir, 'output_oc.bin'),
    outputPs: join(dir, 'output.ps.json'),
    outputZswap: join(dir, 'output_zswap.json'),
    outputResult: join(dir, 'result.json')
  } satisfies Workspace;
});

const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

/** Builds the argv for the `circuit` command against a workspace, toggling the optional dir options. */
const circuitArgv = (
  w: Workspace,
  opts: { readonly statesIn?: string; readonly statesOut?: string },
  input: string,
  circuitId: string,
  ...args: string[]
): string[] => [
  'node', 'circuit.ts',
  '-c', MIDDLE_CONFIG_FILEPATH,
  '--input', input,
  '--input-ps', w.ps,
  ...(opts.statesIn ? ['--contract-states-dir', opts.statesIn] : []),
  ...(opts.statesOut ? ['--output-contract-states-dir', opts.statesOut] : []),
  '--output', w.output,
  '--output-oc', w.outputOc,
  '--output-ps', w.outputPs,
  '--output-zswap', w.outputZswap,
  '--output-result', w.outputResult,
  middleAddress, circuitId, ...args
];

/** Deserialize the unproven `Intent` the command writes to `--output`, as its contract calls. */
const readIntentCalls = (bytes: Uint8Array): readonly ContractCall<PreProof>[] => {
  const intent = Intent.deserialize<SignatureEnabled, PreProof, PreBinding>('signature', 'pre-proof', 'pre-binding', bytes);
  return intent.actions as ContractCall<PreProof>[];
};

const entryPointOf = (call: ContractCall<PreProof>): string =>
  typeof call.entryPoint === 'string' ? call.entryPoint : new TextDecoder().decode(call.entryPoint);

/**
 * Asserts the command produced none of its output files. On a failed invocation the command's
 * contract is to write nothing — checking every output path (not just `--output`) catches a partial
 * write that leaves, say, the result or private-state file behind.
 */
const expectNoOutputsWritten = (w: Workspace) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    for (const path of [w.output, w.outputOc, w.outputResult, w.outputPs, w.outputZswap]) {
      expect(yield* fs.exists(path)).toBe(false);
    }
  });

describe('Circuit Command (cross-contract calls)', () => {
  it.effect('--contract-states-dir produces one call per trace entry (root + each callee)', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      yield* cli(circuitArgv(w, { statesIn: w.statesIn }, w.input, 'incrementInner', '1'));

      const calls = readIntentCalls(yield* fs.readFile(w.output));

      // incrementInner emits one call per trace entry: the root (incrementInner on middle) plus the
      // two sub-calls (inner.getV, inner.setV). The serialized intent does not preserve the trace's
      // callees-first ordering, so assert on the multiset rather than a fixed sequence.
      expect(calls).toHaveLength(3);
      const byAddress = (address: string) => calls.filter((c) => c.address === address);
      expect(byAddress(middleAddress).map(entryPointOf)).toEqual(['incrementInner']);
      expect(byAddress(innerAddress).map(entryPointOf).sort()).toEqual(['getV', 'setV']);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('each call\'s operation is resolvable from its source state (root from --input, callee from dir)', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      // The handler resolves each call's `ContractOperation` from that contract's on-chain state:
      // the root from `--input`, sub-calls from `<dir>/<address>`. Assert those source states
      // actually carry the operations the trace names — this is what makes the resolution valid.
      const middleState = LedgerContractState.deserialize(yield* fs.readFile(w.input));
      expect(middleState.operation('incrementInner')).toBeDefined();
      expect(middleState.operation('getInner')).toBeDefined();

      const innerState = LedgerContractState.deserialize(yield* fs.readFile(join(w.statesIn, innerAddress)));
      expect(innerState.operation('getV')).toBeDefined();
      expect(innerState.operation('setV')).toBeDefined();

      yield* cli(circuitArgv(w, { statesIn: w.statesIn }, w.input, 'incrementInner', '1'));

      // The command completes (no error logged) only because every call's operation resolved.
      const lines = yield* MockConsole.getLines({ stripAnsi: true });
      expect(lines.some((l) => /Failed to invoke circuit|Cannot resolve/.test(l))).toBe(false);

      // Each prototype is built by resolving its operation from the state addressed by that call.
      // A built prototype proves the lookup succeeded (a missing operation fails loudly and writes
      // no output). The address↔circuit pairing pins each call to its only possible source: the
      // root's `incrementInner` can come only from the middle `--input` state, and `getV`/`setV` only
      // from the inner state read out of `--contract-states-dir`.
      const calls = readIntentCalls(yield* fs.readFile(w.output));
      expect(calls).toHaveLength(3);
      const circuitsAt = (address: string) => calls.filter((c) => c.address === address).map(entryPointOf).sort();
      expect(circuitsAt(middleAddress)).toEqual(['incrementInner']);
      expect(circuitsAt(innerAddress)).toEqual(['getV', 'setV']);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('--output-oc writes only the root (middle) updated state', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      yield* cli(circuitArgv(w, { statesIn: w.statesIn }, w.input, 'incrementInner', '1'));

      const ocState = LedgerContractState.deserialize(yield* fs.readFile(w.outputOc));
      const operations = ocState.operations().map(String);
      // --output-oc is the root contract's state: it exposes the middle circuits, not the inner ones.
      expect(operations).toEqual(expect.arrayContaining(['incrementInner', 'getInner']));
      expect(operations).not.toContain('getV');
      expect(operations).not.toContain('setV');
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('--output-contract-states-dir writes each callee state by address, creating the dir', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      // The output dir does not exist yet; the command must create it.
      expect(yield* fs.exists(w.statesOut)).toBe(false);

      yield* cli(circuitArgv(w, { statesIn: w.statesIn, statesOut: w.statesOut }, w.input, 'incrementInner', '1'));

      expect(yield* fs.exists(w.statesOut)).toBe(true);
      const calleeFile = join(w.statesOut, innerAddress);
      expect(yield* fs.exists(calleeFile)).toBe(true);
      // incrementInner(1) on a freshly-deployed inner (v = 0) leaves v = 1 in the callee's state.
      expect(innerV(yield* fs.readFile(calleeFile))).toBe(1n);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('state-threading round-trip advances v by both increments', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      // Run 1: v 0 -> 1. Root state to --output-oc, callee state to --output-contract-states-dir.
      yield* cli(circuitArgv(w, { statesIn: w.statesIn, statesOut: w.statesOut }, w.input, 'incrementInner', '1'));
      expect(innerV(yield* fs.readFile(join(w.statesOut, innerAddress)))).toBe(1n);

      // Run 2: feed run 1's outputs back in (root via --input, callee via --contract-states-dir),
      // writing the updated callee state back into the same directory.
      yield* cli(circuitArgv(w, { statesIn: w.statesOut, statesOut: w.statesOut }, w.outputOc, 'incrementInner', '1'));
      // v advanced by both increments: 0 -> 1 -> 2.
      expect(innerV(yield* fs.readFile(join(w.statesOut, innerAddress)))).toBe(2n);
    }).pipe(Effect.provide(testLayer)),
    90_000
  );

  it.effect('--output-result / --output-ps / --output-zswap hold the root\'s values, not a callee\'s', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      yield* cli(circuitArgv(w, { statesIn: w.statesIn }, w.input, 'incrementInner', '1'));

      // incrementInner returns `[]` (the root's return value). A callee (getV) would return the
      // value `1`; the result file must reflect the root — regression for `result.result`.
      expect(JSON.parse(yield* fs.readFileString(w.outputResult))).toEqual([]);

      // The private and zswap files are written from `result.privateState` / `result.zswapLocalState`,
      // which belong to the root contract (callees expose neither). The root's private state is
      // `undefined`, which serializes to an empty file.
      expect(yield* fs.readFileString(w.outputPs)).toBe('');

      // The root's zswap local state holds no coins for this call; it must still serialize to a valid
      // encoded-zswap object (a callee carries no zswap state to confuse it with).
      const zswap = JSON.parse(yield* fs.readFileString(w.outputZswap));
      expect(typeof zswap).toBe('object');
      expect(zswap).not.toBeNull();
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('a callee state lacking the called operation fails with a reported error', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      // Replace the callee state with the *middle* state: it is not a valid `cccInner`, so the
      // cross-contract call cannot be resolved/executed. The command must surface a defined,
      // reported error and write no output — not crash with an opaque native fault.
      yield* fs.writeFile(join(w.statesIn, innerAddress), middleStateBytes);

      yield* cli(circuitArgv(w, { statesIn: w.statesIn }, w.input, 'incrementInner', '1'));

      const lines = yield* MockConsole.getLines({ stripAnsi: true });
      expect(lines.join('\n')).toMatch(/Failed to invoke circuit/);
      yield* expectNoOutputsWritten(w);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('a cross-contract circuit without --contract-states-dir fails with a reported error', () =>
    Effect.gen(function* () {
      const w = yield* prepareWorkspace;

      // No --contract-states-dir means no state provider in the circuit context, so incrementInner's
      // call into the inner contract cannot be resolved. The command must report the failure and
      // write no output, rather than crash.
      yield* cli(circuitArgv(w, {}, w.input, 'incrementInner', '1'));

      const lines = yield* MockConsole.getLines({ stripAnsi: true });
      expect(lines.join('\n')).toMatch(/Failed to invoke circuit/);
      yield* expectNoOutputsWritten(w);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('a callee missing from --contract-states-dir fails with a reported error', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      // Remove the callee's state file: the provider resolves it to `undefined` (ENOENT), leaving the
      // cross-contract call unresolved. The command must report the failure and write no output.
      yield* fs.remove(join(w.statesIn, innerAddress));

      yield* cli(circuitArgv(w, { statesIn: w.statesIn }, w.input, 'incrementInner', '1'));

      const lines = yield* MockConsole.getLines({ stripAnsi: true });
      expect(lines.join('\n')).toMatch(/Failed to invoke circuit/);
      yield* expectNoOutputsWritten(w);
    }).pipe(Effect.provide(testLayer)),
    60_000
  );

  it.effect('a read-only cross-contract circuit (getInner) returns the callee value', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const w = yield* prepareWorkspace;

      // Bump the inner value to 1 first, capturing the updated root and callee states.
      yield* cli(circuitArgv(w, { statesIn: w.statesIn, statesOut: w.statesOut }, w.input, 'incrementInner', '1'));
      expect(innerV(yield* fs.readFile(join(w.statesOut, innerAddress)))).toBe(1n);

      // getInner just reads inner.getV(): one sub-call (inner) plus the root (middle), and the root's
      // result is the inner's value (`1`, serialized by the bigint replacer).
      yield* cli(circuitArgv(w, { statesIn: w.statesOut }, w.outputOc, 'getInner'));

      expect(JSON.parse(yield* fs.readFileString(w.outputResult))).toBe('1');

      const calls = readIntentCalls(yield* fs.readFile(w.output));
      expect(calls).toHaveLength(2);
      expect(calls.filter((c) => c.address === innerAddress).map(entryPointOf)).toEqual(['getV']);
      expect(calls.filter((c) => c.address === middleAddress).map(entryPointOf)).toEqual(['getInner']);
    }).pipe(Effect.provide(testLayer)),
    90_000
  );
});
