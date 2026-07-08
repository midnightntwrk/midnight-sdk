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
 * An in-process accumulator, and query surface, over the {@link ContractLog.ContractEvent}s
 * produced by locally executed circuits (MIP-0002 Part 2).
 *
 * @remarks
 * This is deliberately **indexer-agnostic**: the store is an in-memory accumulator over events
 * from local circuit execution, not a chain index. Its {@link ContractEventFilter} and monotonic
 * `id` cursor are shaped to align with the MIP's `ContractEventFilter` / `id` so a future
 * indexer-backed implementation (in `midnight-js`) can reuse the same types.
 *
 * Typical usage — decode a circuit result's raw events and append them, then query:
 *
 * @example
 * ```ts
 * import { ContractExecutable, ContractLog, ContractEventStore } from '@midnight-ntwrk/compact-js/effect';
 * import { Effect } from 'effect';
 *
 * const program = Effect.gen(function* () {
 *   const store = yield* ContractEventStore.ContractEventStore;
 *   const result = yield* contract.circuit(circuitId, ctx, ...args);
 *   yield* store.append(ContractLog.decodeAll(result.events));
 *   return yield* store.query({ eventType: 'unshielded-mint' });
 * }).pipe(Effect.provide(ContractEventStore.layer));
 * ```
 *
 * @packageDocumentation
 */
import type * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { Context, Effect, Layer, PubSub, Ref, Stream } from 'effect';

import * as ContractLog from './ContractLog.js';

/**
 * A {@link ContractLog.ContractEvent} accumulated in a {@link ContractEventStore}, tagged with the
 * monotonic `id` assigned on append (mirroring the indexer's `BIGSERIAL` cursor). The emitting
 * contract's `address` is carried on the event itself.
 *
 * @category model
 */
export type StoredEvent = ContractLog.ContractEvent & { readonly id: bigint };

/**
 * Matches a single indexed field's byte value against a hex `prefix`. When `fieldName` is omitted,
 * the prefix matches if **any** of the event's indexed fields starts with it.
 *
 * @category model
 */
export interface FieldPrefixFilter {
  readonly fieldName?: string;
  /**
   * A hex string (with or without a leading `0x`), matched case-insensitively as a prefix of the
   * field's bytes. Matching is nibble-granular: use an **even-length** prefix for byte-accurate
   * matching (e.g. `'07'` matches only the byte `0x07`), since an odd-length prefix such as `'7'`
   * matches any field whose first byte is `0x70`–`0x7f`. An empty prefix matches any present field.
   */
  readonly prefix: string;
}

/**
 * A filter over accumulated events, aligned with the MIP-0002 `ContractEventFilter` shape. All
 * present criteria must match (logical AND). Events whose type indexes nothing (e.g. `misc`,
 * lifecycle) and degraded events never match a {@link FieldPrefixFilter}.
 *
 * @category model
 */
export interface ContractEventFilter {
  /** Restrict to events emitted by this contract. */
  readonly contractAddress?: ContractAddress.ContractAddress;
  /** Restrict to a single event type. */
  readonly eventType?: ContractLog.LogEventType;
  /** Restrict to events whose indexed fields match every given prefix. */
  readonly fieldPrefixes?: readonly FieldPrefixFilter[];
  /** Resume cursor — include only events with `id >= fromId`. */
  readonly fromId?: bigint;
}

/**
 * Provides an in-process store, query surface, and subscription feed for contract log events.
 *
 * @category services
 */
export class ContractEventStore extends Context.Tag('compact-js/ContractEventStore')<
  ContractEventStore,
  ContractEventStore.Service
>() {}

export declare namespace ContractEventStore {
  /**
   * Provides an in-process store, query surface, and subscription feed for contract log events.
   */
  export interface Service {
    /**
     * Appends events to the store, assigning each a monotonic `id`, and returns them as
     * {@link StoredEvent}s in append order.
     *
     * @param events The decoded events to append (e.g. `ContractLog.decodeAll(result.events)`).
     * @returns An `Effect` yielding the stored events, each tagged with its assigned `id`.
     */
    readonly append: (events: readonly ContractLog.ContractEvent[]) => Effect.Effect<readonly StoredEvent[]>;

    /**
     * Returns the accumulated events matching `filter`, in ascending `id` order.
     *
     * @param filter The criteria to match; when omitted, all events are returned.
     * @returns An `Effect` yielding the matching events.
     */
    readonly query: (filter?: ContractEventFilter) => Effect.Effect<readonly StoredEvent[]>;

