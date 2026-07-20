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
import * as ContractLog from '@midnight-ntwrk/compact-js/effect/ContractLog';
import { Option } from 'effect';

import * as Fixtures from './logEventFixtures.js';

const bytes = (len: number, byte: number): Uint8Array => new Uint8Array(len).fill(byte);

describe('ContractLog.decode', () => {
  it('preserves the envelope (version + emitting address) on every event', () => {
    const event = ContractLog.decode(Fixtures.shieldedSpend);
    expect(event.version).toBe(1);
    expect(String(event.address)).toBe(Fixtures.FIXTURE_ADDRESS);
    expect(event.raw).toBe(Fixtures.shieldedSpend);
  });

  it('decodes shielded-spend (nullifier)', () => {
    const event = ContractLog.decode(Fixtures.shieldedSpend);
    expect(event.degraded).toBe(false);
    expect(event.eventType).toBe('shielded-spend');
    if (event.degraded || event.eventType !== 'shielded-spend') throw new Error('unreachable');
    expect(event.payload.nullifier).toEqual(bytes(32, 0x11));
  });

  it('decodes shielded-receive (commitment + optional contract address + ciphertext)', () => {
    const event = ContractLog.decode(Fixtures.shieldedReceive);
    if (event.degraded || event.eventType !== 'shielded-receive') throw new Error('unreachable');
    expect(event.payload.commitment).toEqual(bytes(32, 0x22));
    expect(Option.getOrThrow(event.payload.contractAddress)).toEqual(bytes(32, 0x23));
    expect(Option.getOrThrow(event.payload.ciphertext)).toEqual(bytes(512, 0x24));
  });

  it('decodes shielded-mint (commitment + domainSep + amount)', () => {
    const event = ContractLog.decode(Fixtures.shieldedMint);
    if (event.degraded || event.eventType !== 'shielded-mint') throw new Error('unreachable');
    expect(event.payload.commitment).toEqual(bytes(32, 0x31));
    expect(event.payload.domainSep).toEqual(bytes(32, 0x32));
    expect(Option.getOrThrow(event.payload.amount)).toBe(1_000n);
  });

  it('decodes shielded-burn (nullifier + amount)', () => {
    const event = ContractLog.decode(Fixtures.shieldedBurn);
    if (event.degraded || event.eventType !== 'shielded-burn') throw new Error('unreachable');
    expect(event.payload.nullifier).toEqual(bytes(32, 0x41));
    expect(Option.getOrThrow(event.payload.amount)).toBe(7n);
  });

  it('decodes unshielded-spend (sender Either=left → coin-public-key)', () => {
    const event = ContractLog.decode(Fixtures.unshieldedSpend);
    if (event.degraded || event.eventType !== 'unshielded-spend') throw new Error('unreachable');
    expect(event.payload.sender.kind).toBe('coin-public-key');
    expect(event.payload.sender.bytes).toEqual(bytes(32, 0x51));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x52));
    expect(event.payload.amount).toBe(1_000n);
  });

  it('decodes unshielded-receive (recipient Either=right → contract-address)', () => {
    const event = ContractLog.decode(Fixtures.unshieldedReceive);
    if (event.degraded || event.eventType !== 'unshielded-receive') throw new Error('unreachable');
    expect(event.payload.recipient.kind).toBe('contract-address');
    expect(event.payload.recipient.bytes).toEqual(bytes(32, 0x61));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x62));
    expect(event.payload.amount).toBe(1_000n);
  });

  it('decodes unshielded-mint (domainSep + tokenType + amount)', () => {
    const event = ContractLog.decode(Fixtures.unshieldedMint);
    if (event.degraded || event.eventType !== 'unshielded-mint') throw new Error('unreachable');
    expect(event.payload.domainSep).toEqual(bytes(32, 0x71));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x72));
    expect(event.payload.amount).toBe(1_000n);
  });

  it('decodes unshielded-burn (sender + tokenType + amount)', () => {
    const event = ContractLog.decode(Fixtures.unshieldedBurn);
    if (event.degraded || event.eventType !== 'unshielded-burn') throw new Error('unreachable');
    expect(event.payload.sender.bytes).toEqual(bytes(32, 0x81));
    expect(event.payload.amount).toBe(500n);
  });

  it('decodes paused/unpaused as empty-payload lifecycle events', () => {
    for (const raw of [Fixtures.paused, Fixtures.unpaused]) {
      const event = ContractLog.decode(raw);
      expect(event.degraded).toBe(false);
      expect(event.payload).toEqual({});
    }
  });

  it('decodes misc (name + payload)', () => {
    const event = ContractLog.decode(Fixtures.misc);
    if (event.degraded || event.eventType !== 'misc') throw new Error('unreachable');
    expect(event.payload.name).toEqual(bytes(32, 0xa1));
    expect(event.payload.payload).toEqual(bytes(256, 0xa2));
  });

  it('handles Maybe=none for optional amount', () => {
    // A shielded-burn whose amount flag byte is 0 → Option.none, no throw.
    const raw = { ...Fixtures.shieldedBurn, data: Fixtures.dataCell(new Uint8Array(49)) };
    const event = ContractLog.decode(raw);
    if (event.degraded || event.eventType !== 'shielded-burn') throw new Error('unreachable');
    expect(Option.isNone(event.payload.amount)).toBe(true);
  });

  describe('graceful degradation (never throws)', () => {
    it('degrades a dropped ({ tag: null }) payload', () => {
      const event = ContractLog.decode(Fixtures.degradedNullData);
      expect(event.degraded).toBe(true);
      expect(event.payload).toBeUndefined();
      expect(event.raw).toBe(Fixtures.degradedNullData);
    });

    it('degrades a truncated payload', () => {
      const event = ContractLog.decode(Fixtures.truncatedPayload);
      expect(event.degraded).toBe(true);
      expect(event.payload).toBeUndefined();
    });

    it('degrades the reserved fallback version 0', () => {
      const event = ContractLog.decode(Fixtures.fallbackVersionZero);
      expect(event.degraded).toBe(true);
      expect(event.version).toBe(0);
    });

    it('degrades an out-of-range Either discriminant rather than decoding a wrong kind', () => {
      const event = ContractLog.decode(Fixtures.invalidEitherDiscriminant);
      expect(event.degraded).toBe(true);
      expect(event.payload).toBeUndefined();
      // The garbage sender must not leak into the indexed fields.
      expect(ContractLog.indexedFields(event)).toEqual({});
    });

    it('degrades a malformed envelope address without throwing', () => {
      const event = ContractLog.decode(Fixtures.malformedAddress);
      expect(event.degraded).toBe(true);
      expect(event.payload).toBeUndefined();
      // The unvalidated raw address is surfaced best-effort; the raw event is preserved.
      expect(String(event.address)).toBe('deadbeef');
      expect(event.raw).toBe(Fixtures.malformedAddress);
    });

    it('does not abort a batch when one event has a malformed address', () => {
      const decoded = ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.malformedAddress, Fixtures.misc]);
      expect(decoded.map((e) => e.degraded)).toEqual([false, true, false]);
    });

    // The never-throw guarantee rests on an invariant: for every event type, the highest byte
    // offset `decodePayload` reads must be < the declared payload size that gates it (an unchecked
    // `readUint128`/`readEither` at an offset past the buffer end would throw a `TypeError`, not
    // degrade). This exercises the boundary for every type so a future offset/size mismatch is
    // caught here rather than surfacing as a runtime throw in a consumer.
    it('never reads past the declared payload size — decodes a minimum-size buffer without throwing', () => {
      // Ground truth for each type's declared size: the fixture's own payload length.
      const payloadLen = (raw: ContractLog.LogEvent): number =>
        raw.data.tag === 'cell' ? raw.data.content.value.reduce((n, s) => n + s.length, 0) : 0;
      for (const fixture of Fixtures.allStandardEvents) {
        const size = payloadLen(fixture);
        // Exactly the declared size, filled with 0x01: every field read must stay in bounds, so
        // decoding neither throws nor degrades. 0x01 (not 0xff) is deliberate — it is a valid
        // `Either` discriminant AND sets every `Maybe` flag to `some`, so the trailing
        // `Uint<128>`/payload reads are actually exercised at their maximal offset rather than
        // short-circuited by a `none` flag or degraded by an out-of-range discriminant.
        const exact = { ...fixture, data: Fixtures.dataCell(new Uint8Array(size).fill(0x01)) };
        expect(() => ContractLog.decode(exact)).not.toThrow();
        expect(ContractLog.decode(exact).degraded).toBe(false);
        // One byte short: the length guard must degrade it (again without throwing).
        if (size > 0) {
          const short = { ...fixture, data: Fixtures.dataCell(new Uint8Array(size - 1).fill(0x01)) };
          expect(() => ContractLog.decode(short)).not.toThrow();
          expect(ContractLog.decode(short).degraded).toBe(true);
        }
      }
    });
  });
});

