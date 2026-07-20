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
 * Stage 1 decoder and schemas can target a real structure rather than an assumed one. This module
 * is the canonical record of those Stage 0 wire-shape findings — the confirmed envelope, the
 * derived payload byte layout, and their provenance — for the decoder in `src/effect/ContractLog.ts`.
 *
 * ## Envelope (confirmed)
 *
 * `LogEvent` (re-exported from `@midnight-ntwrk/compact-runtime`) is the `content` of a
 * `log`-tagged `GatherResult`, i.e. a **single object**:
 *
 * ```ts
 * // compact-runtime 0.18.0-rc.0: `address` tags the emitting contract.
 * type LogEvent = { version: number; eventType: LogEventType; data: EncodedStateValue; address: ContractAddress };
 * ```
 *
 * and `context.events` / `result.events` is a `LogEvent[]`. (This resolves the §3 "gap":
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
 * ## Payload byte layout (corrected per issue #278)
 *
 * `data` is a flat field-aligned binary buffer (flag/discriminant byte first). The **canonical
 * (unstripped)** sizes are below; the wire strips trailing zero bytes, so a real buffer may be
 * shorter — the decoder right-pads to the canonical width before slicing.
 *
 * | eventType            | tag | size | fields (byte layout)                                                            | indexed              |
 * | -------------------- | --- | ---- | ------------------------------------------------------------------------------- | -------------------- |
 * | `shielded-spend`     | 0   | 32   | nullifier `Bytes<32>`                                                            | nullifier            |
 * | `shielded-receive`   | 1   | 578  | commitment `Bytes<32>` · ciphertext `Maybe<Bytes<512>>`(1+512) · contract_address `Maybe<Bytes<32>>`(1+32) | commitment |
 * | `shielded-mint`      | 2   | 81   | commitment `Bytes<32>` · domain_sep `Bytes<32>` · amount `Maybe<Uint<128> LE>`(1+16) | commitment, domain_sep |
 * | `shielded-burn`      | 3   | 49   | nullifier `Bytes<32>` · amount `Maybe<Uint<128> LE>`(1+16)                       | nullifier            |
 * | `unshielded-spend`   | 4   | 145  | sender `Either<ZswapCoinPublicKey,ContractAddress>`(65) · domain_sep `Bytes<32>` · token_type `Bytes<32>` · amount `Uint<128> LE`(16) | sender, token_type |
 * | `unshielded-receive` | 5   | 145  | recipient `Either<…>`(65) · domain_sep `Bytes<32>` · token_type `Bytes<32>` · amount `Uint<128> LE`(16) | recipient, token_type |
 * | `unshielded-mint`    | 6   | 80   | domain_sep `Bytes<32>` · token_type `Bytes<32>` · amount `Uint<128> LE`(16)      | domain_sep, token_type |
 * | `unshielded-burn`    | 7   | 113  | sender `Either<…>`(65) · token_type `Bytes<32>` · amount `Uint<128> LE`(16) (no domain_sep) | sender, token_type   |
 * | `paused`             | 8   | 0    | —                                                                               | —                    |
 * | `unpaused`           | 9   | 0    | —                                                                               | —                    |
 * | `misc`               | 10  | 288  | name `Bytes<32>` · payload `Bytes<256>`                                          | — (none)             |
 *
 * **`Either` (65 B):** `[is_left:1][left:32][right:32]`, both arms present, inactive arm zero-filled.
 * `is_left=1` → Left → coin-public-key (left arm); `is_left=0` → Right → contract-address (right arm).
 *
 * **`Uint<128>` (≤16 B, little-endian, trailing zeros stripped):** small amounts serialize shorter
 * than 16 B (`0` → 0 bytes). Since stripping only removes tail bytes, the decoder right-pads the flat
 * buffer to canonical width, then slices at fixed offsets.
 *
 * @remarks
 * **Provenance.** The envelope, `eventType` literals, and `EncodedStateValue` union are confirmed
 * from the published runtime type defs (`@midnight-ntwrk/compact-runtime`,
 * `@midnightntwrk/onchain-runtime-v4`). The payload field layout above is the **corrected** layout
 * from the issue #278 root-cause analysis (65-B `Either`, LE `Uint<128>` with trailing-zero
 * stripping, post-compact#590 `shielded-receive` field order). The authoritative reference for the
 * byte layout is the indexer's Rust decoder (`indexer-common/src/domain/ledger/ledger_state.rs`);
 * where this table and that decoder disagree, the decoder wins. **Final validation gate:** the
 * end-to-end mismatch check (issue #278 §6.2, repo `compact-end-2-end`) against a live 0.33.x `emit` —
 * these fixtures are authored to the corrected layout but that e2e cross-check has not yet been run.
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

/** `Uint<128>` → little-endian bytes, trailing (high-order) zeros stripped, as the wire encodes. */
const uint128 = (value: bigint): Uint8Array => {
  const full = new Uint8Array(16);
  let v = value;
  for (let i = 0; i < 16; i++) {
    full[i] = Number(v & 0xffn);
    v >>= 8n;
  } // LE
  let end = 16;
  while (end > 0 && full[end - 1] === 0) end--; // strip trailing zeros
  return full.slice(0, end);
};

/** `Maybe<T>` → 1 flag byte (`1` = some, `0` = none) + the `size`-byte payload (zeroed when none). */
const maybe = (payload: Uint8Array | undefined, size: number): Uint8Array =>
  payload === undefined ? concat(Uint8Array.of(0), fill(size, 0)) : concat(Uint8Array.of(1), payload);

/**
 * `Either<A,B>` (65 B): `[is_left:1][left:32][right:32]`, inactive arm zero-filled.
 * left = `ZswapCoinPublicKey` (coin-public-key), `is_left=1`; right = `ContractAddress`, `is_left=0`.
 */
const either = (side: 'left' | 'right', address: Uint8Array): Uint8Array =>
  side === 'left'
    ? concat(Uint8Array.of(1), address, fill(32, 0))
    : concat(Uint8Array.of(0), fill(32, 0), address);

// --- envelope helpers -------------------------------------------------------------------------

/** Wrap a flat serialized payload buffer as the `cell`-shaped `data` the VM produces for `emit`. */
export const dataCell = (bytes: Uint8Array): LogEventData => ({
  tag: 'cell',
  content: {
    value: [bytes],
    alignment: [{ tag: 'atom', value: { tag: 'bytes', length: bytes.length } }]
  }
});

/**
 * A recognisable emitting-contract address. `LogEvent.address` (added in compact-runtime
 * `0.18.0-rc.0`) is a hex-encoded 32-byte string tagging the contract that emitted the event.
 */
export const FIXTURE_ADDRESS = '00'.repeat(32);

/** Construct a Phase-1 (`version: 1`) {@link LogEvent} from an `eventType` and serialized payload. */
const event = (eventType: LogEvent['eventType'], payload: Uint8Array, address: string = FIXTURE_ADDRESS): LogEvent => ({
  version: 1,
  eventType,
  data: dataCell(payload),
  address
});

// --- standard-event fixtures (one per declared type) ------------------------------------------

export const shieldedSpend: LogEvent = event('shielded-spend', bytes32(0x11));

// shielded-receive: commitment · ciphertext(Maybe<512>) · contractAddress(Maybe<32>)
export const shieldedReceive: LogEvent = event(
  'shielded-receive',
  concat(bytes32(0x22), maybe(fill(512, 0x24), 512), maybe(bytes32(0x23), 32))
);

export const shieldedMint: LogEvent = event(
  'shielded-mint',
  concat(bytes32(0x31), bytes32(0x32), maybe(uint128(1_000n), 16))
);

export const shieldedBurn: LogEvent = event('shielded-burn', concat(bytes32(0x41), maybe(uint128(7n), 16)));

// unshielded-spend: sender(Either) · domainSep · tokenType · amount(LE)
export const unshieldedSpend: LogEvent = event(
  'unshielded-spend',
  concat(either('left', bytes32(0x51)), bytes32(0x5a), bytes32(0x52), uint128(1_000n))
);

// unshielded-receive: recipient(Either right) · domainSep · tokenType · amount(LE)
export const unshieldedReceive: LogEvent = event(
  'unshielded-receive',
  concat(either('right', bytes32(0x61)), bytes32(0x6a), bytes32(0x62), uint128(1_000n))
);

// unshielded-mint: domainSep · tokenType · amount(LE)
export const unshieldedMint: LogEvent = event('unshielded-mint', concat(bytes32(0x71), bytes32(0x72), uint128(1_000n)));

// unshielded-burn: sender(Either) · tokenType · amount(LE) — NO domainSep
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
export const degradedNullData: LogEvent = {
  version: 1,
  eventType: 'shielded-spend',
  data: { tag: 'null' },
  address: FIXTURE_ADDRESS
};

/**
 * A short (8-byte) `shielded-spend` buffer. Under the right-pad model this is **not** degraded — the
 * decoder pads to the canonical 32 bytes, so it decodes to the 8-byte prefix followed by zero pad.
 * (Formerly `truncatedPayload`, which assumed a short buffer degraded; trailing-zero stripping makes
 * short buffers normal.)
 */
export const paddedShortSpend: LogEvent = event('shielded-spend', fill(8, 0x77));

/**
 * An event carrying the reserved fallback `version: 0`. The on-chain decoder uses version `0` for
 * malformed input wrapped as `misc`; the SDK should treat it as a degraded/unknown-version event
 * rather than failing.
 */
export const fallbackVersionZero: LogEvent = {
  version: 0,
  eventType: 'misc',
  data: { tag: 'null' },
  address: FIXTURE_ADDRESS
};

/**
 * An otherwise-valid event whose envelope `address` is malformed (not a 32-byte plain-hex string).
 * The branded `ContractAddress` constructor would throw on this, so the decoder must use the safe
 * variant and degrade rather than crash.
 */
export const malformedAddress: LogEvent = event('shielded-spend', bytes32(0x11), 'deadbeef');

/**
 * An `unshielded-spend` whose `Either` sender discriminant is `2` — structurally invalid (the
 * discriminant is `0` = coin-public-key or `1` = contract-address). The declared size is met, so
 * only the out-of-range discriminant marks this as garbage; the decoder must degrade rather than
 * decode to a confident wrong `kind`.
 */
export const invalidEitherDiscriminant: LogEvent = event(
  'unshielded-spend',
  concat(Uint8Array.of(2), bytes32(0x51), bytes32(0x5a), bytes32(0x52), uint128(1_000n))
);

// --- stripping edge fixtures (right-pad decode path; the issue #278 regressions) ---------------
// These lock in that a short buffer (small/zero tail stripped on the wire) DECODES, not degrades.

/**
 * `unshielded-mint` with `amount = 0` fully stripped: `uint128(0n)` yields 0 bytes, shortening the
 * buffer below the canonical 80. The decoder must right-pad and decode `amount: 0n` (not degrade).
 */
export const unshieldedMintZeroAmount: LogEvent = event('unshielded-mint', concat(bytes32(0x71), bytes32(0x72), uint128(0n)));

/**
 * `unshielded-spend` with `amount = 0` fully stripped — mirrors the indexer's
 * `decodes_unshielded_spend_amount_zero_fully_stripped`. Buffer is 129 B (canonical 145).
 */
export const unshieldedSpendZeroAmount: LogEvent = event(
  'unshielded-spend',
  concat(either('left', bytes32(0x51)), bytes32(0x5a), bytes32(0x52), uint128(0n))
);

/**
 * `shielded-burn` with a small `Maybe<Uint<128>>` amount (`1` → 1 byte): the buffer is shorter than
 * the canonical 49, so it must decode (`amount: some(1n)`), not degrade.
 */
export const shieldedBurnSmallAmount: LogEvent = event('shielded-burn', concat(bytes32(0x41), maybe(uint128(1n), 16)));

/**
 * `shielded-receive` with both `ciphertext` and `contractAddress` `None`: the all-zero tail strips
 * the buffer down to just the 32-byte commitment. The decoder must right-pad and decode two
 * `Option.none()`, not degrade below the canonical 578.
 */
export const shieldedReceiveAllNone: LogEvent = event('shielded-receive', bytes32(0x22));

/**
 * `unshielded-receive` with a **right-arm** `Either` (contract-address, `is_left=0`): asserts the
 * decoder reads `bytes` from the right arm `[33:65]`, not the (zero-filled) left arm.
 */
export const unshieldedReceiveContractAddress: LogEvent = event(
  'unshielded-receive',
  concat(either('right', bytes32(0x63)), bytes32(0x6a), bytes32(0x62), uint128(42n))
);