    /**
     * Subscribes to a live, filtered, resumable feed of events in ascending `id` order.
     *
     * The stream first **replays** matching history (from `filter.fromId`, if given), then **tails**
     * newly appended events — with no gap or duplicate at the boundary. The same `filter` is applied
     * to both phases. The subscription is scope-managed: it is torn down automatically when the
     * enclosing `Scope` closes.
     *
     * To resume after a disconnect, pass **`lastSeenId + 1n`** as `filter.fromId`: the cursor is
     * **inclusive** (`id >= fromId`), so passing the last-seen id itself would redeliver that event.
     *
     * Under sustained backpressure the live feed may drop the oldest un-consumed events (see
     * {@link makeLayer}). There is **no programmatic drop signal** — a filter-induced `id` skip and
     * a drop-induced one are indistinguishable on the stream — so a subscriber that must not miss
     * events should periodically reconcile via `query`, and after falling behind reconnect with an
     * updated `fromId` to backfill the missed events from the retained history.
     *
     * @param filter The criteria to match; when omitted, every event is delivered.
     * @returns A `Stream` of matching events.
     */
    readonly subscribe: (filter?: ContractEventFilter) => Stream.Stream<StoredEvent>;
  }
}

// --- filter matching --------------------------------------------------------------------------

const normalizeHex = (hex: string): string => hex.toLowerCase().replace(/^0x/, '');

const HEX_DIGITS = '0123456789abcdef';

/**
 * Tests whether `bytes` begins with the (already-normalized, lowercase) hex `prefix`, comparing
 * only the bytes the prefix actually covers rather than rendering the whole field to hex. Each
 * pair of hex chars matches one whole byte; a trailing odd nibble matches the **high** nibble of
 * the next byte — so `'7'` matches any field whose first byte is `0x70`–`0x7f`, whereas `'07'`
 * matches only the byte `0x07`. Pass an **even-length** prefix for byte-accurate matching. An
 * empty prefix matches any field. A prefix longer (in nibbles) than the field is never a match.
 */
const bytesHaveHexPrefix = (bytes: Uint8Array, prefix: string): boolean => {
  if ((prefix.length + 1) >> 1 > bytes.length) return false;
  const fullBytes = prefix.length >> 1;
  for (let i = 0; i < fullBytes; i++) {
    const hi = HEX_DIGITS.indexOf(prefix[i * 2]);
    const lo = HEX_DIGITS.indexOf(prefix[i * 2 + 1]);
    if (bytes[i] !== ((hi << 4) | lo)) return false;
  }
  if ((prefix.length & 1) === 1 && bytes[fullBytes] >> 4 !== HEX_DIGITS.indexOf(prefix[prefix.length - 1]))
    return false;
  return true;
};

const sameAddress = (a: ContractAddress.ContractAddress, b: ContractAddress.ContractAddress): boolean =>
  String(a).toLowerCase() === String(b).toLowerCase();

const matchesFieldPrefix = (event: StoredEvent, filter: FieldPrefixFilter): boolean => {
  const fields = ContractLog.indexedFields(event);
  const prefix = normalizeHex(filter.prefix);
  const candidates =
    filter.fieldName !== undefined
      ? fields[filter.fieldName] !== undefined
        ? [fields[filter.fieldName]!]
        : []
      : Object.values(fields);
  return candidates.some((bytes) => bytesHaveHexPrefix(bytes, prefix));
};

/** Determine whether a stored event satisfies every present criterion of a filter. */
export const matches = (event: StoredEvent, filter?: ContractEventFilter): boolean => {
  if (filter === undefined) return true;
  if (filter.contractAddress !== undefined && !sameAddress(event.address, filter.contractAddress)) return false;
  if (filter.eventType !== undefined && event.eventType !== filter.eventType) return false;
  if (filter.fromId !== undefined && event.id < filter.fromId) return false;
  if (filter.fieldPrefixes !== undefined && !filter.fieldPrefixes.every((f) => matchesFieldPrefix(event, f)))
    return false;
  return true;
};

// --- in-memory layer --------------------------------------------------------------------------

interface StoreState {
  readonly nextId: bigint;
  readonly events: readonly StoredEvent[];
}

/** Default `PubSub` capacity for the live subscription feed. */
export const DEFAULT_CAPACITY = 1024;

