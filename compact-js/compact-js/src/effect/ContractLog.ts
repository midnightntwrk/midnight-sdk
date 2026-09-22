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
 * Typed domain model for the contract log events emitted from Compact contracts via the `emit`
 * expression (MIP-0002).
 *
 * Events flow from contract emission → ledger wrapping → indexer storage → DApp queries. This
 * module turns the raw, on-chain-encoded {@link LogEvent} surfaced on a circuit result into a
 * typed, discriminated {@link ContractEvent} whose `payload` is decoded per event type.
 *
 * @remarks
 * - **Event version**: Phase-1 wire format is `version: 1`. Version `0` is reserved on-chain for
 *   the decoder's malformed-input fallback, so it is treated here as degraded/unknown, never an
 *   error.
 * - **Graceful degradation** (MIP-0002): an oversized or malformed payload is dropped on-chain
 *   (surfaced as an empty `{ tag: 'null' }` `data`, or a short buffer). Decoding **never throws**
 *   and never fails a batch — such events decode to a {@link ContractEvent} with `degraded: true`
 *   and `payload: undefined`. Absence is normal.
 * - **Indexed fields** are derived from the event type (not marked by the author); see
 *   {@link indexedFields}. `Misc` and lifecycle events index nothing.
 * - **Non-consensus**: events are NOT consensus state; retention is a downstream (indexer) policy.
 * - **Wire layout**: the intra-`data` field byte-offsets read by {@link decode} follow the
 *   corrected field-aligned layout from issue #278 — a 65-byte `Either` (`[is_left:1][left:32][right:32]`,
 *   `is_left=1` → coin-public-key), little-endian `Uint<128>` with trailing zeros stripped (buffers
 *   are right-padded to canonical width before slicing), and the post-compact#590 `shielded-receive`
 *   field order `(commitment, ciphertext, contractAddress)`. See the layout table in
 *   `test/effect/logEventFixtures.ts`. The authoritative reference is the indexer's Rust decoder
 *   (`ledger_state.rs`); the end-to-end cross-check against a live `emit` (see that file's provenance
 *   note) is the final validation gate. A wrong offset decodes **silently** to a wrong value rather
 *   than degrading.
 *
 * @packageDocumentation
 */
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { Option } from 'effect';
import * as Schema from 'effect/Schema';

/**
 * The `EncodedStateValue` arms this module discriminates.
 *
 * @remarks
 * Only the `cell` arm carries a payload to decode; every other arm means the event's data was
 * dropped on-chain or is not a byte buffer, which {@link decode} surfaces as a degraded event. The
 * remaining tags are named rather than widened to `string` so that `data.tag === 'cell'` narrows.
 *
 * @category model
 */
export type LogEventData =
  | { readonly tag: 'cell'; readonly content: { readonly value: readonly Uint8Array[] } }
  | { readonly tag: 'null' | 'map' | 'array' | 'boundedMerkleTree' };

/**
 * The raw log event a circuit result carries — stated **era-free**, as the structural minimum this
 * module reads.
 *
 * @remarks
 * This used to be re-exported from the {@link CompactRuntime} seam, which resolves
 * `internal/runtime/current.ts`. That made it the one era-varying type on an era-pinned entry that
 * was *not* derived from a binding argument: `/v9/effect` exported `ContractExecutable`'s
 * `CallResult.events` as ledger 9's (correctly derived) while its `ContractLog` would have followed
 * the build's bound era. Harmless while the two coincide, and wrong in exactly the situation the
 * era-pinned entries exist for — a fork window, where a consumer holds the retained era and the new
 * one in one process and the retained era's path is the one that must keep working
 * (midnight-sdk#388).
 *
 * Stating the minimum rather than naming a line is the same choice `Contract.CircuitResults` makes,
 * and it costs nothing here: {@link decode} and {@link decodeAll} are generic in the event they are
 * given, so a caller passing an era's own `LogEvent` gets it back on {@link ContractEventBase.raw}
 * unchanged. `internal/runtime/conformance.ts` asserts each events-capable line still satisfies it.
 *
 * @category model
 */
