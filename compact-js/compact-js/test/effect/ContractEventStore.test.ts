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
import * as MalformedHexPrefixError from '@midnight-ntwrk/compact-js/effect/MalformedHexPrefixError';
import { ContractAddress } from '@midnight-ntwrk/platform-js';
import { Effect, Exit, Stream } from 'effect';

import * as Fixtures from './logEventFixtures.js';

const ADDR_A = '0a'.repeat(32);
const ADDR_B = '0b'.repeat(32);

/** Decode a fixture, optionally overriding its emitting contract address. */
const ev = (raw: ContractLog.LogEvent, address?: string): ContractLog.ContractEvent =>
  ContractLog.decode(address === undefined ? raw : { ...raw, address });

const run = <A, E>(effect: Effect.Effect<A, E, ContractEventStore.ContractEventStore>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(ContractEventStore.layer)));

describe('ContractEventStore.append', () => {
  it.effect('assigns monotonically increasing ids starting at 1', () =>
    Effect.gen(function* () {
      const store = yield* ContractEventStore.ContractEventStore;
      const stored = yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.misc]));
      expect(stored.map((e) => e.id)).toEqual([1n, 2n]);
    }).pipe(Effect.provide(ContractEventStore.layer))
  );

  it.effect('continues the id sequence across appends', () =>
    Effect.gen(function* () {
      const store = yield* ContractEventStore.ContractEventStore;
      yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
      const second = yield* store.append(ContractLog.decodeAll([Fixtures.misc, Fixtures.paused]));
      expect(second.map((e) => e.id)).toEqual([2n, 3n]);
    }).pipe(Effect.provide(ContractEventStore.layer))
  );
});

