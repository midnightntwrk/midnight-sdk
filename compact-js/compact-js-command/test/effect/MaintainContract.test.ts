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

import { Command } from '@effect/cli';
import { describe, it } from '@effect/vitest';
import { maintainCommand } from '@midnight-ntwrk/compact-js-command/effect';
import { sampleSigningKey } from '@midnightntwrk/ledger-v9';
import { Effect } from 'effect';

import { ensureRemovePath } from './cleanup.js';
import * as MockConsole from './MockConsole.js';
import { testLayer } from './testLayer.js';

const COUNTER_CONFIG_FILEPATH = resolve(import.meta.dirname, '../contract/counter/contract.config.ts');
const COUNTER_STATE_FILEPATH = resolve(import.meta.dirname, '../contract/counter/state.bin');
// Test files run in parallel, so each owns a distinct output path: a shared name lets one file's
// cleanup delete another's artefact mid-read.
const COUNTER_OUTPUT_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_maintain_contract.bin');

// These tests were long skipped because each package loaded its own ledger WASM instance: a
// `MaintenanceUpdate` built in `compact-js` failed `Intent.addMaintenanceUpdate()` in
// `compact-js-command` with 'expected instance of MaintenanceUpdate'. Both packages now reach one
// ledger binding through the `Ledger` facade, and these tests are the behavioural regression
// guard for exactly that dual-instance failure.
// @seealso ./MaintainCircuit.test.ts
describe('Maintain Contract Command', () => {
  it.effect(
    'should report success with valid setup',
    () =>
      Effect.gen(function* () {
        const cli = Command.run(maintainCommand, { name: 'maintain', version: '0.0.0' });

        yield* cli([
          'node',
          'maintain.ts',
          'contract',
          '-s',
          sampleSigningKey().value,
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a',
          sampleSigningKey().value
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.length).toBe(0);
      }).pipe(
        Effect.ensuring(ensureRemovePath(COUNTER_CONFIG_FILEPATH.replace('.ts', '.js'))),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_FILEPATH)),
        Effect.provide(testLayer)
      ),
    30_000
  );
});