export interface LogEvent {
  /** The wire-format version (`1` for Phase 1; `0` is the reserved fallback). */
  readonly version: number;
  /** The emitting contract's address, unvalidated as the runtime supplied it. */
  readonly address: string;
  readonly eventType: LogEventType;
  readonly data: LogEventData;
}

/**
 * Schema for the standard `LogEventType` discriminants emitted by Compact contracts — the single
 * source of truth for the event-type literals, imported by `ContractEventValidator`.
 *
 * @category model
 */
export const LogEventTypeSchema = Schema.Literal(
  'shielded-spend',
  'shielded-receive',
  'shielded-mint',
  'shielded-burn',
  'unshielded-spend',
  'unshielded-receive',
  'unshielded-mint',
  'unshielded-burn',
  'paused',
  'unpaused',
  'misc'
);

/**
 * The standard event types emitted by Compact contracts.
 *
 * @category model
 */
export type LogEventType = typeof LogEventTypeSchema.Type;

// --- decoded payload types --------------------------------------------------------------------

/**
 * The recipient/sender side of an unshielded event — an `Either<ZswapCoinPublicKey, ContractAddress>`.
 * `kind` is the `Either` discriminant; `bytes` are the raw 32-byte address.
 *
 * @category model
 */
export interface EitherAddress {
  readonly kind: 'coin-public-key' | 'contract-address';
  readonly bytes: Uint8Array;
}

/** @category model */
export interface ShieldedSpendPayload {
  readonly nullifier: Uint8Array;
}
/** @category model */
export interface ShieldedReceivePayload {
  readonly commitment: Uint8Array;
  readonly contractAddress: Option.Option<Uint8Array>;
  readonly ciphertext: Option.Option<Uint8Array>;
}
/** @category model */
export interface ShieldedMintPayload {
  readonly commitment: Uint8Array;
  readonly domainSep: Uint8Array;
  readonly amount: Option.Option<bigint>;
}
/** @category model */
export interface ShieldedBurnPayload {
  readonly nullifier: Uint8Array;
  readonly amount: Option.Option<bigint>;
}
/** @category model */
export interface UnshieldedSpendPayload {
  readonly sender: EitherAddress;
  /** The 32-byte domain separator carried on the wire (not an indexed field). */
  readonly domainSep: Uint8Array;
  readonly tokenType: Uint8Array;
  readonly amount: bigint;
}
/** @category model */
export interface UnshieldedReceivePayload {
  readonly recipient: EitherAddress;
  /** The 32-byte domain separator carried on the wire (not an indexed field). */
  readonly domainSep: Uint8Array;
  readonly tokenType: Uint8Array;
  readonly amount: bigint;
}
/** @category model */
export interface UnshieldedMintPayload {
  readonly domainSep: Uint8Array;
  readonly tokenType: Uint8Array;
  readonly amount: bigint;
}
/** @category model */
export interface UnshieldedBurnPayload {
  readonly sender: EitherAddress;
  readonly tokenType: Uint8Array;
  readonly amount: bigint;
}
/** Lifecycle events (`paused`/`unpaused`) carry no payload fields. @category model */
export type LifecyclePayload = Record<never, never>;
/** @category model */
export interface MiscPayload {
  readonly name: Uint8Array;
  readonly payload: Uint8Array;
}

/**
 * Maps each {@link LogEventType} to its decoded payload type.
 *
 * @category model
 */
export interface PayloadMap {
  readonly 'shielded-spend': ShieldedSpendPayload;
  readonly 'shielded-receive': ShieldedReceivePayload;
  readonly 'shielded-mint': ShieldedMintPayload;
  readonly 'shielded-burn': ShieldedBurnPayload;
  readonly 'unshielded-spend': UnshieldedSpendPayload;
  readonly 'unshielded-receive': UnshieldedReceivePayload;
  readonly 'unshielded-mint': UnshieldedMintPayload;
  readonly 'unshielded-burn': UnshieldedBurnPayload;
  readonly 'paused': LifecyclePayload;
  readonly 'unpaused': LifecyclePayload;
  readonly 'misc': MiscPayload;
}

