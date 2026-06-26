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

/**
 * Stage 0 (MIP-0002 Part 2) — captured/derived contract log-event fixtures.
 *
 * These fixtures pin down the **confirmed wire shape** of a single contract log event so the
 * Stage 1 decoder and schemas can target a real structure rather than an assumed one. See the
 * "Stage 0 — wire-shape findings" section appended to `EVENTS_INTEGRATION_PLAN.md`.
 *
 * ## Envelope (confirmed)
 *
 * `LogEvent` (re-exported from `@midnight-ntwrk/compact-runtime`) is the `content` of a
 * `log`-tagged `GatherResult`, i.e. a **single object**:
 *
 * ```ts
 * type LogEvent = { version: number; eventType: LogEventType; data: EncodedStateValue };
 * ```
 *
 * and `context.events` / `result.public.events` is a `LogEvent[]`. (This resolves the §3 "gap":
 * `LogEvent` is NOT an "encoded VersionedLogItem array" — it is one `{version,eventType,data}`
 * record, and the existing `ContractEventValidator` schema already matches it.)
 *
 * - `version` — Phase-1 wire format is `1`. (`0` is reserved on-chain for the decoder's
 *   malformed-input fallback path.)
 * - `eventType` — kebab-case string discriminant, exactly the validator's literals
 *   (`'shielded-spend' | … | 'misc'`); the on-chain numeric tag (0–10) is mapped to this string
 *   by the runtime.
 * - `data` — an `EncodedStateValue`. For an `emit`, the compiler lowers the event struct to its
 *   canonical `serialize<T, #n>` byte encoding (a flat `Bytes<n>`) and the VM wraps it as a
 *   single `{ tag: 'cell', content: AlignedValue }`. `AlignedValue.value` is `Uint8Array[]`
 *   (one or more segments — a decoder must concatenate them) and `alignment` describes the
 *   byte layout. `Paused`/`Unpaused` carry a zero-length payload.
 *
 * ## Payload byte layout (per `compiler/midnight-events.ss`)
 *
 * `data` is a flat field-aligned binary buffer; the declared serialized sizes reconcile exactly
 * with concatenating the fields below (flag/discriminant byte first):
 *
 * | eventType            | tag | size | fields (byte layout)                                                            | indexed              |
 * | -------------------- | --- | ---- | ------------------------------------------------------------------------------- | -------------------- |
 * | `shielded-spend`     | 0   | 32   | nullifier `Bytes<32>`                                                            | nullifier            |
 * | `shielded-receive`   | 1   | 578  | commitment `Bytes<32>` · contract_address `Maybe<Bytes<32>>`(1+32) · ciphertext `Maybe<Bytes<512>>`(1+512) | commitment |
 * | `shielded-mint`      | 2   | 81   | commitment `Bytes<32>` · domain_sep `Bytes<32>` · amount `Maybe<Uint<128>>`(1+16) | commitment, domain_sep |
 * | `shielded-burn`      | 3   | 49   | nullifier `Bytes<32>` · amount `Maybe<Uint<128>>`(1+16)                          | nullifier            |
 * | `unshielded-spend`   | 4   | 81   | sender `Either<ZswapCoinPublicKey,ContractAddress>`(1+32) · token_type `Bytes<32>` · amount `Uint<128>`(16) | sender, token_type |
 * | `unshielded-receive` | 5   | 81   | recipient `Either<…>`(1+32) · token_type `Bytes<32>` · amount `Uint<128>`(16)   | recipient, token_type |
 * | `unshielded-mint`    | 6   | 80   | domain_sep `Bytes<32>` · token_type `Bytes<32>` · amount `Uint<128>`(16)         | domain_sep, token_type |
 * | `unshielded-burn`    | 7   | 81   | sender `Either<…>`(1+32) · token_type `Bytes<32>` · amount `Uint<128>`(16)       | sender, token_type   |
 * | `paused`             | 8   | 0    | —                                                                               | —                    |
 * | `unpaused`           | 9   | 0    | —                                                                               | —                    |
 * | `misc`               | 10  | 288  | name `Bytes<32>` · payload `Bytes<256>`                                          | — (none)             |
 *
 * @remarks
 * **Provenance.** The envelope, `eventType` literals, and `EncodedStateValue` union are confirmed
 * from the published runtime type defs (`@midnight-ntwrk/compact-runtime`,
 * `@midnightntwrk/onchain-runtime-v4`). The payload field layout and the `cell`-of-serialized-bytes
 * wrapping are derived from the compiler's `lower-emit` pass + `midnight-events.ss` declarations +
 * the language reference (all sizes reconcile). They are NOT yet captured from a live `emit`,
 * because the SDK's bundled managed contracts were compiled with compactc 0.31.0 whose standard
 * token library does **not** emit `log` ops (a real run yields `events: []`), and `emit` is a
 * post-0.31.0 feature not in the bundled toolchain. Stage 1 should re-confirm the intra-`data`
 * field offsets (Maybe flag position, Uint endianness) against a live `emit` once an emit-capable
 * compactc is wired into the test build; the envelope is solid regardless.
 */

