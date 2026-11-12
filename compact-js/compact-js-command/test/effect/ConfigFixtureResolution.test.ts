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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from '@effect/vitest';

/**
 * Holds the `contract.config.ts` fixtures to the module shape a real consumer runs.
 *
 * @remarks
 * `ConfigCompiler` transpiles a configuration to a sibling `.js` and then `import()`s it in the
 * CLI's own process — plain Node ESM, no bundler. Node's ESM resolver does no extension guessing
 * for relative specifiers, so `'./contract/index'` is `ERR_MODULE_NOT_FOUND` there however well it
 * resolves under vite-node.
 *
 * These fixtures are the only worked examples of a configuration in the repository, so a specifier
 * that only vite-node resolves makes them demonstrate a shape that does not run. The check is the
 * resolver's own rule: a relative specifier names exactly one existing file, extension included.
 *
 * Bare specifiers are deliberately not checked — those go through package `exports`, which is a
 * different resolution and not the one that was wrong.
 */
const CONTRACT_FIXTURES_DIRECTORY = resolve(import.meta.dirname, '../contract');

// `useConfigFixture` drops per-test-file copies (`contract.config.<owner>.ts`) beside the originals
// while the suite runs; the `.config.ts` suffix excludes them without needing to order against it.
const configFixtureFilePaths: readonly string[] = readdirSync(CONTRACT_FIXTURES_DIRECTORY, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) =>
    readdirSync(join(CONTRACT_FIXTURES_DIRECTORY, entry.name))
      .filter((fileName) => fileName.endsWith('.config.ts'))
      .map((fileName) => join(CONTRACT_FIXTURES_DIRECTORY, entry.name, fileName))
  );

const relativeSpecifiersOf = (source: string): readonly string[] =>
  [...source.matchAll(/\bfrom\s+'(\.[^']+)'/g)].map(([, specifier]) => specifier);

describe('contract configuration fixtures', () => {
  it('should be discovered', () => {
    expect(configFixtureFilePaths.length).toBeGreaterThan(0);
  });

  describe.each(configFixtureFilePaths.map((filePath) => [relative(CONTRACT_FIXTURES_DIRECTORY, filePath), filePath]))(
    '%s',
    (_label, configFixtureFilePath) => {
      it('should import the compiled contract with a specifier Node can resolve', () => {
        const source = readFileSync(configFixtureFilePath, 'utf-8');
        const unresolvable = relativeSpecifiersOf(source).filter(
          (specifier) => !existsSync(resolve(dirname(configFixtureFilePath), specifier))
        );

        expect(unresolvable).toStrictEqual([]);
      });
    }
  );
});
