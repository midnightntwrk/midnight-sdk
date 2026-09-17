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
import { circuitCommand } from '@midnight-ntwrk/compact-js-command/effect';
import {
  type ContractCall,
  Intent,
  LedgerParameters,
  type PreBinding,
  type PreProof,
  type SignatureEnabled
} from '@midnightntwrk/ledger-v9';
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
  'circuit'
);
const COUNTER_STATE_FILEPATH = resolve(import.meta.dirname, '../contract/counter/state.bin');
const COUNTER_LEDGER_PARAMS_FILEPATH = resolve(import.meta.dirname, '../contract/counter/ledger_parameters.bin');
const COUNTER_OUTPUT_OC_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_circuit_onchain.bin');
const COUNTER_OUTPUT_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_circuit.bin');
const COUNTER_OUTPUT_PS_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_circuit.json');
const COUNTER_OUTPUT_ZSWAP_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_circuit_zswap.json');
const COUNTER_RESULT_FILEPATH = resolve(import.meta.dirname, '../contract/counter/result.json');
const COUNTER_OUTPUT_EVENTS_FILEPATH = resolve(import.meta.dirname, '../contract/counter/output_events.json');
const COUNTER_INPUT_ZSWAP_FILEPATH = resolve(import.meta.dirname, '../contract/counter/input_circuit_zswap.json');

// Passes `EncodedZswapLocalStateSchema` — which validates shape only — and is then rejected by the
// runtime, which requires a 32-byte coin public key. This is the shape of a hand-edited or
// cross-network state file.
const SHORT_KEY_ZSWAP_LOCAL_STATE = {
  coinPublicKey: { bytes: new Array<number>(31).fill(0) },
  currentIndex: '0',
  inputs: [],
  outputs: []
};

