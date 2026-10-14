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
import * as CoinPublicKey from '@midnight-ntwrk/platform-js/effect/CoinPublicKey';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { Effect, Option } from 'effect';

import { asConfigProvider } from '../../src/effect/internal/options.js';

const COIN_PUBLIC = CoinPublicKey.Hex('0102');
// A valid signing key value is plain hex, exactly 32 bytes in length.
const SIGNING = SigningKey.Value('a1'.repeat(32));

const readKeys = (inputs: Parameters<typeof asConfigProvider>[0]): Configuration.Configuration.Keys =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Configuration.Keys;
    }).pipe(
      Effect.provide(Configuration.layer),
      Effect.withConfigProvider(asConfigProvider(inputs))
    )
  );

describe('asConfigProvider', () => {
  it('feeds the signing kind through to the assembled signing key', () => {
    const keys = readKeys({
      coinPublicKey: Option.some(COIN_PUBLIC),
      signingKey: Option.some(SIGNING),
      signingKind: Option.some('ecdsa')
    });

    expect(keys.getSigningKey()).toEqual(Option.some({ tag: 'ecdsa', value: SIGNING }));
  });

  it('leaves the signing kind to its default when the option is absent', () => {
    const keys = readKeys({
      coinPublicKey: Option.some(COIN_PUBLIC),
      signingKey: Option.some(SIGNING),
      signingKind: Option.none()
    });

    expect(keys.getSigningKey()).toEqual(Option.some({ tag: 'schnorr', value: SIGNING }));
  });
});
