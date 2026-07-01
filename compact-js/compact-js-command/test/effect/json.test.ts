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

// `internal/*` is not a published entrypoint, so the helper is imported by relative path.
import { circuitOutputReplacer, stringifyCircuitOutput } from '../../src/effect/internal/json.js';

describe('stringifyCircuitOutput', () => {
  it('encodes bigint as a decimal string', () => {
    expect(stringifyCircuitOutput({ count: 101n })).toBe('{"count":"101"}');
  });

  it('encodes Uint8Array as a number array rather than an indexed object', () => {
    expect(stringifyCircuitOutput(Uint8Array.from([215, 182, 0]))).toBe('[215,182,0]');
  });

  it('serializes a non-empty log-event array carrying bigint and Uint8Array payloads', () => {
    // Mirrors the runtime `GatherResult` log shape that is written to the --output-events file.
    const events = [
      {
        version: 1,
        eventType: 'unshielded-mint',
        data: { tokenType: Uint8Array.from([1, 2, 3]), amount: 1_000n }
      }
    ];

    const json = stringifyCircuitOutput(events);

    expect(JSON.parse(json)).toEqual([
      { version: 1, eventType: 'unshielded-mint', data: { tokenType: [1, 2, 3], amount: '1000' } }
    ]);
  });

  it('applies indentation when a space argument is given', () => {
    expect(stringifyCircuitOutput({ a: 1n }, 2)).toBe('{\n  "a": "1"\n}');
  });

  it('leaves ordinary JSON values untouched via the replacer', () => {
    expect(circuitOutputReplacer('k', 'value')).toBe('value');
    expect(circuitOutputReplacer('k', 42)).toBe(42);
    expect(circuitOutputReplacer('k', null)).toBe(null);
  });
});