describe('ContractEventStore.query', () => {
  it('returns an empty array from an empty store', async () => {
    const events = await run(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        return yield* store.query();
      })
    );
    expect(events).toEqual([]);
  });

  it('returns all events, in ascending id order, with no filter', async () => {
    const events = await run(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append(ContractLog.decodeAll(Fixtures.allStandardEvents));
        return yield* store.query();
      })
    );
    expect(events).toHaveLength(Fixtures.allStandardEvents.length);
    expect(events.map((e) => e.id)).toEqual(events.map((_, i) => BigInt(i + 1)));
  });

  it('filters by contract address', async () => {
    const events = await run(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append([ev(Fixtures.shieldedSpend, ADDR_A), ev(Fixtures.misc, ADDR_B)]);
        return yield* store.query({ contractAddress: ContractAddress.ContractAddress(ADDR_A) });
      })
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe('shielded-spend');
  });

  it('filters by event type', async () => {
    const events = await run(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.misc, Fixtures.shieldedMint]));
        return yield* store.query({ eventType: 'misc' });
      })
    );
    expect(events.map((e) => e.eventType)).toEqual(['misc']);
  });

  it('filters by fromId (resume cursor)', async () => {
    const events = await run(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend, Fixtures.misc, Fixtures.paused]));
        return yield* store.query({ fromId: 2n });
      })
    );
    expect(events.map((e) => e.id)).toEqual([2n, 3n]);
  });

  describe('field-prefix filters', () => {
    it('matches when any indexed field starts with the prefix', async () => {
      const events = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend])); // nullifier = 0x11..
          return yield* store.query({ fieldPrefixes: [{ prefix: '1111' }] });
        })
      );
      expect(events).toHaveLength(1);
    });

    it('does not match when no indexed field starts with the prefix', async () => {
      const events = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
          return yield* store.query({ fieldPrefixes: [{ prefix: '9999' }] });
        })
      );
      expect(events).toEqual([]);
    });

    it('honors a leading 0x and is case-insensitive', async () => {
      const events = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
          return yield* store.query({ fieldPrefixes: [{ prefix: '0X11' }] });
        })
      );
      expect(events).toHaveLength(1);
    });

    it('matches an odd-length prefix against the high nibble of the first byte', async () => {
      // nullifier = 0x11.. — an odd-nibble prefix '1' matches any first byte 0x10–0x1f.
      const [hit, miss] = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
          return [
            yield* store.query({ fieldPrefixes: [{ prefix: '1' }] }),
            yield* store.query({ fieldPrefixes: [{ prefix: '2' }] })
          ] as const;
        })
      );
      expect(hit).toHaveLength(1);
      expect(miss).toEqual([]);
    });

    it('matches an odd-length prefix after a whole-byte prefix', async () => {
      // shielded-mint domainSep = 0x32.. — '11' matches the first byte, then odd nibble '3' must
      // match the high nibble (0x3_) of the next byte, while '4' must not.
      const [hit, miss] = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedMint])); // commitment 0x31.., domainSep 0x32..
          return [
            yield* store.query({ fieldPrefixes: [{ fieldName: 'domainSep', prefix: '323' }] }),
            yield* store.query({ fieldPrefixes: [{ fieldName: 'domainSep', prefix: '324' }] })
          ] as const;
        })
      );
      expect(hit).toHaveLength(1);
      expect(miss).toEqual([]);
    });

    it('scopes the prefix to a named field', async () => {
      const [named, wrongName] = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
          return [
            yield* store.query({ fieldPrefixes: [{ fieldName: 'nullifier', prefix: '11' }] }),
            yield* store.query({ fieldPrefixes: [{ fieldName: 'commitment', prefix: '11' }] })
          ] as const;
        })
      );
      expect(named).toHaveLength(1);
      expect(wrongName).toEqual([]);
    });

    it('fails fast with MalformedHexPrefixError on a non-hex prefix rather than matching nothing', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.shieldedSpend]));
          return yield* store.query({ fieldPrefixes: [{ prefix: 'xyz' }] });
        }).pipe(Effect.provide(ContractEventStore.layer))
      );
      expect(Exit.isFailure(exit)).toBe(true);
      const cause = Exit.isFailure(exit) ? exit.cause : undefined;
      const error = cause !== undefined && cause._tag === 'Fail' ? cause.error : undefined;
      expect(MalformedHexPrefixError.isMalformedHexPrefixError(error)).toBe(true);
      // The offending prefix is normalized (a leading 0x stripped) on the error.
      expect((error as MalformedHexPrefixError.MalformedHexPrefixError).prefix).toBe('xyz');
    });

    it('fails a non-hex prefix even after stripping a leading 0x', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          return yield* store.query({ fieldPrefixes: [{ prefix: '0xZZ' }] });
        }).pipe(Effect.provide(ContractEventStore.layer))
      );
      expect(Exit.isFailure(exit)).toBe(true);
    });

    it('fails the subscribe stream on a non-hex prefix', async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          return yield* Stream.runCollect(store.subscribe({ fieldPrefixes: [{ prefix: 'nothex' }] }));
        }).pipe(Effect.scoped, Effect.provide(ContractEventStore.layer))
      );
      expect(Exit.isFailure(exit)).toBe(true);
    });

    it('excludes misc, lifecycle, and degraded events from field filters', async () => {
      const events = await run(
        Effect.gen(function* () {
          const store = yield* ContractEventStore.ContractEventStore;
          yield* store.append(ContractLog.decodeAll([Fixtures.misc, Fixtures.paused, Fixtures.degradedNullData]));
          return yield* store.query({ fieldPrefixes: [{ prefix: '' }] }); // empty prefix matches any present field
        })
      );
      expect(events).toEqual([]);
    });
  });

  it('combines criteria with logical AND', async () => {
    const events = await run(
      Effect.gen(function* () {
        const store = yield* ContractEventStore.ContractEventStore;
        yield* store.append([ev(Fixtures.shieldedSpend, ADDR_A), ev(Fixtures.shieldedSpend, ADDR_B)]);
        return yield* store.query({
          contractAddress: ContractAddress.ContractAddress(ADDR_B),
          eventType: 'shielded-spend'
        });
      })
    );
    expect(events).toHaveLength(1);
    expect(String(events[0]!.address)).toBe(ADDR_B);
  });
});
