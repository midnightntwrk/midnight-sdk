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
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

const COIN_PUBLIC = '0102';
// A valid signing key value is plain hex, 32 to 35 bytes in length.
const SIGNING = 'a1'.repeat(32);

const readKeys = (json: unknown): Configuration.Configuration.Keys =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Configuration.Keys;
    }).pipe(
      Effect.provide(Configuration.layer),
      Effect.withConfigProvider(Configuration.configProvider(json))
    )
  );

const readNetwork = (json: unknown) =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Configuration.Network;
    }).pipe(
      Effect.provide(Configuration.layer),
      Effect.withConfigProvider(Configuration.configProvider(json))
    )
  );

describe('Configuration', () => {
  describe('Keys', () => {
    it('reads the configured coin public key', () => {
      const keys = readKeys({ keys: { coinPublic: COIN_PUBLIC } });
      expect(keys.coinPublicKey).toBe(COIN_PUBLIC);
    });

    it('assembles a signing key using the configured signing kind', () => {
      const keys = readKeys({
        keys: { coinPublic: COIN_PUBLIC, signing: SIGNING, signingKind: 'ecdsa' }
      });
      expect(keys.getSigningKey()).toEqual(Option.some({ tag: 'ecdsa', value: SIGNING }));
    });

    it('defaults the signing kind to schnorr when it is absent', () => {
      const keys = readKeys({ keys: { coinPublic: COIN_PUBLIC, signing: SIGNING } });
      expect(keys.getSigningKey()).toEqual(Option.some({ tag: 'schnorr', value: SIGNING }));
    });

    it('returns None when no signing key is configured', () => {
      const keys = readKeys({ keys: { coinPublic: COIN_PUBLIC } });
      expect(keys.getSigningKey()).toEqual(Option.none());
    });

    it('fails for an unrecognized signing kind', () => {
      expect(() =>
        readKeys({ keys: { coinPublic: COIN_PUBLIC, signing: SIGNING, signingKind: 'rsa' } })
      ).toThrow();
    });
  });

  describe('Network', () => {
    it('reads the configured network', () => {
      const network = readNetwork({ keys: { coinPublic: COIN_PUBLIC }, network: 'testnet' });
      expect(network.isMainNet()).toBe(false);
    });

    it('defaults to MainNet when no network is configured', () => {
      const network = readNetwork({ keys: { coinPublic: COIN_PUBLIC } });
      expect(network.isMainNet()).toBe(true);
    });
  });
});
