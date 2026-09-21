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

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { Command } from '@effect/cli';
import { afterAll, describe, expect, it } from '@effect/vitest';
import { ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { deployCommand } from '@midnight-ntwrk/compact-js-command/effect';
import { Effect } from 'effect';

import * as InternalCommand from '../../src/effect/internal/command.js';
import * as MockConsole from './MockConsole.js';
import { testLayer } from './testLayer.js';

/**
 * The reporter is the last thing standing between a failure and a silent exit, so it must not be
 * able to fail itself. `ContractExecutable.circuit` maps a rejected witness with
 * `Effect.tryPromise({ catch: identity })`, so whatever a user's witness threw reaches the cause
 * chain verbatim — including values that are not `Error`s and have no `message`.
 */
describe('reportContractExecutionError', () => {
  const report = (err: unknown) =>
    Effect.gen(function* () {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yield* InternalCommand.reportContractExecutionError(err as any);
      return yield* MockConsole.getLines({ stripAnsi: true });
    }).pipe(Effect.provide(testLayer));

  it.effect('reports an error whose cause is a bare string rather than dying', () =>
    Effect.gen(function* () {
      const lines = yield* report(
        ContractRuntimeError.make('Failed to execute circuit', 'insufficient balance')
      );

      expect(lines.join('\n')).toContain('Failed to execute circuit');
      expect(lines.join('\n')).toContain('insufficient balance');
    })
  );

  it.effect('reports an error whose cause chain reaches a value with no message', () =>
    Effect.gen(function* () {
      const lines = yield* report(ContractRuntimeError.make('Failed to execute circuit', { code: 42 }));

      expect(lines.join('\n')).toContain('Failed to execute circuit');
    })
  );
});

/**
 * The CLI must never exit without saying why.
 *
 * @remarks
 * `invocationHandler` recovers with `Effect.catchAll`, which covers the *failure* channel only. A
 * defect — a throw evaluated in an `Effect.gen` body — passes it, passes the handler's terminating
 * `Effect.mapError`, and reaches `runMain({ disableErrorReporting: true })`, which exits 1 printing
 * nothing. Every silent-exit bug in this package ends there, so this suite pins the outcome the user
 * sees rather than any one of the paths that can produce it: a misspelled witness (a real, ordinary
 * mistake, and the one that motivated the fix) and a raw defect injected directly.
 */
describe('a command that fails in a way it does not handle', () => {
  const BROKEN_CONFIG_FILEPATH = resolve(import.meta.dirname, '../contract/counter/brokenWitness.config.ts');

  afterAll(() => {
    // `ConfigCompiler` transpiles the fixture to a sibling `.js` before importing it.
    rmSync(resolve(import.meta.dirname, '../contract/counter/brokenWitness.config.js'), { force: true });
  });

  it.effect(
    'reports a misspelled witness instead of exiting silently',
    () =>
      Effect.gen(function* () {
        const cli = Command.run(deployCommand, { name: 'deploy', version: '0.0.0' });

        yield* cli(['node', 'deploy.ts', '-c', BROKEN_CONFIG_FILEPATH]);

        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

        // The assertion that matters is simply that *something* was printed — silence is the bug.
        expect(output).not.toEqual('');
        // And that it points at the witness rather than at some unrelated symptom.
        expect(output).toMatch(/private_incremnt|witness/i);
      }).pipe(Effect.provide(testLayer)),
    30_000
  );

  it.effect('reports a defect that escapes the failure channel', () =>
    Effect.gen(function* () {
      const boom = new Error('an unhandled internal fault');

      yield* InternalCommand.reportUnhandledDefect(boom);

      const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');

      expect(output).toMatch(/an unhandled internal fault/);
      // Named as a defect, so a user can tell "your input was wrong" from "this is our bug".
      expect(output).toMatch(/internal error/i);
    }).pipe(Effect.provide(testLayer))
  );
});
