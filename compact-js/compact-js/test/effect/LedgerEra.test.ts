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

import * as eraNeutralSurface from '../../src/effect/internal/eraNeutralSurface.js';

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
  // These two key-parity checks cannot distinguish the entries — `/v9` is the current era, so its
  // key set matches the root's by construction (and type-only exports are erased from
  // `Object.keys` entirely). What they prove is that the `exports` subpaths exist, are spelled
  // correctly, and resolve: a typo in the exports map is the regression they catch. Era pinning
  // and the capability split are asserted independently below.
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

describe('era capability split', () => {
  // Contract events are a ledger 9 feature: compact-runtime 0.16 has no `LogEvent`, no per-context
  // event accumulation, and onchain-runtime-v3's `log` payload is a bare `EncodedStateValue` with
  // no emitting-contract address. #388 requires such a member to be *absent* from an older era's
  // entry, not present and failing at run time — so the surface is split in two, and an era entry
  // composes only the levels its runtime line can support.
  const CONTRACT_EVENT_EXPORTS = [
    'ContractEventStore',
    'ContractEventValidationError',
    'ContractLog',
    // `ContractEventValidator` is star-exported rather than namespaced, so its member is named
    // directly here.
    'validateEvents'
  ];

  it('keeps contract events out of the era-neutral surface', () => {
    // The surface a ledger 8 entry would compose. If an event module leaks in here, that entry
    // stops being buildable at all (its runtime line has no `LogEvent`) — the failure mode this
    // split exists to prevent.
    const keys = Object.keys(eraNeutralSurface);
    for (const name of CONTRACT_EVENT_EXPORTS) {
      expect(keys).not.toContain(name);
    }
  });

  it('exposes contract events on the ledger 9 entry', () => {
    const keys = Object.keys(v9EffectEntry);
    for (const name of CONTRACT_EVENT_EXPORTS) {
      expect(keys).toContain(name);
    }
  });

  it('composes the ledger 9 entry from the era-neutral surface plus the event surface', () => {
    // Guards the split from drifting apart: every era-neutral export must still be reachable from
    // the era entry, so splitting the barrel cannot silently drop a member from the public API.
    const entryKeys = new Set(Object.keys(v9EffectEntry));
    for (const name of Object.keys(eraNeutralSurface)) {
      expect(entryKeys).toContain(name);
    }
  });
});
