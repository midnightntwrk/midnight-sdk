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

import { CompactRuntime, Ledger } from '@midnight-ntwrk/compact-js/effect';
import { ContractState, encodeZswapLocalState } from '@midnight-ntwrk/compact-runtime';
import { describe, expect, it } from 'vitest';

describe('compact-runtime seam', () => {
  it('names the runtime line it binds', () => {
    expect(CompactRuntime.line).toBe('0.19');
  });

  it('binds the seam to the compact-runtime package', () => {
    // Identity, not shape: the seam's classes must BE compact-runtime's, or `instanceof` checks
    // and WASM-side branding break for consumers that mix seam and direct-runtime values. This is
    // the same guarantee `LedgerEra.test.ts` makes for the ledger seam.
    expect(CompactRuntime.ContractState).toBe(ContractState);
    expect(CompactRuntime.encodeZswapLocalState).toBe(encodeZswapLocalState);
  });
});

describe('era pairing', () => {
  it('pairs the bound ledger era with the bound runtime line', () => {
    // The ledger era and the compact-runtime line move together (ledger 9 ↔ runtime 0.19 ↔
    // onchain-runtime-v4). The two seams are bound in separate `current.ts` files, so nothing in
    // the type system stops one being repointed without the other; this is the check that catches
    // a half-completed era swap.
    expect(Ledger.era.runtime).toBe(CompactRuntime.line);
  });
});
