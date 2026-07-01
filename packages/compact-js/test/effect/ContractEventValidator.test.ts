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
import { validateEvents } from '@midnightntwrk/compact-js/effect';
import * as ContractEventValidationError from '@midnightntwrk/compact-js/effect/ContractEventValidationError';
import { Effect } from 'effect';

/**
 * A structurally valid log event mirroring the runtime `GatherResult` `log` shape
 * (`{ version, eventType, data }`). The `data` payload is an opaque on-chain encoded value, so it
 * carries the `bigint`/`Uint8Array` members that downstream JSON serialization has to handle.
 */
const validMiscEvent = {
  version: 1,
  eventType: 'misc',
  data: {
    name: 'TransferRequested',
    payload: { amount: 1_000n, recipient: Uint8Array.from([0xde, 0xad, 0xbe, 0xef]) }
  }
};

describe('validateEvents', () => {
  it.effect('accepts an empty event array', () =>
    Effect.gen(function* () {
      yield* validateEvents([]);
    })
  );

  it.effect('accepts well-formed events carrying bigint and Uint8Array payloads', () =>
    Effect.gen(function* () {
      yield* validateEvents([
        validMiscEvent,
        { version: 1, eventType: 'unshielded-mint', data: { tokenType: Uint8Array.from([1, 2, 3]), amount: 42n } },
        { version: 1, eventType: 'paused', data: {} }
      ]);
    })
  );

  it.effect('fails when the value is not an array', () =>
    Effect.gen(function* () {
      const error = yield* validateEvents({ version: 1, eventType: 'misc', data: {} }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(ContractEventValidationError.ContractEventValidationError);
      expect(ContractEventValidationError.isValidationError(error)).toBe(true);
    })
  );

  it.effect('fails on an unrecognized event type', () =>
    Effect.gen(function* () {
      const error = yield* validateEvents([{ version: 1, eventType: 'not-a-real-event', data: {} }]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(ContractEventValidationError.ContractEventValidationError);
      expect(error.message).toContain('Invalid contract log events');
    })
  );

  it.effect('fails when an event is missing its version', () =>
    Effect.gen(function* () {
      const error = yield* validateEvents([{ eventType: 'misc', data: {} }]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(ContractEventValidationError.ContractEventValidationError);
    })
  );

  it.effect('reports every malformed event when validating a batch', () =>
    Effect.gen(function* () {
      const error = yield* validateEvents([
        { version: 1, eventType: 'misc', data: {} },
        { version: 'one', eventType: 'misc', data: {} },
        { version: 1, eventType: 'bogus', data: {} }
      ]).pipe(Effect.flip);
      expect(error).toBeInstanceOf(ContractEventValidationError.ContractEventValidationError);
    })
  );
});
