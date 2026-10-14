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
import { FileSystem } from '@effect/platform';
import { describe, it } from '@effect/vitest';
import { maintainCommand } from '@midnight-ntwrk/compact-js-command/effect';
import {
  Intent,
  MaintenanceUpdate,
  ReplaceAuthority,
  sampleSigningKey
} from '@midnightntwrk/ledger-v9';
import { Effect } from 'effect';

import { ensureRemovePath } from './cleanup.js';
import { useConfigFixture } from './configFixture.js';
import * as MockConsole from './MockConsole.js';
import { testLayer } from './testLayer.js';

// Test files run in parallel, so each owns a distinct path for every artefact it writes — the
// config fixture (which is transpiled to a sibling `.js` before import) as much as the output
// intent: a shared name lets one file's cleanup delete another's artefact mid-read.
const COUNTER_CONFIG_FILEPATH = useConfigFixture(
  resolve(import.meta.dirname, '../contract/counter/contract.config.ts'),
  'maintain-contract'
);
const COUNTER_STATE_FILEPATH = resolve(import.meta.dirname, '../contract/counter/state.bin');
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
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_FILEPATH)),
        Effect.provide(testLayer)
      ),
    30_000
  );

  it.effect(
    'installs an ECDSA authority when --signing-kind ecdsa is given for the new key',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cli = Command.run(maintainCommand, { name: 'maintain', version: '0.0.0' });

        yield* cli([
          'node',
          'maintain.ts',
          'contract',
          '-s',
          sampleSigningKey().value,
          '--signing-kind',
          'ecdsa',
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a',
          sampleSigningKey('ecdsa').value
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.length).toBe(0);

        // The intent's authority replacement must carry the kind named on the command line. The
        // current key above stays 'schnorr' (it is given with `-s` and no kind applies to it), so
        // this also proves the option tags the NEW key without retagging the key that signed the
        // update — the rotation would otherwise install a Schnorr authority under an ECDSA key's
        // bytes, or fail to verify at all.
        const intent = Intent.deserialize(
          'signature',
          'pre-proof',
          'pre-binding',
          yield* fs.readFile(COUNTER_OUTPUT_FILEPATH)
        );
        const update = intent.actions.find((action) => action instanceof MaintenanceUpdate);
        expect(update).toBeInstanceOf(MaintenanceUpdate);
        const replacement = (update as MaintenanceUpdate).updates.find(
          (single) => single instanceof ReplaceAuthority
        );
        expect(replacement).toBeInstanceOf(ReplaceAuthority);
        expect((replacement as ReplaceAuthority).authority.committee).toHaveLength(1);
        expect((replacement as ReplaceAuthority).authority.committee[0].tag).toBe('ecdsa');
      }).pipe(
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_FILEPATH)),
        Effect.provide(testLayer)
      ),
    30_000
  );
});
