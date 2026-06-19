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
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import * as fc from 'effect/FastCheck';

import * as Arbitrary from './Arbitrary.js';

describe('SigningKey', () => {
  it('should accept 32-byte plain hex strings (raw BIP-340 key)', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('32..=32'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).not.toThrowError();
    })
  ));

  it('should accept 33-byte plain hex strings (key with 1-byte version prefix)', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('33..=33'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).not.toThrowError();
    })
  ));

  it('should accept 34-byte plain hex strings (key with 2-byte version prefix)', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('34..=34'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).not.toThrowError();
    })
  ));

  it('should accept 35-byte plain hex strings (key with 3-byte version prefix)', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('35..=35'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).not.toThrowError();
    })
  ));

  it('should reject plain hex strings shorter than 32 bytes', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('2..32'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).toThrowError();
    })
  ));

  it('should reject plain hex strings longer than 35 bytes', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('36..=50'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).toThrowError();
    })
  ));

  it('should reject prefixed hex strings', () => fc.assert(
    fc.property(Arbitrary.makePrefixedHexArbitrary('32..=35'), (hex) => {
      expect(() => SigningKey.SigningKey(hex)).toThrowError();
    })
  ));

  it('should reject non-hex strings', () => {
    expect(() => SigningKey.SigningKey('not-a-valid-signing-key')).toThrowError();
  });
});