describe('Circuit Command', () => {
  it.effect(
    'should report error for unknown circuit in manifest',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

        yield* cli([
          'node',
          'circuit.ts',
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--input-ps',
          COUNTER_OUTPUT_PS_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          '--output-ps',
          COUNTER_OUTPUT_PS_FILEPATH,
          '--output-zswap',
          COUNTER_OUTPUT_ZSWAP_FILEPATH,
          '--output-result',
          COUNTER_RESULT_FILEPATH,
          '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a',
          'unknown_circuit'
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.length).toBe(1);
        expect(lines[0]).toMatch(/Circuit 'unknown_circuit' not found/);
      }).pipe(Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)), Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    'should report success with valid setup',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

        yield* cli([
          'node',
          'circuit.ts',
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--input-ps',
          COUNTER_OUTPUT_PS_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          '--output-oc',
          COUNTER_OUTPUT_OC_FILEPATH,
          '--output-ps',
          COUNTER_OUTPUT_PS_FILEPATH,
          '--output-zswap',
          COUNTER_OUTPUT_ZSWAP_FILEPATH,
          '--output-result',
          COUNTER_RESULT_FILEPATH,
          '--output-events',
          COUNTER_OUTPUT_EVENTS_FILEPATH,
          '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a',
          'increment'
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.length).toBe(0);
        expect(JSON.parse(yield* fs.readFileString(COUNTER_OUTPUT_PS_FILEPATH))).toMatchObject({ count: 101 });
        expect(JSON.parse(yield* fs.readFileString(COUNTER_OUTPUT_EVENTS_FILEPATH))).toEqual([]);
      }).pipe(
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_OC_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_ZSWAP_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_RESULT_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_EVENTS_FILEPATH)),
        Effect.provide(testLayer)
      ),
    30_000
  );

  it.effect(
    'reports a runtime rejection of the --input-zswap file instead of dying silently',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));
        yield* fs.writeFileString(COUNTER_INPUT_ZSWAP_FILEPATH, JSON.stringify(SHORT_KEY_ZSWAP_LOCAL_STATE));

        const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

        yield* cli([
          'node', 'circuit.ts',
          '-c', COUNTER_CONFIG_FILEPATH,
          '--input', COUNTER_STATE_FILEPATH,
          '--input-ps', COUNTER_OUTPUT_PS_FILEPATH,
          '--input-zswap', COUNTER_INPUT_ZSWAP_FILEPATH,
          '--output', COUNTER_OUTPUT_FILEPATH,
          '--output-ps', COUNTER_OUTPUT_PS_FILEPATH,
          '--output-zswap', COUNTER_OUTPUT_ZSWAP_FILEPATH,
          '--output-result', COUNTER_RESULT_FILEPATH,
          '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a', 'increment'
        ]);

        // Unwrapped, the runtime's throw is a defect: `invocationHandler`'s `catchAll` cannot see
        // it and the CLI runs with `disableErrorReporting`, so the process exits 1 printing
        // nothing — the user gets no hint that their state file is at fault. The report naming the
        // file is the behaviour under test.
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.length).toBeGreaterThan(0);
        expect(lines.join('\n')).toContain(COUNTER_INPUT_ZSWAP_FILEPATH);
      }).pipe(
        Effect.ensuring(ensureRemovePath(COUNTER_INPUT_ZSWAP_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)),
        Effect.provide(testLayer)
      ),
    30_000
  );

  it.effect('produces a valid single-call intent for a non-cross-contract circuit', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const COUNTER_ADDRESS = '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a';
      yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

      const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

      yield* cli([
        'node', 'circuit.ts',
        '-c', COUNTER_CONFIG_FILEPATH,
        '--input', COUNTER_STATE_FILEPATH,
        '--input-ps', COUNTER_OUTPUT_PS_FILEPATH,
        '--output', COUNTER_OUTPUT_FILEPATH,
        '--output-ps', COUNTER_OUTPUT_PS_FILEPATH,
        '--output-zswap', COUNTER_OUTPUT_ZSWAP_FILEPATH,
        '--output-result', COUNTER_RESULT_FILEPATH,
        COUNTER_ADDRESS, 'increment'
      ]);

      // With no --contract-states-dir the counter makes no cross-contract calls: the rewritten
      // prototype-building path must still emit exactly one call — the root — for its own address.
      const intent = Intent.deserialize<SignatureEnabled, PreProof, PreBinding>(
        'signature', 'pre-proof', 'pre-binding', yield* fs.readFile(COUNTER_OUTPUT_FILEPATH)
      );
      const calls = intent.actions as ContractCall<PreProof>[];
      expect(calls).toHaveLength(1);
      expect(calls[0].address).toBe(COUNTER_ADDRESS);
      const entryPoint = calls[0].entryPoint;
      expect(typeof entryPoint === 'string' ? entryPoint : new TextDecoder().decode(entryPoint)).toBe('increment');
    }).pipe(
      Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_FILEPATH)),
      Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)),
      Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_ZSWAP_FILEPATH)),
      Effect.ensuring(ensureRemovePath(COUNTER_RESULT_FILEPATH)),
      Effect.provide(testLayer)
    ),
    30_000
  );

  it.effect(
    'should report success with valid ledger parameters',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        const ledgerParameters = LedgerParameters.initialParameters();
        ledgerParameters.feePrices.blockUsageFactor = 3; // Modify some aspect of the ledger parameters.

        yield* fs.writeFile(COUNTER_LEDGER_PARAMS_FILEPATH, ledgerParameters.serialize());

        const cli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

        yield* cli([
          'node',
          'circuit.ts',
          '-c',
          COUNTER_CONFIG_FILEPATH,
          '--input',
          COUNTER_STATE_FILEPATH,
          '--input-ps',
          COUNTER_OUTPUT_PS_FILEPATH,
          '--input-ledger-params',
          COUNTER_LEDGER_PARAMS_FILEPATH,
          '--output',
          COUNTER_OUTPUT_FILEPATH,
          '--output-oc',
          COUNTER_OUTPUT_OC_FILEPATH,
          '--output-ps',
          COUNTER_OUTPUT_PS_FILEPATH,
          '--output-zswap',
          COUNTER_OUTPUT_ZSWAP_FILEPATH,
          '--output-result',
          COUNTER_RESULT_FILEPATH,
          '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a',
          'increment'
        ]);

        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines.length).toBe(0);
        expect(JSON.parse(yield* fs.readFileString(COUNTER_OUTPUT_PS_FILEPATH))).toMatchObject({ count: 101 });
      }).pipe(
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_LEDGER_PARAMS_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_OC_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_ZSWAP_FILEPATH)),
        Effect.ensuring(ensureRemovePath(COUNTER_RESULT_FILEPATH)),
        Effect.provide(testLayer)
      ),
    30_000
  );
});
