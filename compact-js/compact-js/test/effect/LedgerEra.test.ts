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

import * as rootEntry from '@midnight-ntwrk/compact-js';
import * as effectEntry from '@midnight-ntwrk/compact-js/effect';
import { Ledger } from '@midnight-ntwrk/compact-js/effect';
import * as v9Entry from '@midnight-ntwrk/compact-js/v9';
import * as v9EffectEntry from '@midnight-ntwrk/compact-js/v9/effect';
import { ContractState, LedgerParameters } from '@midnightntwrk/ledger-v9';
import { describe, expect, it } from 'vitest';

describe('Ledger era seam', () => {
  it('describes the ledger 9 era', () => {
    expect(Ledger.era.ledger).toBe(9);
    expect(Ledger.era.supportsCmaSignatureKind('schnorr')).toBe(true);
    expect(Ledger.era.supportsCmaSignatureKind('ecdsa')).toBe(true);
    expect(Ledger.era.defaultCmaSignatureKind).toBe('schnorr');
    expect(Ledger.era.cmaSignatureKindsDescription).toBe('schnorr, ecdsa');
  });

  it('binds the seam to the ledger 9 package', () => {
    // Identity, not shape: the seam's classes must BE ledger-v9's, or `instanceof` checks and
    // WASM-side branding break for consumers that mix seam and direct-ledger values.
    expect(Ledger.ContractState).toBe(ContractState);
    expect(Ledger.LedgerParameters).toBe(LedgerParameters);
  });

  it('constructs era-versioned values without leaking the version literal', () => {
    expect(Ledger.makeContractOperationVersion().version).toBe('v3');
  });
});

describe('era-pinned entries', () => {
  // The two key-parity checks below cannot distinguish the entries: `/v9` currently IS the root
  // module re-exported, so the key sets match by construction (and type-only exports are erased
  // from `Object.keys` entirely). What they do prove is that the new `exports` subpaths exist,
  // are spelled correctly, and resolve — a typo in the exports map is the regression they catch.
  // Era pinning itself is asserted independently in the last test.
  it('`/v9` exposes the same API as the unsuffixed root', () => {
    expect(Object.keys(v9Entry).sort()).toEqual(Object.keys(rootEntry).sort());
  });

  it('`/v9/effect` exposes the same API as `/effect`', () => {
    expect(Object.keys(v9EffectEntry).sort()).toEqual(Object.keys(effectEntry).sort());
  });

  it('`/v9/effect` resolves the ledger 9 package', () => {
    // Anchored on the ledger-v9 package itself, not on the unsuffixed entry (which `/v9/effect`
    // re-exports, making any comparison against it a tautology) and not on the literal `9` (whose
    // obvious repair, when red, is to edit the number). This goes red the day `current.ts` is
    // repointed at another era while `/v9` still claims era 9 — the regression this entry exists
    // to catch.
    expect((v9EffectEntry as typeof effectEntry).Ledger.ContractState).toBe(ContractState);
    expect((v9EffectEntry as typeof effectEntry).Ledger.LedgerParameters).toBe(LedgerParameters);
  });
});
