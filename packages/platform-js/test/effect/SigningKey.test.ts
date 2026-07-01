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
import * as SigningKey from '@midnightntwrk/platform-js/effect/SigningKey';

// A valid signing key value is plain hex, 32 to 35 bytes in length.
const VALID_VALUE = 'a1'.repeat(32);

describe('SigningKey', () => {
  describe('Value', () => {
    it('accepts a valid plain hex value', () => {
      expect(() => SigningKey.Value(VALID_VALUE)).not.toThrow();
    });

    it.each([
      '',
      'not-hex',
      '0x' + VALID_VALUE, // prefixed hex is not a plain hex value
      'a1'.repeat(10), // too short (10 bytes)
      'a1'.repeat(40) // too long (40 bytes)
    ])('rejects an invalid value (%s)', (value) => {
      expect(() => SigningKey.Value(value)).toThrow();
    });
  });

  describe('make', () => {
    it('defaults the kind to schnorr when none is provided', () => {
      expect(SigningKey.make(VALID_VALUE)).toEqual({ tag: 'schnorr', value: VALID_VALUE });
    });

    it('uses the provided kind', () => {
      expect(SigningKey.make(VALID_VALUE, 'ecdsa')).toEqual({ tag: 'ecdsa', value: VALID_VALUE });
    });

    it('validates the value', () => {
      expect(() => SigningKey.make('not-hex')).toThrow();
    });
  });

  it('exposes the supported signature kinds', () => {
    expect(SigningKey.SignatureKinds).toEqual(['schnorr', 'ecdsa']);
  });

  it('defaults to the schnorr signature kind', () => {
    expect(SigningKey.DefaultSignatureKind).toBe('schnorr');
  });
});
