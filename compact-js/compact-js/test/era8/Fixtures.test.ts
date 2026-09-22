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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The era 8 evidence must exist.**
 *
 * @remarks
 * Every other suite in this project reads a generated artifact under `test/contract/managed-v8/`,
 * and each one `describe.skip`s itself when that artifact is absent — reasonable on a developer's
 * first checkout, and silent everywhere else. Combined with a `build-compact-v8` script that
 * swallowed a compactc failure, the whole ledger 8 story could report green while proving nothing:
 * no fixtures, no execution, no adapter coverage, and no way to tell from the output.
 *
 * This suite is the one that does not skip. If the fixtures are missing it fails, names the script
 * that builds them, and the era 8 project goes red as a whole — so a CI leg that cannot run
 * compactc 0.31.1 reports that, instead of reporting nothing.
 */
const FIXTURE_ROOT = resolve(import.meta.dirname, '../contract/managed-v8');

// One entry per contract `yarn compact-v8` compiles. `unshielded` is here because the era 8 set is
// not "whatever happened to compile": it is the ledger 9 set minus the cross-contract contracts,
// which compact-runtime 0.16 has no `crossContractCall` to execute.
const ERA8_FIXTURES = ['counter', 'unshielded'];

describe('era 8 fixtures', () => {
  it.each(ERA8_FIXTURES)('has a compiled %s contract', (name) => {
    const artifact = resolve(FIXTURE_ROOT, name, 'contract/index.js');

    expect(
      existsSync(artifact),
      `Missing era 8 fixture '${name}' at ${artifact}. Run \`yarn compact-v8\` (compactc 0.31.1, ` +
        `the compiler paired with ledger 8 / compact-runtime 0.16).`
    ).toBe(true);
  });

  it.each(ERA8_FIXTURES)('has the ZK assets for %s', (name) => {
    const keys = resolve(FIXTURE_ROOT, name, 'keys');

    expect(
      existsSync(keys),
      `Missing era 8 ZK assets for '${name}' at ${keys}. Run \`yarn compact-v8\`.`
    ).toBe(true);
  });
});
