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

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { Command } from '@effect/cli';
import { Ledger as LedgerEight } from '@midnight-ntwrk/compact-js/v8/effect';
import { Ledger as LedgerNine } from '@midnight-ntwrk/compact-js/v9/effect';
import { circuitCommand, deployCommand } from '@midnight-ntwrk/compact-js-command/effect';
import { Effect } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';

import { useConfigFixture } from '../effect/configFixture.js';
import * as MockConsole from '../effect/MockConsole.js';
import { testLayer } from '../effect/testLayer.js';

/**
 * **`--ledger-era 8`, end to end through the CLI** — the deliverable behind the era-parameterised
 * handlers (midnight-sdk#387/#388).
 *
 * @remarks
 * `test/effect/EraSelection.test.ts` proves the handlers use the era they are given by driving them
 * with a stub; this drives the real thing. A ledger 8 configuration, a contract compiled by
 * compactc 0.31.1, and `--ledger-era 8` on the same command that runs ledger 9 by default — the CLI
 * produces a ledger 8 intent and a ledger 8 contract state, in a process where the ledger 9 command
 * set is loaded and untouched.
 *
 * The state file assertion is the one that matters: the bytes deserialize with ledger 8's
 * `ContractState` and are *rejected* by ledger 9's. A CLI that had selected the era in name only
 * would write ledger 9 bytes here and pass every other check.
 *
 * Runs in the era 8 vitest project, whose alias resolves `@midnight-ntwrk/compact-runtime` to the
 * 0.16 line for the compiled artifact only — see `vitest.era8.config.ts`.
 */
const ERA8_COUNTER = resolve(import.meta.dirname, '../../../compact-js/test/contract/managed-v8/counter');
const FIXTURE_PRESENT = existsSync(resolve(ERA8_COUNTER, 'contract/index.js'));
const describeWithFixture = FIXTURE_PRESENT ? describe : describe.skip;

// Guarded on the fixture: `useConfigFixture` copies the file eagerly, which would throw at
// collection time in a tree that has not run `yarn compact-v8` yet.
const CONFIG_FILEPATH = FIXTURE_PRESENT
  ? useConfigFixture(resolve(import.meta.dirname, '../contract/counter-v8/contract.config.ts'), 'era8')
  : '';

const OUT_DIR = resolve(import.meta.dirname, '../contract/counter-v8');
const OUTPUT_FILEPATH = resolve(OUT_DIR, 'output_era8.bin');
const OUTPUT_OC_FILEPATH = resolve(OUT_DIR, 'output_era8_onchain.bin');
const OUTPUT_PS_FILEPATH = resolve(OUT_DIR, 'output_era8.ps.json');
const OUTPUT_ZSWAP_FILEPATH = resolve(OUT_DIR, 'output_era8.zswap.json');

const deployCli = Command.run(deployCommand, { name: 'deploy', version: '0.0.0' });
const circuitCli = Command.run(circuitCommand, { name: 'circuit', version: '0.0.0' });

afterAll(() => {
  for (const filePath of [OUTPUT_FILEPATH, OUTPUT_OC_FILEPATH, OUTPUT_PS_FILEPATH, OUTPUT_ZSWAP_FILEPATH]) {
    rmSync(filePath, { force: true });
  }
});

const runDeploy = () =>
  Effect.gen(function* () {
    yield* deployCli([
      'node', 'deploy.ts',
      '--ledger-era', '8',
      '-c', CONFIG_FILEPATH,
      '--output', OUTPUT_FILEPATH,
      '--output-oc', OUTPUT_OC_FILEPATH,
      '--output-ps', OUTPUT_PS_FILEPATH,
      '--output-zswap', OUTPUT_ZSWAP_FILEPATH
    ]);
    return yield* MockConsole.getLines({ stripAnsi: true });
  }).pipe(Effect.provide(testLayer), Effect.runPromise);

describeWithFixture('the CLI targeting ledger 8', () => {
  it('deploys a ledger 8 contract and writes ledger 8 artifacts', async () => {
    const lines = await runDeploy();

    // No output at all is this command's success signal.
    expect(lines).toEqual([]);
    expect(existsSync(OUTPUT_FILEPATH)).toBe(true);
    expect(existsSync(OUTPUT_OC_FILEPATH)).toBe(true);
    expect(JSON.parse(readFileSync(OUTPUT_PS_FILEPATH, 'utf8'))).toMatchObject({ count: 0 });
  }, 60_000);

  it('writes a contract state ledger 8 can read and ledger 9 cannot', async () => {
    await runDeploy();
    const bytes = readFileSync(OUTPUT_OC_FILEPATH);

    const asEight = await Effect.runPromise(Effect.exit(LedgerEight.contractStateFromBytes(bytes)));
    expect(asEight._tag).toBe('Success');

    // The assertion that distinguishes a real era selection from a relabelled one: both facades are
    // live in this process, and only the selected era's can read what the command wrote.
    const asNine = await Effect.runPromise(Effect.exit(LedgerNine.contractStateFromBytes(bytes)));
    expect(asNine._tag).toBe('Failure');
  }, 60_000);

  it('refuses the options ledger 8 cannot honour, by name', async () => {
    const lines = await Effect.gen(function* () {
      yield* circuitCli([
        'node', 'circuit.ts',
        '--ledger-era', '8',
        '-c', CONFIG_FILEPATH,
        '--input', OUTPUT_OC_FILEPATH,
        '--input-ps', OUTPUT_PS_FILEPATH,
        '--output-events', resolve(OUT_DIR, 'events_era8.json'),
        '0'.repeat(64),
        'increment'
      ]);
      return yield* MockConsole.getLines({ stripAnsi: true });
    }).pipe(Effect.provide(testLayer), Effect.runPromise);

    // The era 8 command set has no contract-events capability, so the option is rejected up front
    // rather than writing an empty list that reads as "the contract emitted nothing".
    expect(lines.join('\n')).toMatch(/Ledger era 8 cannot emit contract log events/);
  }, 60_000);
});
