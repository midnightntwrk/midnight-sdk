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

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * **Two ledger eras executing in one process** — the #388 requirement, and the recipe a consumer
 * needs in order to satisfy it.
 *
 * @remarks
 * A compiled Compact contract opens with, verbatim:
 *
 * ```js
 * import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
 * __compactRuntime.checkRuntimeVersion('0.16.0');
 * ```
 *
 * That is a **bare specifier in generated code**, which compact-js neither owns nor can rewrite,
 * and `checkRuntimeVersion` hard-fails across minors while the major is 0. So the era of a
 * contract is decided by *how that specifier resolves where the contract file lives* — not by
 * which compact-js entry the application imported. No amount of era-parameterising inside
 * compact-js changes it: an era-suffixed subpath cannot reach into generated code's imports.
 *
 * The consequence is the pattern this suite pins: to run both eras in one process, give each era's
 * contracts a **resolution scope** whose `@midnight-ntwrk/compact-runtime` is that era's line. Node
 * resolves bare specifiers by walking `node_modules` up from the importing file, so a nested
 * `node_modules` does it; a bundler alias scoped to a directory does the same job (that is exactly
 * how `vitest.era8.config.ts` runs the era 8 suite).
 *
 * This test runs in the **default** project, whose `@midnight-ntwrk/compact-runtime` is 0.19, and
 * adds a ledger 8 scope beside it. So it demonstrates the real-world arrangement rather than a
 * single-era approximation: one process, one era 9 contract and one era 8 contract, both executing.
 *
 * Two details that are easy to get wrong, and are the reason this is a test rather than a doc note:
 *
 * - The era 8 artifact must be **copied** into the scope, not symlinked. Node resolves a module to
 *   its real path before resolving *its* imports, so a symlinked artifact would resolve its runtime
 *   from the original location — back to 0.19 — and throw.
 * - The scope needs its own `package.json` with `"type": "module"`, or the emitted ESM artifact is
 *   parsed as CommonJS.
 */
const ERA9_COUNTER = resolve(import.meta.dirname, '../contract/managed/counter');
const ERA8_COUNTER = resolve(import.meta.dirname, '../contract/managed-v8/counter');
const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const WORKSPACE_MODULES = resolve(PACKAGE_ROOT, '../node_modules');

const FIXTURES_PRESENT =
  existsSync(resolve(ERA9_COUNTER, 'contract/index.js')) && existsSync(resolve(ERA8_COUNTER, 'contract/index.js'));

/**
 * Builds a ledger 8 resolution scope: a directory whose `node_modules` maps the bare specifier
 * `@midnight-ntwrk/compact-runtime` onto the 0.16 line, with the era 8 artifact copied inside it.
 *
 * This function *is* the recipe — a consumer does the same thing with a nested install, a bundler
 * alias, or a per-era workspace.
 */
const makeLedgerEightScope = (): string => {
  const scope = mkdtempSync(join(tmpdir(), 'compact-js-era8-scope-'));
  const scopedModules = join(scope, 'node_modules');
  mkdirSync(join(scopedModules, '@midnight-ntwrk'), { recursive: true });

  // The redirect that decides the era for everything under `scope`.
  symlinkSync(
    resolve(WORKSPACE_MODULES, 'compact-runtime-ledger8'),
    join(scopedModules, '@midnight-ntwrk/compact-runtime')
  );
  // compact-runtime 0.16's own dependencies, resolved from this scope for the same reason.
  symlinkSync(
    resolve(WORKSPACE_MODULES, '@midnight-ntwrk/onchain-runtime-v3'),
    join(scopedModules, '@midnight-ntwrk/onchain-runtime-v3')
  );
  symlinkSync(resolve(WORKSPACE_MODULES, 'object-inspect'), join(scopedModules, 'object-inspect'));

  writeFileSync(join(scope, 'package.json'), JSON.stringify({ type: 'module' }));
  // Copied, not symlinked — see the note in this module's docs.
  cpSync(ERA8_COUNTER, join(scope, 'counter'), { recursive: true });

  return scope;
};

const describeWithFixtures = FIXTURES_PRESENT ? describe : describe.skip;

