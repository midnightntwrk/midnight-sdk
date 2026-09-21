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

import { describe, expect, it } from '@effect/vitest';
import { ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
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
      // `String({ code: 42 })` is '[object Object]': the process exits 1 having printed a cause
      // line with no diagnostic content at all. The cause's own fields are what makes the report
      // actionable.
      expect(lines.join('\n')).toContain('42');
    })
  );

  it.effect('reports an error whose cause has a null prototype rather than dying', () =>
    Effect.gen(function* () {
      // `String(Object.create(null))` throws `TypeError: Cannot convert object to primitive value`.
      // The reporter is typed `Effect<void, never>`, so that throw is a defect: it escapes both
      // `catchAll`s in `invocationHandler` and the CLI exits printing nothing — exactly the silent
      // exit this function exists to prevent. A witness rejecting with a null-prototype object
      // reaches here verbatim via `Effect.tryPromise({ catch: identity })`.
      const cause: { code?: number } = Object.create(null);
      cause.code = 5;

      const lines = yield* report(ContractRuntimeError.make('Failed to execute circuit', cause));

      expect(lines.join('\n')).toContain('Failed to execute circuit');
    })
  );

  it.effect('reports a self-referential cause chain rather than overflowing the stack', () =>
    Effect.gen(function* () {
      // Wrapping an error in its own cause is a plausible mistake in user code, and the walk over
      // `.cause` has no terminating condition other than a falsy link, so it recurses until the
      // stack gives out — again as a defect inside the reporter.
      const cause: { message: string; cause?: unknown } = { message: 'circular boom' };
      cause.cause = cause;

      const lines = yield* report(ContractRuntimeError.make('Failed to execute circuit', cause));

      expect(lines.join('\n')).toContain('Failed to execute circuit');
      expect(lines.join('\n')).toContain('circular boom');
    })
  );
});
