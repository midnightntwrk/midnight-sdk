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

import { CompactRuntime, ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import { ContractState, encodeZswapLocalState, versionString } from '@midnight-ntwrk/compact-runtime';
import { Cause, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';

describe('compact-runtime seam', () => {
  it('names the runtime line it binds', () => {
    expect(CompactRuntime.line).toBe('0.19');
  });

  it('names the runtime line of the installed compact-runtime package', () => {
    // `line` is a repo-authored literal, so on its own the era-pairing check below compares two
    // constants that a dependency bump moves neither of. Anchoring `line` to the installed
    // package's own `versionString` grounds the whole chain: a bump to 0.20.x fails here until
    // the runtime binding (and its ledger pair) are swapped together.
    expect(versionString.startsWith(`${CompactRuntime.line}.`)).toBe(true);
  });

  it('binds the seam to the compact-runtime package', () => {
    // Identity, not shape: the seam's classes must BE compact-runtime's, or `instanceof` checks
    // and WASM-side branding break for consumers that mix seam and direct-runtime values. This is
    // the same guarantee `LedgerEra.test.ts` makes for the ledger seam.
    expect(CompactRuntime.ContractState).toBe(ContractState);
    expect(CompactRuntime.encodeZswapLocalState).toBe(encodeZswapLocalState);
  });
});

describe('CompactRuntime.tryRuntime', () => {
  it('yields the runtime call\'s result when it succeeds', () => {
    expect(Effect.runSync(CompactRuntime.tryRuntime('Unused', () => 42))).toBe(42);
  });

  it('converts a runtime rejection into a typed failure rather than a defect', () => {
    // The seam's whole point at the call sites: compact-runtime signals rejection by throwing, and
    // a throw evaluated in an `Effect.gen` body is a defect. A defect escapes the caller's declared
    // error channel — and under the CLI's `disableErrorReporting` it prints nothing at all — so
    // `Cause.failureOption` being `Some` is the assertion that matters here, not merely failing.
    const exit = Effect.runSyncExit(
      Effect.gen(function* () {
        return yield* CompactRuntime.tryRuntime('Failed to decode the zswap local state', () => {
          throw new Error('expected instance of ZswapLocalState');
        });
      })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
    expect(ContractRuntimeError.isRuntimeError(failure)).toBe(true);
    expect((failure as ContractRuntimeError.ContractRuntimeError).message).toBe(
      'Failed to decode the zswap local state'
    );
  });

  it('shares its boundary handling with the ledger seam\'s tryConvert', () => {
    // One copy of the boundary handling across both seams: the two facades name it differently
    // because each documents its own package's failure mode, but a fix to one must reach the other.
    expect(CompactRuntime.tryRuntime).toBe(Ledger.tryConvert);
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
