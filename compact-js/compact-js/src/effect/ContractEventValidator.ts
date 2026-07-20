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
import { Effect } from 'effect';
import { TreeFormatter } from 'effect/ParseResult';
import * as Schema from 'effect/Schema';

import * as ContractEventValidationError from './ContractEventValidationError.js';
import { LogEventTypeSchema } from './ContractLog.js';

/**
 * Structural schema for a single contract log event — the `content` of a `log`-tagged
 * `GatherResult`.
 *
 * The `data` payload is an on-chain `EncodedStateValue` whose deep structure is parsed (and
 * gracefully degraded) by the ledger/VM per MIP-0002, so it is accepted as-is here: this
 * boundary check only asserts that the event envelope is well-formed.
 */
const LogEventSchema = Schema.Struct({
  version: Schema.Number,
  eventType: LogEventTypeSchema,
  data: Schema.Unknown
});

const decodeLogEvents = Schema.decodeUnknown(Schema.Array(LogEventSchema), { errors: 'all' });

/**
 * Validates that `events` is a well-formed array of contract log events.
 *
 * Events reach this boundary as untrusted input, so they are decoded from `unknown` with a
 * {@link Schema} — yielding both the structural validation and a typed failure, rather than
 * hand-rolled `in`/`instanceof` checks.
 *
 * @param events The value to validate.
 * @returns An {@link Effect} that fails with a
 * {@link ContractEventValidationError.ContractEventValidationError} if `events` is not a valid
 * array of log events.
 *
 * @category validation
 */
export const validateEvents = (
  events: unknown
): Effect.Effect<void, ContractEventValidationError.ContractEventValidationError> =>
  decodeLogEvents(events).pipe(
    Effect.asVoid,
    Effect.mapError((parseError) =>
      ContractEventValidationError.make(
        `Invalid contract log events: ${TreeFormatter.formatErrorSync(parseError)}`,
        parseError
      )
    )
  );
