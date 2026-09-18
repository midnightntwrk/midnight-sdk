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
import { type CompactRuntime } from '@midnight-ntwrk/compact-js/effect';
import { Effect } from 'effect';

import {
  decodeZswapLocalStateObject,
  encodeZswapLocalStateObject
} from '../../src/effect/internal/encodedZswapLocalStateSchema.js';

const bytes = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

/**
 * Typed as the runtime's own `EncodedZswapLocalState`, so the fixture cannot drift from the shape
 * the schema is pinned to — a field the runtime adds fails here at compile time rather than being
 * silently dropped at encode.
 *
 * `inputs` and `outputs` are non-empty on purpose: the counter fixture every other test drives
 * produces no coins, so `EncodedQualifiedShieldedCoinInfoSchema`, `EncodedShieldedCoinInfoSchema`
 * and `EncodedRecipientSchema` are otherwise never exercised at run time. A user with real shielded
 * coins is the first to walk that path.
 */
const STATE_WITH_COINS: CompactRuntime.EncodedZswapLocalState = {
  coinPublicKey: { bytes: bytes(0x01) },
  currentIndex: 7n,
  inputs: [{ nonce: bytes(0x02), color: bytes(0x03), value: 42n, mt_index: 3n }],
  outputs: [
    {
      coinInfo: { nonce: bytes(0x04), color: bytes(0x05), value: 99n },
      recipient: { is_left: true, left: { bytes: bytes(0x06) }, right: { bytes: bytes(0x07) } }
    }
  ]
};

/**
 * `--output-zswap` writes through `encodeZswapLocalStateObject` and `--input-zswap` reads back
 * through `decodeZswapLocalStateObject`, so the deploy → circuit → circuit continuation workflow
 * depends on the two agreeing across a JSON file. Nothing else in the suite reads back a file the
 * CLI itself wrote.
 */
describe('EncodedZswapLocalStateSchema', () => {
  it.effect('round-trips a state carrying inputs and outputs through JSON', () =>
    Effect.gen(function* () {
      const encoded = yield* encodeZswapLocalStateObject(STATE_WITH_COINS);
      const decoded = yield* decodeZswapLocalStateObject(JSON.parse(JSON.stringify(encoded)));

      expect(decoded).toEqual(STATE_WITH_COINS);
    })
  );

  it.effect('encodes bigints and byte arrays to JSON-representable forms', () =>
    Effect.gen(function* () {
      const encoded = (yield* encodeZswapLocalStateObject(STATE_WITH_COINS)) as {
        currentIndex: unknown;
        inputs: readonly { value: unknown; nonce: unknown }[];
      };

      // A bigint or a Uint8Array surviving into the written file would make it unreadable by
      // `JSON.stringify`/`JSON.parse`, which is exactly how the CLI persists it.
      expect(typeof encoded.currentIndex).toBe('string');
      expect(typeof encoded.inputs[0]!.value).toBe('string');
      expect(Array.isArray(encoded.inputs[0]!.nonce)).toBe(true);
    })
  );
});