// Regression guard for midnight-sdk#278: these assert the decoder against the *confirmed* on-chain
// wire format (see the live-emit golden fixtures in `logEventFixtures.ts`), so each currently fails
// against the derived-offset decoder and passes once the offsets are corrected. Every case pins a
// distinct mis-decode: `Uint<128>` endianness, the 65-byte/both-arms `Either` and its discriminant
// polarity, the `domainSep` field on the unshielded spend/receive layouts, and the `shielded-receive`
// field order.
describe('ContractLog.decode — live-emit wire format (SDK#278)', () => {
  it('reads shielded-mint amount as little-endian', () => {
    const event = ContractLog.decode(Fixtures.goldenShieldedMint);
    if (event.degraded || event.eventType !== 'shielded-mint') throw new Error('unreachable');
    expect(event.payload.commitment).toEqual(bytes(32, 0xd0));
    expect(event.payload.domainSep).toEqual(bytes(32, 0xd1));
    expect(Option.getOrThrow(event.payload.amount)).toBe(1_000n);
  });

  it('reads shielded-burn amount as little-endian', () => {
    const event = ContractLog.decode(Fixtures.goldenShieldedBurn);
    if (event.degraded || event.eventType !== 'shielded-burn') throw new Error('unreachable');
    expect(event.payload.nullifier).toEqual(bytes(32, 0xe0));
    expect(Option.getOrThrow(event.payload.amount)).toBe(7n);
  });

  it('reads unshielded-mint amount as little-endian', () => {
    const event = ContractLog.decode(Fixtures.goldenUnshieldedMint);
    if (event.degraded || event.eventType !== 'unshielded-mint') throw new Error('unreachable');
    expect(event.payload.domainSep).toEqual(bytes(32, 0x71));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x72));
    expect(event.payload.amount).toBe(1_000n);
  });

  it('decodes shielded-receive in commitment · ciphertext · contract-address order', () => {
    const event = ContractLog.decode(Fixtures.goldenShieldedReceive);
    if (event.degraded || event.eventType !== 'shielded-receive') throw new Error('unreachable');
    expect(event.payload.commitment).toEqual(bytes(32, 0xc0));
    expect(Option.getOrThrow(event.payload.ciphertext)).toEqual(bytes(512, 0xc1));
    expect(Option.getOrThrow(event.payload.contractAddress)).toEqual(bytes(32, 0xc2));
  });

  it('decodes unshielded-spend sender as a 65-byte Either (discriminant 1 = coin-public-key)', () => {
    // Wire layout: sender Either(65) · domainSep(32) · token_type(32) · amount(LE). The decoder's
    // 33-byte Either + missing domainSep shift token_type and amount, so those assertions also fail
    // until the layout is corrected.
    const event = ContractLog.decode(Fixtures.goldenUnshieldedSpend);
    if (event.degraded || event.eventType !== 'unshielded-spend') throw new Error('unreachable');
    expect(event.payload.sender.kind).toBe('coin-public-key');
    expect(event.payload.sender.bytes).toEqual(bytes(32, 0x51));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x52));
    expect(event.payload.amount).toBe(1_000n);
  });

  it('decodes unshielded-receive recipient as a 65-byte Either (discriminant 0 = contract-address)', () => {
    const event = ContractLog.decode(Fixtures.goldenUnshieldedReceive);
    if (event.degraded || event.eventType !== 'unshielded-receive') throw new Error('unreachable');
    expect(event.payload.recipient.kind).toBe('contract-address');
    expect(event.payload.recipient.bytes).toEqual(bytes(32, 0x61));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x62));
    expect(event.payload.amount).toBe(1_000n);
  });

  it('decodes unshielded-burn sender as a 65-byte Either with a little-endian amount', () => {
    const event = ContractLog.decode(Fixtures.goldenUnshieldedBurn);
    if (event.degraded || event.eventType !== 'unshielded-burn') throw new Error('unreachable');
    expect(event.payload.sender.kind).toBe('coin-public-key');
    expect(event.payload.sender.bytes).toEqual(bytes(32, 0x81));
    expect(event.payload.tokenType).toEqual(bytes(32, 0x82));
    expect(event.payload.amount).toBe(500n);
  });
});