/**
 * Builds an in-memory {@link ContractEventStore} layer backed by a `Ref` (full history) and a
 * **sliding** `PubSub` (live feed). Events accumulate for the lifetime of the provided scope; ids
 * are monotonic starting at `1`.
 *
 * @remarks
 * The live feed uses a **sliding** buffer rather than a back-pressuring one, and this is a
 * deliberate liveness choice: `append` publishes to the feed while holding the append lock, so a
 * back-pressuring buffer would let a single slow or non-draining subscriber fill the buffer, wedge
 * the suspended publish under the lock, and block **every** subsequent append — including those
 * driven by circuit execution — indefinitely. A sliding buffer never suspends the publisher, so
 * appends can never be wedged by a stalled consumer. The trade-off is that a subscriber that cannot
 * keep up loses the **oldest** un-consumed live events once more than `capacity` accumulate (a gap
 * in its live tail). Because the full history is always retained in the backing `Ref`, such a
 * subscriber can recover any missed events by re-`query`-ing or resubscribing with a `fromId`
 * cursor.
 *
 * @param capacity The live-feed buffer size; once more than this many events are buffered for a
 * subscriber, the oldest are dropped for that subscriber. Defaults to {@link DEFAULT_CAPACITY}.
 *
 * @category layers
 */
export const makeLayer = (capacity: number = DEFAULT_CAPACITY): Layer.Layer<ContractEventStore> =>
  Layer.effect(
    ContractEventStore,
    Effect.gen(function* () {
      const state = yield* Ref.make<StoreState>({ nextId: 1n, events: [] });
      // Sliding, not back-pressuring: see `makeLayer`'s @remarks — because `publishAll` runs under
      // `appendMutex`, a bounded buffer would let one stalled subscriber wedge every append.
      const pubsub = yield* PubSub.sliding<StoredEvent>(capacity);
      // Serialize appends: id assignment (`Ref.modify`) and publishing to the live feed are two
      // effects, so without a critical section two concurrent appends could publish out of id
      // order (e.g. assign 1, assign 2, publish 2, publish 1). The mutex makes each append's
      // assign-then-publish atomic, honoring the ascending-`id` guarantee of `subscribe`.
      const appendMutex = yield* Effect.makeSemaphore(1);

      const append: ContractEventStore.Service['append'] = (events) =>
        appendMutex.withPermits(1)(
          Effect.gen(function* () {
            const stored = yield* Ref.modify(state, (current) => {
              const assigned: StoredEvent[] = events.map((event, i) => ({ ...event, id: current.nextId + BigInt(i) }));
              return [
                assigned,
                { nextId: current.nextId + BigInt(events.length), events: [...current.events, ...assigned] }
              ];
            });
            yield* PubSub.publishAll(pubsub, stored);
            return stored;
          })
        );

      const query: ContractEventStore.Service['query'] = (filter) =>
        Ref.get(state).pipe(Effect.map((current) => current.events.filter((event) => matches(event, filter))));

      const subscribe: ContractEventStore.Service['subscribe'] = (filter) =>
        Stream.unwrapScoped(
          Effect.gen(function* () {
            // Subscribe to the live feed BEFORE snapshotting history, so no event appended during
            // set-up can slip through the gap between the two.
            const subscription = yield* PubSub.subscribe(pubsub);
            const snapshot = yield* Ref.get(state);
            // Everything with id <= snapshotMaxId is in the replayed snapshot; live events (which
            // have strictly greater, monotonic ids) are tailed from the PubSub. This id boundary is
            // what prevents a duplicate for an event that is in both the snapshot and the queue.
            const snapshotMaxId =
              snapshot.events.length > 0 ? snapshot.events[snapshot.events.length - 1]!.id : 0n;
            const history = snapshot.events.filter((event) => matches(event, filter));
            const live = Stream.fromQueue(subscription).pipe(
              Stream.filter((event) => event.id > snapshotMaxId && matches(event, filter))
            );
            return Stream.concat(Stream.fromIterable(history), live);
          })
        );

      return { append, query, subscribe };
    })
  );

/**
 * An in-memory {@link ContractEventStore} layer with the default live-feed capacity
 * ({@link DEFAULT_CAPACITY}). See {@link makeLayer} to configure the capacity.
 *
 * @category layers
 */
export const layer: Layer.Layer<ContractEventStore> = makeLayer();
