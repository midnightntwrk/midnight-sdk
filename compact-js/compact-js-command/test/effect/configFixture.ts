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

import { copyFileSync, rmSync } from 'node:fs';
import { join, parse } from 'node:path';

import { afterAll } from '@effect/vitest';

/**
 * Copies a shared `contract.config.ts` fixture to a sibling path owned by a single test file, and
 * registers its removal once that file's tests are done.
 *
 * @remarks
 * `ConfigCompiler` transpiles `<name>.ts` to a sibling `<name>.js` and then imports it. Test files
 * run in parallel, so every file pointing a command at the same fixture puts several workers on
 * one pair of paths: one worker's cleanup can unlink the `.js` between another's staleness check
 * and its `import()` (`ERR_MODULE_NOT_FOUND`), and two workers can write it while a third reads a
 * half-written module (`SyntaxError`). A private copy per test file removes the sharing rather
 * than trying to order it.
 *
 * The copy is a *sibling* of the original, so the fixture's relative imports of the compiled
 * contract still resolve, and it is rewritten on every run, so a `.js` left behind by an
 * interrupted run is older than its source and gets recompiled.
 *
 * @param configFilePath An absolute path to the shared `contract.config.ts` fixture.
 * @param owner A slug identifying the calling test file, used to name the copy.
 * @returns An absolute path to the copy, for use as the `-c` argument.
 */
export const useConfigFixture = (configFilePath: string, owner: string): string => {
  const { dir, name, ext } = parse(configFilePath);
  const fixtureFilePath = join(dir, `${name}.${owner}${ext}`);

  copyFileSync(configFilePath, fixtureFilePath);
  afterAll(() => {
    rmSync(fixtureFilePath, { force: true });
    rmSync(join(dir, `${name}.${owner}.js`), { force: true });
  });

  return fixtureFilePath;
};