/** The common fields carried by every {@link ContractEvent}. @category model */
export interface ContractEventBase<E extends LogEvent = LogEvent> {
  /** The wire-format version (`1` for Phase 1). */
  readonly version: number;
  /**
   * The address of the contract that emitted the event. Always a validated
   * {@link ContractAddress.ContractAddress} on a {@link DecodedEvent}; on a {@link DegradedEvent}
   * whose degradation was caused by a malformed envelope address, this is the unvalidated raw
   * string as supplied by the runtime (also available on `raw.address`).
   */
  readonly address: ContractAddress.ContractAddress;
  /** The original, undecoded log event. */
  readonly raw: E;
}

/**
 * A successfully decoded contract event. Narrow on `eventType` to obtain the typed `payload`.
 *
 * @category model
 */
export type DecodedEvent<E extends LogEvent = LogEvent> = {
  [K in LogEventType]: ContractEventBase<E> & {
    readonly eventType: K;
    readonly payload: PayloadMap[K];
    readonly degraded: false;
  };
}[LogEventType];

/**
 * An event whose payload could not be decoded — dropped on-chain (`{ tag: 'null' }` data),
 * truncated, carrying the reserved fallback `version: 0`, or bearing a malformed envelope address.
 * Per MIP-0002 this is normal, not an error; the raw event is still available via
 * {@link ContractEventBase.raw}.
 *
 * @category model
 */
export type DegradedEvent<E extends LogEvent = LogEvent> = ContractEventBase<E> & {
  readonly eventType: LogEventType;
  readonly payload: undefined;
  readonly degraded: true;
};

/**
 * A typed contract event: either a {@link DecodedEvent} or a {@link DegradedEvent}. Discriminate
 * on `degraded`, then narrow on `eventType`.
 *
 * @category model
 */
export type ContractEvent<E extends LogEvent = LogEvent> = DecodedEvent<E> | DegradedEvent<E>;

// --- byte-buffer readers ----------------------------------------------------------------------

const concatSegments = (segments: readonly Uint8Array[]): Uint8Array => {
  if (segments.length === 1) return segments[0]!;
  const total = segments.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const s of segments) {
    out.set(s, offset);
    offset += s.length;
  }
  return out;
};

/** Flatten a `LogEvent.data` to its concatenated byte buffer, or `undefined` if not a `cell`. */
const flatten = (data: LogEventData): Uint8Array | undefined =>
  data.tag === 'cell' ? concatSegments(data.content.value) : undefined;

/** Read a little-endian `Uint<128>` (≤16 bytes; wire strips trailing/high-order zeros). */
const readUint128 = (buf: Uint8Array, offset: number): bigint => {
  let v = 0n;
  for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(buf[offset + i] ?? 0);
  return v;
};

/** Read a `Maybe<Bytes<size>>`: a flag byte (`1` = some) followed by the fixed-width payload. */
const readMaybeBytes = (buf: Uint8Array, offset: number, size: number): Option.Option<Uint8Array> =>
  buf[offset] === 1 ? Option.some(buf.slice(offset + 1, offset + 1 + size)) : Option.none();

/** Read a `Maybe<Uint<128>>`: a flag byte (`1` = some) followed by the 16-byte value. */
const readMaybeUint128 = (buf: Uint8Array, offset: number): Option.Option<bigint> =>
  buf[offset] === 1 ? Option.some(readUint128(buf, offset + 1)) : Option.none();

/**
 * Read an `Either<ZswapCoinPublicKey, ContractAddress>` (65 B): `[is_left:1][left:32][right:32]`,
 * both arms present, inactive arm zero-filled. `is_left=1` → Left → coin-public-key (left arm);
 * `is_left=0` → Right → contract-address (right arm). Any other discriminant is garbage (out-of-range
 * byte, or a misaligned read) and yields `undefined` so the caller degrades rather than decoding to a
 * confident wrong `kind`.
 */
