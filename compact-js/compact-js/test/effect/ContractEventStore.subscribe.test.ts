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
import * as ContractEventStore from '@midnight-ntwrk/compact-js/effect/ContractEventStore';
import * as ContractLog from '@midnight-ntwrk/compact-js/effect/ContractLog';
import { Chunk, Effect, Fiber, Stream } from 'effect';

import * as Fixtures from './logEventFixtures.js';

const provide = <A, E>(effect: Effect.Effect<A, E, ContractEventStore.ContractEventStore>) =>
  effect.pipe(Effect.provide(ContractEventStore.layer));

const ids = (chunk: Chunk.Chunk<ContractEventStore.StoredEvent>): bigint[] =>
  Chunk.toReadonlyArray(chunk).map((e) => e.id);

describe('ContractEventStore.subscribe', () => {
  it.effect('delivers live events appended after subscription', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        const collector = yield* store.subscribe().pipe(Stream.take(2), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
        yield* store.append(ContractLog.decodeAll([Fixtures.misc]));
        const collected = yield* Fiber.join(collector);
        expect(ids(collected)).toEqual([1n, 2n]);
      })
    )
  );

  it.effect('replays history then tails live from fromId with no gap or duplicate', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.misc, Fixtures.paused])); // 1,2,3
        const collector = yield* store.subscribe({ fromId: 2n }).pipe(Stream.take(3), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedMint])); // 4
        const collected = yield* Fiber.join(collector);
        expect(ids(collected)).toEqual([2n, 3n, 4n]);
      })
    )
  );

  it.effect('applies the filter to both replayed and live events', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        const collector = yield* store
          .subscribe({ eventType: 'misc' })
          .pipe(Stream.take(1), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend])); // id 1, filtered out
        yield* store.append(ContractLog.decodeAll([Fixtures.misc])); // id 2, matches
        const collected = yield* Fiber.join(collector);
        expect(ids(collected)).toEqual([2n]);
        expect(Chunk.toReadonlyArray(collected)[0]!.eventType).toBe('misc');
      })
    )
  );

  it.effect('delivers to multiple independent subscribers', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        const a = yield* store.subscribe().pipe(Stream.take(1), Stream.runCollect, Effect.fork);
        const b = yield* store.subscribe().pipe(Stream.take(1), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
        expect(ids(yield* Fiber.join(a))).toEqual([1n]);
        expect(ids(yield* Fiber.join(b))).toEqual([1n]);
      })
    )
  );

  it.effect('resumes from a last-seen id after a disconnect (fromId = lastSeenId + 1)', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.misc])); // 1,2 (seen)
        // Correct resume: pass lastSeenId + 1 (= 3). The cursor is inclusive, so this excludes the
        // last-seen event (2) and history has nothing >= 3 — only the new live event arrives.
        const collector = yield* store.subscribe({ fromId: 3n }).pipe(Stream.take(1), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.paused])); // 3
        expect(ids(yield* Fiber.join(collector))).toEqual([3n]);
      })
    )
  );

  it.effect('fromId is inclusive — passing the last-seen id redelivers it (resume off-by-one guard)', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.misc])); // 1,2 (seen)
        // Passing the last-seen id (2) as fromId re-includes event 2 from history — this documents
        // why resume guidance is lastSeenId + 1, not lastSeenId.
        const collector = yield* store.subscribe({ fromId: 2n }).pipe(Stream.take(2), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.paused])); // 3
        expect(ids(yield* Fiber.join(collector))).toEqual([2n, 3n]);
      })
    )
  );

  it.effect('delivers live events in ascending id order under concurrent appends', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        const n = 25;
        const collector = yield* store.subscribe().pipe(Stream.take(n), Stream.runCollect, Effect.fork);
        // Fire n single-event appends concurrently; the append mutex must still deliver in id order.
        yield* Effect.all(
          Array.from({ length: n }, () => store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]))),
          { concurrency: 'unbounded' }
        );
        const observed = ids(yield* Fiber.join(collector));
        expect(observed).toEqual(Array.from({ length: n }, (_, i) => BigInt(i + 1)));
      })
    )
  );

  it.effect('cleans up on scope close without wedging the store', () =>
    provide(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        // A subscriber that never completes (takes far more than we append), then is interrupted.
        const abandoned = yield* store.subscribe().pipe(Stream.take(100), Stream.runCollect, Effect.fork);
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
        yield* Fiber.interrupt(abandoned);
        // The store still accepts appends and serves queries after the subscriber is gone.
        yield* store.append(ContractLog.decodeAll([Fixtures.misc]));
        const all = yield* store.query();
        expect(all.map((e) => e.id)).toEqual([1n, 2n]);
      })
    )
  );
});
