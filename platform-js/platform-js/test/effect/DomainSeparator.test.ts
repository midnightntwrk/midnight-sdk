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
import * as DomainSeparator from '@midnight-ntwrk/platform-js/effect/DomainSeparator';
import * as fc from 'effect/FastCheck';

import * as Arbitrary from './Arbitrary.js';

describe('DomainSeparator', () => {
  it('should accept exactly 32-byte plain hex strings', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('32..=32'), (hex) => {
      expect(() => DomainSeparator.DomainSeparator(hex)).not.toThrowError();
    })
  ));

  it('should reject plain hex strings shorter than 32 bytes', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('2..32'), (hex) => {
      expect(() => DomainSeparator.DomainSeparator(hex)).toThrowError();
    })
  ));

  it('should reject plain hex strings longer than 32 bytes', () => fc.assert(
    fc.property(Arbitrary.makePlainHexArbitrary('33..=50'), (hex) => {
      expect(() => DomainSeparator.DomainSeparator(hex)).toThrowError();
    })
  ));

  it('should reject prefixed hex strings', () => fc.assert(
    fc.property(Arbitrary.makePrefixedHexArbitrary('32..=32'), (hex) => {
      expect(() => DomainSeparator.DomainSeparator(hex)).toThrowError();
    })
  ));

  it('should reject non-hex strings', () => {
    expect(() => DomainSeparator.DomainSeparator('not-a-hex-string')).toThrowError();
  });

  describe('asBytes', () => {
    it('should return a Uint8Array of exactly 32 bytes', () => fc.assert(
      fc.property(Arbitrary.makePlainHexArbitrary('32..=32'), (hex) => {
        const separator = DomainSeparator.DomainSeparator(hex);
        const bytes = DomainSeparator.asBytes(separator);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBe(32);
      })
    ));

    it('should round-trip through hex encoding', () => fc.assert(
      fc.property(Arbitrary.makePlainHexArbitrary('32..=32'), (hex) => {
        const separator = DomainSeparator.DomainSeparator(hex);
        const bytes = DomainSeparator.asBytes(separator);
        expect(Buffer.from(bytes).toString('hex')).toBe(hex.toLowerCase());
      })
    ));
  });
});
