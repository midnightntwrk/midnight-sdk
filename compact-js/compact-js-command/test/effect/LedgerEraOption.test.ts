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

/**
 * `--ledger-era` as a *selection*.
 *
 * @remarks
 * The option used to accept exactly one value — the era the build bound — because the handlers
 * were written against the bound facades and had no other era to run. They are now factories over
 * an era pair, applied once per era in `internal/era/v<N>.ts`, so every registered era parses.
 *
 * What an invocation's era actually is takes *two* decisions, and the CLI owns only one of them:
 * `--ledger-era` picks the era of the intents, conversions and state files, while the executable's
 * era was fixed by the import at the top of `contract.config.ts`. The counter fixture here imports
 * the unsuffixed entry, so it is a ledger 9 executable — and asking for `--ledger-era 8` against it
 * is the mismatch these tests pin. Without the reconciliation it would surface much later, as a
 * WASM rejection naming neither era.
 *
 * `test/effect/EraSelection.test.ts` covers the other half: that a handler built for an era really
 * uses *that* era, and that the options an era cannot honour are refused.
 */

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

const deployCliArgs = (ledgerEra: string) => [
  'node',
  'deploy.ts',
  '--ledger-era',
  ledgerEra,
  '-c',
  COUNTER_CONFIG_FILEPATH
];

const maintainContractCliArgs = (ledgerEra: string) => [
  'node',
  'maintain.ts',
  'contract',
  '--ledger-era',
  ledgerEra,
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
];

const maintainCircuitCliArgs = (ledgerEra: string) => [
  'node',
  'maintain.ts',
  'circuit',
  '--ledger-era',
  ledgerEra,
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
];

/**
 * Asserts that `invocation` stops on the configuration/era reconciliation, naming both eras and
 * both ways out.
 *
 * The reconciliation is reported rather than thrown — the CLI's own error reporting turns it into
 * console output — so this reads the captured console instead of an `Exit`.
 */
const expectEraMismatchReported = <A, E, R>(
  invocation: Effect.Effect<A, E, R>
): Effect.Effect<void, never, R | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    yield* invocation.pipe(Effect.orDie);

    const lines = yield* MockConsole.getLines({ stripAnsi: true });
    const output = lines.join('\n');

    // Both eras, so a user with a configuration and a flag that disagree can see which is which...
    expect(output).toMatch(/executable against ledger era 9/);
    expect(output).toMatch(/--ledger-era selected 8/);
    // ...and both ways out, since either decision is a legitimate one to change.
    expect(output).toMatch(/@midnight-ntwrk\/compact-js\/v8\/effect/);
    expect(output).toMatch(/--ledger-era 9/);
  });

describe('--ledger-era option', () => {
  it.effect(
    'runs the era this build binds when the option is omitted',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        // No `--ledger-era`: the default is the bound era, which is what the fixture's unsuffixed
        // import gives its executable, so the two agree and the command proceeds.
        yield* circuitCli([
          'node',
          'circuit.ts',
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
        ]);

        // Reaching the manifest error proves era selection passed and the command proceeded.
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.length).toBe(1);
        expect(lines[0]).toMatch(/Circuit 'unknown_circuit' not found/);
      }).pipe(Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)), Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    'accepts the era this build binds',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(COUNTER_OUTPUT_PS_FILEPATH, JSON.stringify({ count: 100 }));

        yield* circuitCli(circuitCliArgs('9'));

        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        expect(lines.length).toBe(1);
        expect(lines[0]).toMatch(/Circuit 'unknown_circuit' not found/);
      }).pipe(Effect.ensuring(ensureRemovePath(COUNTER_OUTPUT_PS_FILEPATH)), Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    'accepts a registered era other than the bound one',
    () =>
      Effect.gen(function* () {
        // Parsing is where an unsupported era used to be refused. Era 8 now has a command set, so
        // it parses — the invocation stops later, on the configuration's era, not on the flag.
        const exit = yield* Effect.exit(deployCli(deployCliArgs('8')).pipe(Effect.provide(testLayer)));

        expect(exit._tag).toBe('Success');
        const lines = yield* MockConsole.getLines({ stripAnsi: true }).pipe(Effect.provide(testLayer));
        expect(lines.join('\n')).not.toMatch(/is not supported by this command/);
      }),
    30_000
  );

  it.effect(
    'rejects an era this build has no command set for',
    () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(deployCli(deployCliArgs('7')));

        expect(exit._tag).toBe('Failure');
        expect(String(exit)).toMatch(/ledger era 7 is not supported by this command/);
        // The message lists what it *can* select, so the user is not left guessing.
        expect(String(exit)).toMatch(/selects between 8, 9/);
      }).pipe(Effect.provide(testLayer)),
    30_000
  );

  // Every command carries the option via `GlobalOptions` and every one reconciles the two era
  // decisions in `invocationHandler`; each is exercised so a command that drops the spread fails
  // here rather than silently running the wrong era's conversions.
  it.effect(
    '`circuit` reports a configuration built for another era',
    () => expectEraMismatchReported(circuitCli(circuitCliArgs('8'))).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    '`deploy` reports a configuration built for another era',
    () => expectEraMismatchReported(deployCli(deployCliArgs('8'))).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    '`maintain contract` reports a configuration built for another era',
    () => expectEraMismatchReported(maintainCli(maintainContractCliArgs('8'))).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect(
    '`maintain circuit` reports a configuration built for another era',
    () => expectEraMismatchReported(maintainCli(maintainCircuitCliArgs('8'))).pipe(Effect.provide(testLayer)),
    30_000
  );
});
