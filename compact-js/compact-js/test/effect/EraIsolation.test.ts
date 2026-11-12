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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Era isolation of the built entries — #388's "a test proves the unused era is not instantiated,
 * so a bundler cannot quietly pull both WASM blobs in".
 *
 * @remarks
 * Asserted on the **static import graph of the built ESM output**, not by observing a running
 * process, and that is the deliberate choice. What #388 is protecting against is a bundler
 * following a static `import` into the other era and emitting both ~10 MB WASM payloads. That is a
 * property of the module graph, so reading the graph is both the direct measurement and a
 * deterministic one — a run-time probe would only tell us what *this* process happened to touch,
 * and cannot see a bundler's decisions at all.
 *
 * Walks every transitively reachable relative import from an entry and checks which era packages
 * appear. Package specifiers are recorded rather than followed: the point is which era each entry
 * *reaches*, not what those packages do internally.
 *
 * Skips when the build output is absent, so `vitest` alone stays runnable; CI runs `yarn build`
 * first, and the assertions below are the reason that ordering matters.
 */
const ESM_BUILD = resolve(import.meta.dirname, '../../build/esm');

const LEDGER_NINE_PACKAGES = ['@midnightntwrk/ledger-v9', '@midnight-ntwrk/compact-runtime'];
const LEDGER_EIGHT_PACKAGES = ['@midnightntwrk/ledger-v8', 'compact-runtime-ledger8'];

/** Collects every package specifier reachable from `entry` through relative imports. */
const reachablePackages = (entry: string): ReadonlySet<string> => {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    // Covers `import … from '…'`, `export … from '…'` and bare `import '…'` in emitted ESM.
    for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier));
      } else {
        packages.add(specifier);
      }
    }
  }

  return packages;
};

const describeWithBuild = existsSync(ESM_BUILD) ? describe : describe.skip;

describeWithBuild('era isolation of built entries', () => {
  it('keeps the ledger 8 era out of the ledger 9 entry', () => {
    const reached = reachablePackages(resolve(ESM_BUILD, 'v9/effect.js'));

    for (const era8Package of LEDGER_EIGHT_PACKAGES) {
      expect([...reached]).not.toContain(era8Package);
    }
  });

  it('keeps the ledger 9 era out of the ledger 8 entry', () => {
    const reached = reachablePackages(resolve(ESM_BUILD, 'v8/effect.js'));

    // The direction that actually bit during development: the era-8 entry reaches the shared
    // conversions factory, which sits beside modules that bind ledger 9. Sharing *code* between
    // eras must not mean sharing *dependencies*.
    for (const era9Package of LEDGER_NINE_PACKAGES) {
      expect([...reached]).not.toContain(era9Package);
    }
  });

  it('has each era entry reach its own era packages', () => {
    // The negative checks above would pass trivially if the walker found nothing at all.
    const fromV9 = reachablePackages(resolve(ESM_BUILD, 'v9/effect.js'));
    const fromV8 = reachablePackages(resolve(ESM_BUILD, 'v8/effect.js'));

    expect([...fromV9]).toContain('@midnightntwrk/ledger-v9');
    expect([...fromV8]).toContain('@midnightntwrk/ledger-v8');
    expect([...fromV8]).toContain('compact-runtime-ledger8');
  });

  it('keeps the unsuffixed entry on a single era', () => {
    // The unsuffixed entry targets the build's bound era. Reaching both would mean a consumer who
    // never asked for ledger 8 still pays for its WASM.
    const reached = reachablePackages(resolve(ESM_BUILD, 'effect/index.js'));

    for (const era8Package of LEDGER_EIGHT_PACKAGES) {
      expect([...reached]).not.toContain(era8Package);
    }
  });
});