describeWithFixtures('two ledger eras in one process', () => {
  const scopes: string[] = [];

  afterAll(() => {
    for (const scope of scopes) rmSync(scope, { recursive: true, force: true });
  });

  const witnesses = { private_increment: ({ privateState }: { privateState: unknown }) => [privateState, []] };

  type InitialState = { currentContractState: unknown; currentPrivateState: unknown };

  type CounterModule = {
    Contract: new (witnesses: Record<string, unknown>) => {
      // Era 9 returns a promise and takes `{ initialPrivateState, initialZswapLocalState }`; era 8
      // is synchronous and takes the runtime's own constructor context. One more era difference
      // this pattern has to tolerate, since the artifacts are generated per era.
      initialState: (context: unknown) => InitialState | Promise<InitialState>;
      // `provableCircuits` on both eras, and async on both — the same collection
      // `ContractExecutable` drives.
      provableCircuits: Record<string, (context: unknown) => Promise<{ result: unknown }>>;
    };
  };

  type RuntimeModule = {
    versionString: string;
    createConstructorContext: (privateState: unknown, coinPublicKey: string) => unknown;
    createCircuitContext: (...args: never[]) => unknown;
    emptyZswapLocalState: (coinPublicKey: string) => unknown;
    sampleContractAddress: () => string;
  };

  it('resolves a different compact-runtime line per scope', async () => {
    const scope = makeLedgerEightScope();
    scopes.push(scope);

    const era9Runtime = (await import('@midnight-ntwrk/compact-runtime')) as unknown as RuntimeModule;
    const era8Runtime = (await import(
      join(scope, 'node_modules/@midnight-ntwrk/compact-runtime/dist/index.js')
    )) as unknown as RuntimeModule;

    expect(era9Runtime.versionString.startsWith('0.19')).toBe(true);
    expect(era8Runtime.versionString).toBe('0.16.0');
    // Distinct module instances, not one shared copy — which is what makes the two eras independent.
    expect(era8Runtime).not.toBe(era9Runtime);
  });

  it('loads both eras\' compiled contracts without a version mismatch', async () => {
    const scope = makeLedgerEightScope();
    scopes.push(scope);

    // In the default project this era 8 import throws `Version mismatch: compiled code expects
    // 0.16.0, runtime is 0.19.0-rc.0`. Inside the scope it resolves 0.16 and loads.
    const era9 = (await import(resolve(ERA9_COUNTER, 'contract/index.js'))) as CounterModule;
    const era8 = (await import(join(scope, 'counter/contract/index.js'))) as CounterModule;

    expect(era9.Contract).toBeTypeOf('function');
    expect(era8.Contract).toBeTypeOf('function');
    expect(era8.Contract).not.toBe(era9.Contract);
  });

  it('executes a circuit on each era, in the same process', async () => {
    const scope = makeLedgerEightScope();
    scopes.push(scope);

    const era9Runtime = (await import('@midnight-ntwrk/compact-runtime')) as unknown as RuntimeModule;
    const era8Runtime = (await import(
      join(scope, 'node_modules/@midnight-ntwrk/compact-runtime/dist/index.js')
    )) as unknown as RuntimeModule;
    const era9 = (await import(resolve(ERA9_COUNTER, 'contract/index.js'))) as CounterModule;
    const era8 = (await import(join(scope, 'counter/contract/index.js'))) as CounterModule;

    const coinPublicKey = '0'.repeat(64);

    // Era 9: call-tree model, one options object.
    const era9Contract = new era9.Contract(witnesses);
    const era9Initial = await era9Contract.initialState({
      initialPrivateState: { count: 0 },
      initialZswapLocalState: era9Runtime.emptyZswapLocalState(coinPublicKey)
    });
    const era9Result = await era9Contract.provableCircuits.increment!(
      (era9Runtime.createCircuitContext as (options: unknown) => unknown)({
        circuitId: 'increment',
        contractAddress: era9Runtime.sampleContractAddress(),
        coinPublicKeyOrZswapState: era9Runtime.emptyZswapLocalState(coinPublicKey),
        contractState: era9Initial.currentContractState,
        privateState: era9Initial.currentPrivateState
      }) as never
    );

    // Era 8: flat single-frame model, contract address first and no circuit id.
    const era8Contract = new era8.Contract(witnesses);
    const era8Initial = await era8Contract.initialState(
      era8Runtime.createConstructorContext({ count: 0 }, coinPublicKey)
    );
    const era8Result = await era8Contract.provableCircuits.increment!(
      (era8Runtime.createCircuitContext as (...a: unknown[]) => unknown)(
        era8Runtime.sampleContractAddress(),
        era8Runtime.emptyZswapLocalState(coinPublicKey),
        era8Initial.currentContractState,
        era8Initial.currentPrivateState
      ) as never
    );

    expect(era9Result.result).toEqual([]);
    expect(era8Result.result).toEqual([]);
  });

  it('keeps the host process on its own era', async () => {
    // The scope redirects only what resolves *from inside it*. The application's own
    // `@midnight-ntwrk/compact-runtime` — and so the compact-js facades built on it — are
    // untouched, which is what makes this arrangement additive rather than a global switch.
    const scope = makeLedgerEightScope();
    scopes.push(scope);
    await import(join(scope, 'counter/contract/index.js'));

    const hostRuntime = (await import('@midnight-ntwrk/compact-runtime')) as unknown as RuntimeModule;
    expect(hostRuntime.versionString.startsWith('0.19')).toBe(true);
  });
});