describe('ContractLog.decodeAll', () => {
  it('is index-aligned with the input and preserves order', () => {
    const decoded = ContractLog.decodeAll(Fixtures.allStandardEvents);
    expect(decoded).toHaveLength(Fixtures.allStandardEvents.length);
    decoded.forEach((event, i) => expect(event.raw).toBe(Fixtures.allStandardEvents[i]));
    expect(decoded.every((event) => !event.degraded)).toBe(true);
  });

  it('preserves degraded events in place rather than dropping them', () => {
    const decoded = ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.degradedNullData, Fixtures.misc]);
    expect(decoded.map((event) => event.degraded)).toEqual([false, true, false]);
  });
});

describe('ContractLog.indexedFields', () => {
  it('derives per-type indexed fields', () => {
    expect(Object.keys(ContractLog.indexedFields(ContractLog.decode(Fixtures.shieldedSpend)))).toEqual(['nullifier']);
    expect(Object.keys(ContractLog.indexedFields(ContractLog.decode(Fixtures.shieldedReceive)))).toEqual(['commitment']);
    expect(Object.keys(ContractLog.indexedFields(ContractLog.decode(Fixtures.shieldedMint)))).toEqual([
      'commitment',
      'domainSep'
    ]);
    expect(Object.keys(ContractLog.indexedFields(ContractLog.decode(Fixtures.unshieldedSpend)))).toEqual([
      'sender',
      'tokenType'
    ]);
    expect(Object.keys(ContractLog.indexedFields(ContractLog.decode(Fixtures.unshieldedReceive)))).toEqual([
      'recipient',
      'tokenType'
    ]);
    expect(Object.keys(ContractLog.indexedFields(ContractLog.decode(Fixtures.unshieldedMint)))).toEqual([
      'domainSep',
      'tokenType'
    ]);
  });

  it('indexes the sender/token bytes for unshielded events', () => {
    const fields = ContractLog.indexedFields(ContractLog.decode(Fixtures.unshieldedSpend));
    expect(fields.sender).toEqual(bytes(32, 0x51));
    expect(fields.tokenType).toEqual(bytes(32, 0x52));
  });

  it('indexes nothing for misc, lifecycle, or degraded events', () => {
    expect(ContractLog.indexedFields(ContractLog.decode(Fixtures.misc))).toEqual({});
    expect(ContractLog.indexedFields(ContractLog.decode(Fixtures.paused))).toEqual({});
    expect(ContractLog.indexedFields(ContractLog.decode(Fixtures.degradedNullData))).toEqual({});
  });
});
