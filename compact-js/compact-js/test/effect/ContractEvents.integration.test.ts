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
import { ContractEventStore, ContractLog } from '@midnight-ntwrk/compact-js/effect';
import { Chunk, Effect, Fiber, Stream } from 'effect';

import * as Fixtures from './logEventFixtures.js';

/**
 * End-to-end pipeline exercising the public consumer path documented in the README: raw circuit
 * events → `ContractLog.decodeAll` → `ContractEventStore.append` → `query` + `subscribe`.
 *
 * @remarks This uses the derived fixtures rather than a live circuit: the bundled compactc 0.31.0
 * emits no `log` ops (see the provenance note in `logEventFixtures.ts`), so a real
 * `contract.circuit(...)` call yields `events: []`. The pipeline over decoded events is identical.
 */
describe('contract events integration', () => {
  it.effect('decodes raw events, accumulates them, and observes them via query and subscribe', () =>
    Effect.gen(function* () {
      const store = yield* ContractEventStore.ContractEventStore;

      // A "circuit result" of raw log events (mixed standard + a degraded one).
      const rawEvents = [Fixtures.unshieldedMint, Fixtures.shieldedSpend, Fixtures.degradedNullData];

      // Start a live subscriber for mints before appending.
      const mintFeed = yield* store
        .subscribe({ eventType: 'unshielded-mint' })
        .pipe(Stream.take(1), Stream.runCollect, Effect.fork);

      // Decode + append the whole batch (degraded events are preserved, not dropped).
      const stored = yield* store.append(ContractLog.decodeAll(rawEvents));
      expect(stored.map((e) => e.id)).toEqual([1n, 2n, 3n]);

      // Query by type.
      const mints = yield* store.query({ eventType: 'unshielded-mint' });
      expect(mints).toHaveLength(1);
      expect(mints[0]!.degraded).toBe(false);

      // Query by an indexed-field hex prefix (unshielded-mint indexes domainSep = 0x71..).
      const byPrefix = yield* store.query({ fieldPrefixes: [{ fieldName: 'domainSep', prefix: '71' }] });
      expect(byPrefix.map((e) => e.id)).toEqual([1n]);

      // The degraded event is stored and queryable, but never crashes decoding.
      const all = yield* store.query();
      expect(all).toHaveLength(3);
      expect(all.filter((e) => e.degraded)).toHaveLength(1);

      // The live subscriber observed the mint.
      const feed = yield* Fiber.join(mintFeed);
      expect(Chunk.toReadonlyArray(feed).map((e) => e.eventType)).toEqual(['unshielded-mint']);
    }).pipe(Effect.provide(ContractEventStore.layer))
  );
});