const readEither = (buf: Uint8Array, offset: number): EitherAddress | undefined => {
  const isLeft = buf[offset];
  if (isLeft !== 0 && isLeft !== 1) return undefined;
  return isLeft === 1
    ? { kind: 'coin-public-key', bytes: buf.slice(offset + 1, offset + 33) }
    : { kind: 'contract-address', bytes: buf.slice(offset + 33, offset + 65) };
};

/** Right-pad `buf` with zero bytes up to `size` (undoing the wire's trailing-zero stripping). */
const padRight = (buf: Uint8Array, size: number): Uint8Array => {
  if (buf.length >= size) return buf;
  const out = new Uint8Array(size);
  out.set(buf, 0);
  return out;
};

/**
 * The canonical (unstripped) serialized size, in bytes, of each event's payload. The wire strips
 * trailing zero bytes, so a real buffer may be shorter; {@link decodePayload} right-pads to this
 * width before slicing at fixed offsets (indexer parity), so a short buffer is normal, not degraded.
 */
const PAYLOAD_SIZE: Record<LogEventType, number> = {
  'shielded-spend': 32,
  'shielded-receive': 578,
  'shielded-mint': 81,
  'shielded-burn': 49,
  'unshielded-spend': 145,
  'unshielded-receive': 145,
  'unshielded-mint': 80,
  'unshielded-burn': 113,
  'paused': 0,
  'unpaused': 0,
  'misc': 288
};

/**
 * Decode the payload buffer for a given event type. Byte offsets follow the field-aligned layout
 * tabulated in `test/effect/logEventFixtures.ts`.
 *
 * The wire strips trailing zero bytes, so the raw buffer is first right-padded to the canonical
 * width ({@link PAYLOAD_SIZE}) before slicing — a short buffer is normal (small/zero tail), not
 * degraded. Degradation still occurs on `{ tag: 'null' }` data, `version: 0`, a bad envelope
 * address, or an out-of-range `Either` discriminant (which returns `undefined` here).
 */
const decodePayload = (eventType: LogEventType, raw: Uint8Array): PayloadMap[LogEventType] | undefined => {
  const buf = padRight(raw, PAYLOAD_SIZE[eventType]);
  switch (eventType) {
    case 'shielded-spend':
      return { nullifier: buf.slice(0, 32) };
    case 'shielded-receive':
      return {
        commitment: buf.slice(0, 32),
        ciphertext: readMaybeBytes(buf, 32, 512),
        contractAddress: readMaybeBytes(buf, 545, 32)
      };
    case 'shielded-mint':
      return { commitment: buf.slice(0, 32), domainSep: buf.slice(32, 64), amount: readMaybeUint128(buf, 64) };
    case 'shielded-burn':
      return { nullifier: buf.slice(0, 32), amount: readMaybeUint128(buf, 32) };
    case 'unshielded-spend': {
      const sender = readEither(buf, 0);
      return sender === undefined
        ? undefined
        : { sender, domainSep: buf.slice(65, 97), tokenType: buf.slice(97, 129), amount: readUint128(buf, 129) };
    }
    case 'unshielded-receive': {
      const recipient = readEither(buf, 0);
      return recipient === undefined
        ? undefined
        : { recipient, domainSep: buf.slice(65, 97), tokenType: buf.slice(97, 129), amount: readUint128(buf, 129) };
    }
    case 'unshielded-mint':
      return { domainSep: buf.slice(0, 32), tokenType: buf.slice(32, 64), amount: readUint128(buf, 64) };
    case 'unshielded-burn': {
      const sender = readEither(buf, 0);
      return sender === undefined
        ? undefined
        : { sender, tokenType: buf.slice(65, 97), amount: readUint128(buf, 97) };
    }
    case 'paused':
    case 'unpaused':
      return {};
    case 'misc':
      return { name: buf.slice(0, 32), payload: buf.slice(32, 288) };
  }
};

// --- public decoding API ----------------------------------------------------------------------

