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
import { circuitCommand, deployCommand, maintainCommand } from '@midnight-ntwrk/compact-js-command/effect';
import { sampleSigningKey } from '@midnightntwrk/ledger-v9';
import { Effect } from 'effect';

import { ensureRemovePath } from './cleanup.js';
import { useConfigFixture } from './configFixture.js';
import * as MockConsole from './MockConsole.js';
import { testLayer } from './testLayer.js';

// Test files run in parallel, so each owns a distinct path for every artefact it writes — the
// config fixture (which is transpiled to a sibling `.js` before import) as much as the outputs
// below: a shared name lets one file's cleanup delete another's artefact mid-read.
const COUNTER_CONFIG_FILEPATH = useConfigFixture(
  resolve(import.meta.dirname, '../contract/counter/contract.config.ts'),
  'ledger-era'
);
const COUNTER_STATE_FILEPATH = resolve(import.meta.dirname, '../contract/counter/state.bin');
const COUNTER_OUTPUT_PS_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_era.json');
const COUNTER_OUTPUT_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_era.bin');
const COUNTER_ADDRESS = '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a';

const circuitCli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });
const deployCli = Command.run(deployCommand, { name: 'deploy', version: '0.0.0' });
const maintainCli = Command.run(maintainCommand, { name: 'maintain', version: '0.0.0' });

// The command args are era-agnostic boilerplate; only `--ledger-era` varies per test. The circuit
// is deliberately unknown so an accepted era stops at the cheap, deterministic manifest error
// instead of executing a full circuit.
const circuitCliArgs = (ledgerEra: string) => [
  'node',
  'circuit.ts',
  '--ledger-era',
  ledgerEra,
  '-c',
  COUNTER_CONFIG_FILEPATH,
  '--input',
  COUNTER_STATE_FILEPATH,
  '--input-ps',
  COUNTER_OUTPUT_PS_FILEPATH,
  '--output-ps',
  COUNTER_OUTPUT_PS_FILEPATH,
  COUNTER_ADDRESS,
  'unknown_circuit'
];

// Asserts that `invocation` fails during option parsing with the era-pinned rejection. Rejection
// happens before any handler runs, so these need no filesystem setup or cleanup.
const expectEraRejected = <A, E, R>(invocation: Effect.Effect<A, E, R>): Effect.Effect<void, never, R> =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(invocation);

    expect(exit._tag).toBe('Failure');
    expect(String(exit)).toMatch(/pinned to ledger era 9/);
    // The message names the era the CLI actually heard, so a user with several builds can tell
    // which one they invoked.
    expect(String(exit)).toMatch(/ledger era 8/);
  });

describe('--ledger-era option', () => {
  it.effect(
    'accepts the era this build is pinned to',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        yield* circuitCli(circuitCliArgs('9'));

        // Reaching the manifest error proves era validation passed and the command proceeded.
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.length).toBe(1);
        expect(lines[0]).toMatch(/Circuit 'unknown_circuit' not found/);
      }).pipe(Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)), Effect.provide(testLayer)),
    30_000
  );

  // Every command carries the gate via `GlobalOptions`; each is exercised so a command that drops
  // the spread fails here rather than silently accepting any era.
  it.effect(
    '`circuit` rejects an era this build is not pinned to',
    () => expectEraRejected(circuitCli(circuitCliArgs('8'))).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    '`deploy` rejects an era this build is not pinned to',
    () =>
      expectEraRejected(
        deployCli(['node', 'deploy.ts', '--ledger-era', '8', '-c', COUNTER_CONFIG_FILEPATH])
      ).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    '`maintain contract` rejects an era this build is not pinned to',
    () =>
      expectEraRejected(
        maintainCli([
          'node',
          'maintain.ts',
          'contract',
          '--ledger-era',
          '8',
          '-s',
          sampleSigningKey().value,
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          COUNTER_ADDRESS,
          sampleSigningKey().value
        ])
      ).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    '`maintain circuit` rejects an era this build is not pinned to',
    () =>
      expectEraRejected(
        maintainCli([
          'node',
          'maintain.ts',
          'circuit',
          '--ledger-era',
          '8',
          '-s',
          sampleSigningKey().value,
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          COUNTER_ADDRESS,
          'increment'
        ])
      ).pipe(Effect.provide(testLayer)),
    30_000
  );
});
