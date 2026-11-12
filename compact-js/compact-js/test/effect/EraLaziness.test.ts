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

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **Era laziness at run time** — #388's "importing `/v9` loads exactly one ledger WASM".
 *
 * @remarks
 * `EraIsolation.test.ts` answers the *bundler's* question by reading the built ESM import graph:
 * which era packages does an entry statically reach. This suite answers the *process's* question,
 * which is not the same one. A static edge is not proof that the payload is paid for, and the
 * absence of one is not proof that it is not — a transitive dependency, a side-effecting re-export,
 * or a package that instantiates on load can all put a second 10 MB ledger module into a process
 * whose import graph looked clean. So the measurement here is the instantiation itself.
 *
 * Both ledger packages compile their WASM as a **top-level module side effect**:
 *
 * ```js
 * const bytes = readFileSync(wasmPath);
 * const wasmModule = new WebAssembly.Module(bytes);
 * ```
 *
 * which makes "was this era loaded" exactly "did `WebAssembly.Module` get constructed from that
 * package". The probe below patches the three entry points that turn bytes into a compiled module
 * — `new WebAssembly.Module`, `WebAssembly.compile`, `WebAssembly.instantiate` — attributes each
 * one to the `node_modules` package whose frame called it, and reports the tally. Patching all
 * three rather than just the constructor is deliberate: a future ledger build that switched to the
 * async API would otherwise go uncounted, and an uncounted load reads as a *pass*.
 *
 * Each entry is measured in its **own child process**, because a module graph is per-process: two
 * entries measured in one process would share whatever the first one loaded, and the second would
 * report zero. The final case then deliberately loads both in one process — which is both the
 * dual-era guarantee (two eras, two distinct ledger modules, no collapsing) and the control that
 * keeps the single-entry counts honest, since a probe that silently missed instantiations would
 * report one era's count as zero rather than two.
 *
 * Skips when the build output is absent so `vitest` alone stays runnable; CI runs `yarn build`
 * first, and these assertions are the reason that ordering matters.
 */
const ESM_BUILD = resolve(import.meta.dirname, '../../build/esm');
const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');

const ENTRY = {
  v9: resolve(ESM_BUILD, 'v9/effect.js'),
  v8: resolve(ESM_BUILD, 'v8/effect.js'),
  unsuffixed: resolve(ESM_BUILD, 'effect/index.js')
} as const;

/**
 * The era packages, by half. A ledger era pairs one of each.
 *
 * Both scope spellings are listed for the same reason `eslint.config.mjs` lists both on the ledger
 * seam: the two lines are not published consistently. Era 9's onchain runtime is installed under
 * the unhyphenated `@midnightntwrk`, era 8's under the hyphenated `@midnight-ntwrk`, and a list
 * carrying only one spelling would silently read the other era's load as *no* load — a pass.
 */
const LEDGER_PACKAGES = [
  '@midnightntwrk/ledger-v8',
  '@midnightntwrk/ledger-v9',
  '@midnight-ntwrk/ledger-v8',
  '@midnight-ntwrk/ledger-v9'
];
const ONCHAIN_RUNTIME_PACKAGES = [
  '@midnightntwrk/onchain-runtime-v3',
  '@midnightntwrk/onchain-runtime-v4',
  '@midnight-ntwrk/onchain-runtime-v3',
  '@midnight-ntwrk/onchain-runtime-v4'
];

const MARKER = '__WASM_INSTANTIATIONS__';

/**
 * The child-process probe, as source. `String.raw` so the probe's own escapes (`'\n'`, the regex)
 * reach it verbatim instead of being interpreted by this file's template literal.
 */
const PROBE = String.raw`
const records = [];

/** The first stack frame below the probe that sits in a package — i.e. whoever compiled the WASM. */
const packageOf = (stack) => {
  for (const line of String(stack).split('\n').slice(1)) {
    const matches = [...line.matchAll(/node_modules\/(@[^/]+\/[^/]+|[^@/][^/]*)\//g)];
    // Last match, not first: a nested install path names the outer package before the inner one,
    // and it is the inner one that owns the frame.
    if (matches.length > 0) return matches[matches.length - 1][1];
  }
  return 'unknown';
};

const record = (bytes, stack) => {
  records.push({ package: packageOf(stack), byteLength: bytes.byteLength ?? bytes.length ?? 0 });
};

const OriginalModule = WebAssembly.Module;
WebAssembly.Module = class extends OriginalModule {
  constructor(bytes, ...rest) {
    record(bytes, new Error().stack);
    super(bytes, ...rest);
  }
};

const originalCompile = WebAssembly.compile;
WebAssembly.compile = (bytes, ...rest) => {
  record(bytes, new Error().stack);
  return originalCompile(bytes, ...rest);
};

const originalInstantiate = WebAssembly.instantiate;
WebAssembly.instantiate = (source, ...rest) => {
  // Only the bytes overload compiles; the module overload was already counted when it compiled.
  if (!(source instanceof OriginalModule)) record(source, new Error().stack);
  return originalInstantiate(source, ...rest);
};

for (const entry of JSON.parse(process.env.COMPACT_JS_PROBE_ENTRIES)) {
  await import(entry);
}

console.log('__WASM_INSTANTIATIONS__' + JSON.stringify(records));
`;