/**
 * Decode a single raw {@link LogEvent} into a typed {@link ContractEvent}.
 *
 * This is a total, pure function: it **never throws**. A dropped (`{ tag: 'null' }`), truncated,
 * or `version: 0` payload — or a malformed envelope address — decodes to a {@link DegradedEvent}
 * (`degraded: true`, `payload: undefined`) per the MIP-0002 graceful-degradation rule; the raw
 * event remains on `raw`.
 *
 * The `payload` field byte-offsets follow the corrected layout from issue #278 (see the module-level
 * remarks). The end-to-end cross-check against a live `emit` is the final validation gate; a wrong
 * offset decodes silently to a wrong value rather than degrading.
 *
 * @param raw The raw log event surfaced on a circuit result.
 * @returns The decoded, typed event.
 *
 * @category decoding
 */
export const decode = <E extends LogEvent>(raw: E): ContractEvent<E> => {
  // Construct the emitting address with the brand's *safe* variant: a malformed envelope address
  // (wrong length, non-hex, `0x`-prefixed) would otherwise throw a `Brand.BrandErrors`, breaking
  // the never-throw guarantee. A bad address is a degraded envelope — surface it best-effort (the
  // raw string is always available on `raw.address`) and mark the event degraded.
  const address = ContractAddress.ContractAddress.option(raw.address);
  if (Option.isNone(address)) {
    return {
      version: raw.version,
      address: raw.address as ContractAddress.ContractAddress,
      raw,
      eventType: raw.eventType,
      payload: undefined,
      degraded: true
    };
  }
  const base: ContractEventBase<E> = { version: raw.version, address: address.value, raw };
  const buf = raw.version === 0 ? undefined : flatten(raw.data);
  const payload = buf === undefined ? undefined : decodePayload(raw.eventType, buf);
  return payload === undefined
    ? { ...base, eventType: raw.eventType, payload: undefined, degraded: true }
    : ({ ...base, eventType: raw.eventType, payload, degraded: false } as DecodedEvent<E>);
};

/**
 * Decode a batch of raw {@link LogEvent}s (e.g. `result.events`) into typed {@link ContractEvent}s.
 *
 * Like {@link decode}, this never throws — degraded events are preserved in place rather than
 * dropped, so the returned array is index-aligned with the input.
 *
 * @param events The raw log events to decode.
 * @returns The decoded, typed events, in input order.
 *
 * @category decoding
 */
export const decodeAll = <E extends LogEvent>(events: readonly E[]): ContractEvent<E>[] => events.map(decode);

/**
 * Derive the indexable fields of a decoded event, as raw byte values keyed by field name.
 *
 * Indexed fields are determined by the event type (MIP-0002), not marked by the author:
 * - `shielded-spend`/`shielded-burn` → `nullifier`
 * - `shielded-receive` → `commitment`
 * - `shielded-mint` → `commitment`, `domainSep`
 * - `unshielded-spend`/`unshielded-burn` → `sender`, `tokenType`
 * - `unshielded-receive` → `recipient`, `tokenType`
 * - `unshielded-mint` → `domainSep`, `tokenType`
 * - `paused`/`unpaused`/`misc` and any degraded event → none
 *
 * @param event The decoded event.
 * @returns A map of indexable field name to its raw bytes; empty when the type indexes nothing.
 *
 * @category indexing
 */
export const indexedFields = (event: ContractEvent): Record<string, Uint8Array> => {
  if (event.degraded) return {};
  switch (event.eventType) {
    case 'shielded-spend':
      return { nullifier: event.payload.nullifier };
    case 'shielded-receive':
      return { commitment: event.payload.commitment };
    case 'shielded-mint':
      return { commitment: event.payload.commitment, domainSep: event.payload.domainSep };
    case 'shielded-burn':
      return { nullifier: event.payload.nullifier };
    case 'unshielded-spend':
      return { sender: event.payload.sender.bytes, tokenType: event.payload.tokenType };
    case 'unshielded-receive':
      return { recipient: event.payload.recipient.bytes, tokenType: event.payload.tokenType };
    case 'unshielded-mint':
      return { domainSep: event.payload.domainSep, tokenType: event.payload.tokenType };
    case 'unshielded-burn':
      return { sender: event.payload.sender.bytes, tokenType: event.payload.tokenType };
    default:
      return {};
  }
};
