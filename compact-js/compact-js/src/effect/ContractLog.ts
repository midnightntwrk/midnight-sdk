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
 * - **⚠️ Payload decoding is experimental**: the intra-`data` field byte-offsets read by
 *   {@link decode} (Maybe flag positions, `Uint<128>` big-endianness, the `Either` discriminant
 *   value) are **derived from the compiler source**, not yet confirmed against a live `emit` — the
 *   bundled compactc emits no `log` ops, so no fixture exercises a real payload (see
 *   `EVENTS_INTEGRATION_PLAN.md` §11.3). The **envelope** (`version`, `eventType`, `address`,
 *   degradation) is confirmed. A wrong offset would decode **silently** to a wrong value rather
 *   than degrading, so treat a decoded `payload` as provisional until re-confirmed against a live
 *   emit.
 *
 * @packageDocumentation
 */
import type { LogEvent } from '@midnight-ntwrk/compact-runtime';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { Option } from 'effect';
import * as Schema from 'effect/Schema';

export type { LogEvent } from '@midnight-ntwrk/compact-runtime';

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
  readonly tokenType: Uint8Array;
  readonly amount: bigint;
}
/** @category model */
export interface UnshieldedReceivePayload {
  readonly recipient: EitherAddress;
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
export interface ContractEventBase {
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
  readonly raw: LogEvent;
}

/**
 * A successfully decoded contract event. Narrow on `eventType` to obtain the typed `payload`.
 *
 * @category model
 */
export type DecodedEvent = {
  [K in LogEventType]: ContractEventBase & {
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
export type DegradedEvent = ContractEventBase & {
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
export type ContractEvent = DecodedEvent | DegradedEvent;

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
const flatten = (data: LogEvent['data']): Uint8Array | undefined =>
  data.tag === 'cell' ? concatSegments(data.content.value) : undefined;

/** Read a big-endian `Uint<128>` (16 bytes) as a `bigint`. */
const readUint128 = (buf: Uint8Array, offset: number): bigint => {
  let v = 0n;
  for (let i = 0; i < 16; i++) v = (v << 8n) | BigInt(buf[offset + i]!);
  return v;
};

/** Read a `Maybe<Bytes<size>>`: a flag byte (`1` = some) followed by the fixed-width payload. */
const readMaybeBytes = (buf: Uint8Array, offset: number, size: number): Option.Option<Uint8Array> =>
  buf[offset] === 1 ? Option.some(buf.slice(offset + 1, offset + 1 + size)) : Option.none();

/** Read a `Maybe<Uint<128>>`: a flag byte (`1` = some) followed by the 16-byte value. */
const readMaybeUint128 = (buf: Uint8Array, offset: number): Option.Option<bigint> =>
  buf[offset] === 1 ? Option.some(readUint128(buf, offset + 1)) : Option.none();

/** Read an `Either<ZswapCoinPublicKey, ContractAddress>`: a discriminant byte + 32-byte address. */
const readEither = (buf: Uint8Array, offset: number): EitherAddress => ({
  kind: buf[offset] === 0 ? 'coin-public-key' : 'contract-address',
  bytes: buf.slice(offset + 1, offset + 33)
});

/**
 * The declared serialized size, in bytes, of each event's payload (per the compiler's
 * `midnight-events.ss`). A buffer shorter than this decodes to a {@link DegradedEvent}.
 */
const PAYLOAD_SIZE: Record<LogEventType, number> = {
  'shielded-spend': 32,
  'shielded-receive': 578,
  'shielded-mint': 81,
  'shielded-burn': 49,
  'unshielded-spend': 81,
  'unshielded-receive': 81,
  'unshielded-mint': 80,
  'unshielded-burn': 81,
  'paused': 0,
  'unpaused': 0,
  'misc': 288
};

/**
 * Decode the payload buffer for a given event type, or `undefined` if the buffer is too short
 * (degraded). Byte offsets follow the field-aligned layout in `EVENTS_INTEGRATION_PLAN.md` §11.2.
 */
const decodePayload = (eventType: LogEventType, buf: Uint8Array): PayloadMap[LogEventType] | undefined => {
  if (buf.length < PAYLOAD_SIZE[eventType]) return undefined;
  switch (eventType) {
    case 'shielded-spend':
      return { nullifier: buf.slice(0, 32) };
    case 'shielded-receive':
      return {
        commitment: buf.slice(0, 32),
        contractAddress: readMaybeBytes(buf, 32, 32),
        ciphertext: readMaybeBytes(buf, 65, 512)
      };
    case 'shielded-mint':
      return { commitment: buf.slice(0, 32), domainSep: buf.slice(32, 64), amount: readMaybeUint128(buf, 64) };
    case 'shielded-burn':
      return { nullifier: buf.slice(0, 32), amount: readMaybeUint128(buf, 32) };
    case 'unshielded-spend':
      return { sender: readEither(buf, 0), tokenType: buf.slice(33, 65), amount: readUint128(buf, 65) };
    case 'unshielded-receive':
      return { recipient: readEither(buf, 0), tokenType: buf.slice(33, 65), amount: readUint128(buf, 65) };
    case 'unshielded-mint':
      return { domainSep: buf.slice(0, 32), tokenType: buf.slice(32, 64), amount: readUint128(buf, 64) };
    case 'unshielded-burn':
      return { sender: readEither(buf, 0), tokenType: buf.slice(33, 65), amount: readUint128(buf, 65) };
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
 * @experimental The `payload` field byte-offsets are derived from the compiler source and not yet
 * confirmed against a live `emit` (see the module-level remarks and `EVENTS_INTEGRATION_PLAN.md`
 * §11.3). A wrong offset decodes silently to a wrong value; treat decoded payloads as provisional.
 * The envelope and degradation behaviour are confirmed.
 *
 * @param raw The raw log event surfaced on a circuit result.
 * @returns The decoded, typed event.
 *
 * @category decoding
 */
export const decode = (raw: LogEvent): ContractEvent => {
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
  const base: ContractEventBase = { version: raw.version, address: address.value, raw };
  const buf = raw.version === 0 ? undefined : flatten(raw.data);
  const payload = buf === undefined ? undefined : decodePayload(raw.eventType, buf);
  return payload === undefined
    ? { ...base, eventType: raw.eventType, payload: undefined, degraded: true }
    : ({ ...base, eventType: raw.eventType, payload, degraded: false } as DecodedEvent);
};

/**
 * Decode a batch of raw {@link LogEvent}s (e.g. `result.events`) into typed {@link ContractEvent}s.
 *
 * Like {@link decode}, this never throws — degraded events are preserved in place rather than
 * dropped, so the returned array is index-aligned with the input.
 *
 * @experimental Inherits {@link decode}'s experimental caveat: decoded payload offsets are derived,
 * not yet confirmed against a live `emit`.
 *
 * @param events The raw log events to decode.
 * @returns The decoded, typed events, in input order.
 *
 * @category decoding
 */
export const decodeAll = (events: readonly LogEvent[]): ContractEvent[] => events.map(decode);

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
