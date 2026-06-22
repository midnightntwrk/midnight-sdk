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
import { type LogEvent } from '@midnight-ntwrk/compact-runtime';
import { Effect } from 'effect';

import { MAX_EVENT_SIZE } from './ContractEventConstants.js';
import * as ContractEventValidationError from './ContractEventValidationError.js';

/**
 * Validates that events comply with system constraints.
 *
 * @param events Events to validate.
 * @returns An {@link Effect} that fails with a
 * {@link ContractEventValidationError.ContractEventValidationError} if validation fails.
 *
 * @category validation
 */
export const validateEvents = (events: LogEvent[]): Effect.Effect<void, ContractEventValidationError.ContractEventValidationError> =>
  Effect.gen(function* () {
    if (!Array.isArray(events)) {
      return yield* ContractEventValidationError.make('Events must be an array');
    }

    for (const [index, event] of events.entries()) {
      if (!event || typeof event !== 'object') {
        return yield* ContractEventValidationError.make(`Event at index ${index} is not a valid object`);
      }

      // Check that event has required fields from GatherResult
      if (!('tag' in event) || event.tag !== 'log') {
        return yield* ContractEventValidationError.make(`Event at index ${index} must have tag: 'log'`);
      }

      // Validate content size
      if ('content' in event && event.content instanceof Uint8Array && event.content.byteLength > MAX_EVENT_SIZE) {
        return yield* ContractEventValidationError.make(
          `Event at index ${index} exceeds max size: ${event.content.byteLength} > ${MAX_EVENT_SIZE}`
        );
      }
    }
  });