import type { LogEvent } from '@midnight-ntwrk/compact-runtime';

/** The `data` member of a {@link LogEvent} (an `EncodedStateValue` from the onchain runtime). */
export type LogEventData = LogEvent['data'];

// --- byte-buffer helpers ----------------------------------------------------------------------

const fill = (len: number, byte: number): Uint8Array => new Uint8Array(len).fill(byte);

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

/** A distinct, recognisable 32-byte value (so decoded fields are visibly correct in tests). */
const bytes32 = (byte: number): Uint8Array => fill(32, byte);

/** `Uint<128>` → 16 big-endian bytes. */
const uint128 = (value: bigint): Uint8Array => {
  const out = new Uint8Array(16);
  let v = value;
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

/** `Maybe<T>` → 1 flag byte (`1` = some, `0` = none) + the `size`-byte payload (zeroed when none). */
const maybe = (payload: Uint8Array | undefined, size: number): Uint8Array =>
  payload === undefined ? concat(Uint8Array.of(0), fill(size, 0)) : concat(Uint8Array.of(1), payload);

/** `Either<A,B>` → 1 discriminant byte (`0` = left, `1` = right) + the 32-byte address. */
const either = (side: 'left' | 'right', address: Uint8Array): Uint8Array =>
  concat(Uint8Array.of(side === 'left' ? 0 : 1), address);

// --- envelope helpers -------------------------------------------------------------------------

/** Wrap a flat serialized payload buffer as the `cell`-shaped `data` the VM produces for `emit`. */
export const dataCell = (bytes: Uint8Array): LogEventData => ({
  tag: 'cell',
  content: {
    value: [bytes],
    alignment: [{ tag: 'atom', value: { tag: 'bytes', length: bytes.length } }]
  }
});

/** Construct a Phase-1 (`version: 1`) {@link LogEvent} from an `eventType` and serialized payload. */
const event = (eventType: LogEvent['eventType'], payload: Uint8Array): LogEvent => ({
  version: 1,
  eventType,
  data: dataCell(payload)
});

// --- standard-event fixtures (one per declared type) ------------------------------------------

export const shieldedSpend: LogEvent = event('shielded-spend', bytes32(0x11));

export const shieldedReceive: LogEvent = event(
  'shielded-receive',
  concat(bytes32(0x22), maybe(bytes32(0x23), 32), maybe(fill(512, 0x24), 512))
);

export const shieldedMint: LogEvent = event(
  'shielded-mint',
  concat(bytes32(0x31), bytes32(0x32), maybe(uint128(1_000n), 16))
);

export const shieldedBurn: LogEvent = event('shielded-burn', concat(bytes32(0x41), maybe(uint128(7n), 16)));

export const unshieldedSpend: LogEvent = event(
  'unshielded-spend',
  concat(either('left', bytes32(0x51)), bytes32(0x52), uint128(1_000n))
);

export const unshieldedReceive: LogEvent = event(
  'unshielded-receive',
  concat(either('right', bytes32(0x61)), bytes32(0x62), uint128(1_000n))
);

export const unshieldedMint: LogEvent = event('unshielded-mint', concat(bytes32(0x71), bytes32(0x72), uint128(1_000n)));

export const unshieldedBurn: LogEvent = event(
  'unshielded-burn',
  concat(either('left', bytes32(0x81)), bytes32(0x82), uint128(500n))
);

/** Lifecycle events carry a zero-length payload. */
export const paused: LogEvent = event('paused', fill(0, 0));

export const unpaused: LogEvent = event('unpaused', fill(0, 0));

export const misc: LogEvent = event('misc', concat(bytes32(0xa1), fill(256, 0xa2)));

/** Every standard fixture, in `eventType` tag order. */
export const allStandardEvents: readonly LogEvent[] = [
  shieldedSpend,
  shieldedReceive,
  shieldedMint,
  shieldedBurn,
  unshieldedSpend,
  unshieldedReceive,
  unshieldedMint,
  unshieldedBurn,
  paused,
  unpaused,
  misc
];

// --- degraded / edge fixtures (MIP-0002 graceful-degradation rule) ----------------------------

/**
 * A degraded event whose on-chain payload was dropped (oversized/malformed) — surfaced as an
 * empty (`null`) `EncodedStateValue`. A decoder must NOT throw on this; absence is normal.
 */
export const degradedNullData: LogEvent = { version: 1, eventType: 'shielded-spend', data: { tag: 'null' } };

/** A `shielded-spend` whose payload is shorter than the declared 32 bytes (truncated/malformed). */
export const truncatedPayload: LogEvent = event('shielded-spend', fill(8, 0x00));

/**
 * An event carrying the reserved fallback `version: 0`. The on-chain decoder uses version `0` for
 * malformed input wrapped as `misc`; the SDK should treat it as a degraded/unknown-version event
 * rather than failing.
 */
export const fallbackVersionZero: LogEvent = { version: 0, eventType: 'misc', data: { tag: 'null' } };
