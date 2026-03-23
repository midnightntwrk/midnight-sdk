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
import * as NetworkId from '@midnight-ntwrk/platform-js/effect/NetworkId';
import * as fc from 'effect/FastCheck';

import * as Arbitrary from './Arbitrary.js';

describe('NetworkId', () => {
  describe('isMainNet', () => {
    it('should return true for MainNet', () => {
      expect(NetworkId.MainNet.isMainNet()).toBe(true);
    });

    it('should return false for any named network identifier', () => fc.assert(
      fc.property(Arbitrary.makeNetworkIdArbitrary(), (networkId) => {
        expect(NetworkId.make(networkId).isMainNet()).toBe(false);
      })
    ));
  });

  describe('make', () => {
    it('should preserve MainNet identity when wrapping an existing NetworkId', () => {
      const wrapped = NetworkId.make(NetworkId.MainNet);
      expect(wrapped.isMainNet()).toBe(true);
    });

    it('should preserve the moniker when wrapping an existing named NetworkId', () => {
      const original = NetworkId.make('hosky-dev01');
      const wrapped = NetworkId.make(original);
      expect(NetworkId.equals(original, wrapped)).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for two network identifiers equal by name', () => {
      const a = NetworkId.make('hosky-dev01');
      const b = NetworkId.make('hosky-dev01');

      expect(NetworkId.equals(a, b)).toBe(true);
    });

    it('should return false for two network identifiers that differ by name', () => {
      const a = NetworkId.make('hosky-dev01');
      const b = NetworkId.make('hosky-dev02');

      expect(NetworkId.equals(a, b)).toBe(false);
    });

    it('should return true for MainNet compared to another MainNet', () => {
      expect(NetworkId.equals(NetworkId.MainNet, NetworkId.make(NetworkId.MainNet))).toBe(true);
    });

    it('should return false when comparing MainNet with a named network', () => {
      expect(NetworkId.equals(NetworkId.MainNet, NetworkId.make('preview'))).toBe(false);
    });
  });

  describe('isNetworkId', () => {
    it('should return true for a NetworkId instance', () => {
      expect(NetworkId.isNetworkId(NetworkId.MainNet)).toBe(true);
      expect(NetworkId.isNetworkId(NetworkId.make('test-preview'))).toBe(true);
    });

    it('should return false for non-NetworkId values', () => {
      expect(NetworkId.isNetworkId(null)).toBe(false);
      expect(NetworkId.isNetworkId('main')).toBe(false);
      expect(NetworkId.isNetworkId(42)).toBe(false);
      expect(NetworkId.isNetworkId({})).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the moniker string for a named network', () => {
      expect(NetworkId.make('hosky-dev01').toString()).toBe('hosky-dev01');
    });

    it('should return the MainNet moniker string for MainNet', () => {
      expect(NetworkId.MainNet.toString()).toBe('main');
    });
  });

  describe('toJSON', () => {
    it('should include the moniker in the JSON representation', () => {
      expect(NetworkId.make('hosky-dev01').toJSON()).toMatchObject({ _id: 'NetworkId', moniker: 'hosky-dev01' });
    });

    it('should include the MainNet moniker in the JSON representation for MainNet', () => {
      expect(NetworkId.MainNet.toJSON()).toMatchObject({ _id: 'NetworkId', moniker: 'main' });
    });
  });
});