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
import { NodeContext } from '@effect/platform-node';
import { describe, it } from '@effect/vitest';
import { circuitCommand, ConfigCompiler } from '@midnight-ntwrk/compact-js-command/effect';
import { Console, Effect, Layer } from 'effect';

import { ensureRemovePath } from './cleanup.js';
import * as MockConsole from './MockConsole.js';

const COUNTER_CONFIG_FILEPATH = resolve(import.meta.dirname, '../contract/counter/contract.config.ts');
const COUNTER_STATE_FILEPATH = resolve(import.meta.dirname, '../contract/counter/state.bin');
const COUNTER_OUTPUT_PS_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_era.json');

const testLayer: Layer.Layer<ConfigCompiler.ConfigCompiler | NodeContext.NodeContext | FileSystem.FileSystem> =
  Effect.gen(function* () {
    const console = yield* MockConsole.make;
    return Layer.mergeAll(
      Console.setConsole(console),
      ConfigCompiler.layer.pipe(Layer.provideMerge(NodeContext.layer))
    );
  }).pipe(Layer.unwrapEffect);

// The command args are era-agnostic boilerplate; only `--ledger-era` varies per test. The circuit
// is deliberately unknown so an accepted era stops at the cheap, deterministic manifest error
// instead of executing a full circuit.
const cliArgs = (ledgerEra: string) => [
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
  '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a',
  'unknown_circuit'
];

describe('--ledger-era option', () => {
  it.effect(
    'accepts the era this build is pinned to',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });
        yield* cli(cliArgs('9'));

        // Reaching the manifest error proves era validation passed and the command proceeded.
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.length).toBe(1);
        expect(lines[0]).toMatch(/Circuit 'unknown_circuit' not found/);
      }).pipe(Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)), Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    'rejects an era this build is not pinned to',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });
        const exit = yield* Effect.exit(cli(cliArgs('8')));

        expect(exit._tag).toBe('Failure');
        expect(String(exit)).toMatch(/pinned to ledger era 9/);
      }).pipe(Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)), Effect.provide(testLayer)),
    30_000
  );
});