type Instantiation = { package: string; byteLength: number };

/** Imports `entries` in a fresh process and returns every WASM module it compiled, in order. */
const wasmInstantiations = (...entries: readonly string[]): readonly Instantiation[] => {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', PROBE], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      COMPACT_JS_PROBE_ENTRIES: JSON.stringify(entries.map((entry) => pathToFileURL(entry).href))
    },
    // A ledger WASM is ~10 MB to compile, and the era 8 entry pays for it twice over in the
    // dual-era case.
    maxBuffer: 16 * 1024 * 1024
  });

  const line = output.split('\n').find((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) throw new Error(`probe produced no tally; output was:\n${output}`);
  return JSON.parse(line.slice(MARKER.length)) as Instantiation[];
};

const packagesIn = (instantiations: readonly Instantiation[], group: readonly string[]): readonly string[] =>
  instantiations.map((instantiation) => instantiation.package).filter((name) => group.includes(name));

const describeWithBuild = existsSync(ESM_BUILD) ? describe : describe.skip;

describeWithBuild('era laziness at run time', () => {
  it('loads exactly one ledger WASM when only the ledger 9 entry is imported', () => {
    const instantiations = wasmInstantiations(ENTRY.v9);

    // #388's criterion, literally: one, and it is era 9's.
    expect(packagesIn(instantiations, LEDGER_PACKAGES)).toEqual(['@midnightntwrk/ledger-v9']);
    // The runtime half is era-paired with the ledger, and carries its own WASM. An entry that was
    // lazy in the ledger but eager in the runtime would still make a consumer pay for both eras.
    expect(packagesIn(instantiations, ONCHAIN_RUNTIME_PACKAGES)).toEqual(['@midnightntwrk/onchain-runtime-v4']);
    // Nothing else compiled at all — which is what makes the two assertions above a complete
    // account of the entry rather than a filtered view of it.
    expect(instantiations).toHaveLength(2);
  }, 120_000);

  it('loads exactly one ledger WASM when only the ledger 8 entry is imported', () => {
    const instantiations = wasmInstantiations(ENTRY.v8);

    // The direction that costs more to get wrong: the era 8 entry reaches the shared conversions
    // factory, which sits beside modules that bind ledger 9.
    expect(packagesIn(instantiations, LEDGER_PACKAGES)).toEqual(['@midnightntwrk/ledger-v8']);
    expect(packagesIn(instantiations, ONCHAIN_RUNTIME_PACKAGES)).toEqual(['@midnight-ntwrk/onchain-runtime-v3']);
    expect(instantiations).toHaveLength(2);
  }, 120_000);

  it('loads exactly one ledger WASM for the unsuffixed entry', () => {
    const instantiations = wasmInstantiations(ENTRY.unsuffixed);

    // The unsuffixed entry follows the build's bound era. A consumer who never named an era should
    // still pay for exactly one.
    expect(packagesIn(instantiations, LEDGER_PACKAGES)).toEqual(['@midnightntwrk/ledger-v9']);
    expect(instantiations).toHaveLength(2);
  }, 120_000);

  it('loads both ledger WASMs, distinctly, when both entries are imported', () => {
    const instantiations = wasmInstantiations(ENTRY.v9, ENTRY.v8);

    // Two eras in one process: each era's module is compiled once, and the two are different
    // modules rather than one shared instance — #388's co-installability guarantee, measured at
    // the point the payload is actually paid for.
    expect(packagesIn(instantiations, LEDGER_PACKAGES)).toEqual([
      '@midnightntwrk/ledger-v9',
      '@midnightntwrk/ledger-v8'
    ]);
    const byteLengths = instantiations
      .filter((instantiation) => LEDGER_PACKAGES.includes(instantiation.package))
      .map((instantiation) => instantiation.byteLength);
    expect(new Set(byteLengths).size).toBe(2);

    // And the control on the three cases above: a probe that missed instantiations would report
    // *fewer* here, not more, so the single-entry counts of one cannot be passing vacuously.
    expect(instantiations).toHaveLength(4);
  }, 180_000);
});
