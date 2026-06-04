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

import { describe, expect,it } from '@effect/vitest';
import * as Hex from '@midnight-ntwrk/platform-js/effect/Hex';
import * as ParseError from '@midnight-ntwrk/platform-js/effect/ParseError';
import { Effect } from 'effect';
import * as fc from 'effect/FastCheck';

import * as Arbitrary from './Arbitrary.js';

describe('Hex', () => {
  describe('parseHex', () => {
    it('should parse plain hex-encodings', () => fc.assert(
      fc.asyncProperty(Arbitrary.makePlainHexArbitrary('2..=10'), (hex) => Effect.gen(function* () {
        const result = yield* Hex.parseHex(hex);
        expect(result.hasPrefix).toBe(false);
        expect(result.byteChars).toEqual(hex);
        expect(result.incompleteChars.length).toBe(0);
      }).pipe(Effect.runPromise))
    ));

    it('should parse prefixed hex-encodings', () => fc.assert(
      fc.asyncProperty(Arbitrary.makePrefixedHexArbitrary('2..=10'), (hex) => Effect.gen(function* () {
        const result = yield* Hex.parseHex(hex);
        expect(result.hasPrefix).toBe(true);
        expect(result.byteChars).toEqual(hex.substring(2));
        expect(result.incompleteChars.length).toBe(0);
      }).pipe(Effect.runPromise))
    ));

    it.effect('should throw with an invalid hex-encoding', () => Effect.gen(function* () {
      const error = yield* Effect.flip(Hex.parseHex('HOSKYA'));
      expect(ParseError.isParseError(error)).toBeTruthy();
      expect(error).toMatchObject({
        message: 'Invalid hex-digit \'H\' found in source string at index 0'
      });
    }));

    it.effect('should report the invalid character position when valid hex precedes it in incompleteChars', () => Effect.gen(function* () {
      // "0xaG": prefix="0x", byteChars="" (pair "aG" is not valid), incompleteChars="aG"
      // The invalid char is 'G' at index 3, not 'a' at index 2.
      const error = yield* Effect.flip(Hex.parseHex('0xaG'));
      expect(ParseError.isParseError(error)).toBeTruthy();
      expect(error).toMatchObject({
        message: 'Invalid hex-digit \'G\' found in source string at index 3'
      });
    }));

    it.effect('should report invalid character instead of incomplete byte when trailing char is not hex', () => Effect.gen(function* () {
      // "abX": byteChars="ab", incompleteChars="X"
      // The trailing 'X' is not a hex digit — should not say "last byte is incomplete".
      const error = yield* Effect.flip(Hex.parseHex('abX'));
      expect(ParseError.isParseError(error)).toBeTruthy();
      expect(error).toMatchObject({
        message: 'Invalid hex-digit \'X\' found in source string at index 2'
      });
    }));

    it.effect('should report incomplete byte when trailing char is a valid hex digit', () => Effect.gen(function* () {
      // "abc": byteChars="ab", incompleteChars="c" — 'c' is valid hex, so the byte is incomplete
      const error = yield* Effect.flip(Hex.parseHex('abc'));
      expect(ParseError.isParseError(error)).toBeTruthy();
      expect(error).toMatchObject({
        message: 'Last byte of source string \'abc\' is incomplete'
      });
    }));
  });

  describe('PlainHex', () => {
    it('should parse plain hex-encodings', () => fc.assert(
      fc.property(Arbitrary.makePlainHexArbitrary('2..=10'), (hex) => {
        expect(() => Hex.PlainHex(hex)).not.toThrowError();
      })
    ));

    it('should throw with prefixed hex-encodings', () => fc.assert(
      fc.property(Arbitrary.makePrefixedHexArbitrary('2..=10'), (hex) => {
        expect(() => Hex.PlainHex(hex)).toThrowError();
      })
    ));
  });

  describe('PrefixedHex', () => {
    it('should parse prefixed hex-encodings', () => fc.assert(
      fc.property(Arbitrary.makePrefixedHexArbitrary('2..=10'), (hex) => {
        expect(() => Hex.PrefixedHex(hex)).not.toThrowError();
      })
    ));

    it('should throw with plain hex-encodings', () => fc.assert(
      fc.property(Arbitrary.makePlainHexArbitrary('2..=10'), (hex) => {
        expect(() => Hex.PrefixedHex(hex)).toThrowError();
      })
    ));
  });
});
