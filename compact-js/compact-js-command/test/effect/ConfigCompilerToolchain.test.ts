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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@effect/vitest';
import { create } from 'ts-node';

/**
 * Guards the TypeScript toolchain `ConfigCompiler` transpiles a `contract.config.ts` with.
 *
 * @remarks
 * `ts-node` 10 drives the classic TypeScript compiler API, and declares no upper bound on it — its
 * peer range is `typescript: >=2.7`. TypeScript 7 is the native port and does not expose that API,
 * so an install left to float resolves 7 and *every* CLI invocation dies with
 * `Cannot read properties of undefined (reading 'fileExists')` before it reaches any command.
 *
 * The bound therefore has to be declared by this package: a consumer installing
 * `@midnight-ntwrk/compact-js-command` gets `ts-node` and whatever `typescript` we let their
 * package manager pick. The repository's root `devDependency` does not travel with the published
 * package and so cannot stand in for it.
 */
const PACKAGE_JSON: { readonly dependencies: Record<string, string> } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf-8')
);

describe('the TypeScript toolchain behind ConfigCompiler', () => {
  it('is declared as a dependency, bounded below the TypeScript 7 line', () => {
    // Asserted as the literal range rather than a satisfies check, so that widening it is a
    // deliberate edit that has to revisit the remark above. `>=5.0.0` is the floor this package's
    // own sources target; `<7.0.0` is the line `ts-node` 10 cannot drive.
    expect(PACKAGE_JSON.dependencies.typescript).toBe('>=5.0.0 <7.0.0');
  });

  it('transpiles TypeScript through ts-node', async () => {
    const { version } = await import('typescript');

    expect(
      create({ cwd: import.meta.dirname }).compile(
        'export const answer: number = 42;\n',
        resolve(import.meta.dirname, 'toolchainProbe.ts')
      ),
      `ts-node 10 cannot drive TypeScript ${version}`
    ).toContain('export const answer = 42;');
  });
});
