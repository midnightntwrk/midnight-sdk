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

import { type ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import type * as v9EffectEntry from '@midnight-ntwrk/compact-js/v9/effect';
import type { SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import type {
  ContractOperation as LedgerContractOperation,
  SigningKey as LedgerSigningKey,
  SingleUpdate as LedgerSingleUpdate,
  Transcript as LedgerTranscript
} from '@midnightntwrk/ledger-v9';
import type { Effect } from 'effect';
import { describe, expect, it } from 'tstyche';

/**
 * Type-level coverage for the ledger era seam. `LedgerEra.test.ts` checks the facade at run time
 * via `Object.keys`, which erases every type-only export — so the facade's type surface (the `Era`
 * descriptor, the type-only ledger re-exports, and each conversion's error channel) is only
 * pinned here.
 */
describe('Ledger facade type surface', () => {
  it('re-exports the Era descriptor type', () => {
    // `toBe`, not `toBeAssignableFrom`: assignability ignores excess properties, so the source
    // below would stay assignable even if `Era.runtime` were deleted outright or widened to
    // `string`. The assertion would read like coverage while being unable to fail.
    expect<Ledger.Era>().type.toBe<{
      readonly ledger: 9;
      readonly runtime: '0.19';
      readonly supportsCmaSignatureKind: (kind: SignatureKind) => boolean;
      readonly cmaSignatureKindsDescription: string;
      readonly defaultCmaSignatureKind: SignatureKind;
    }>();
  });

  it('fixes the runtime line from the ledger major rather than declaring the two independently', () => {
    // `Era` is the union of per-major descriptors and `runtime` is an `EraPairing` lookup on the
    // major, so a binding cannot declare ledger 9 alongside another era's line. Today the union is
    // a singleton and this holds by accident; it is the shape that keeps holding once it is not.
    expect<Ledger.Era['runtime']>().type.toBe<'0.19'>();
  });

  it('exposes the bound era major as a literal, not a widened number', () => {
    // `as const satisfies Era` in the binding keeps this a literal, so downstream code can branch
    // on the era at compile time and a typo'd era fails the build rather than a test.
    expect(Ledger.era.ledger).type.toBe<9>();
  });

  it('exposes the paired compact-runtime line as a literal too', () => {
    // Same reason as the era major above: the pairing is a compile-time fact, so a binding that
    // declares a line with no corresponding runtime binding fails the build.
    expect(Ledger.era.runtime).type.toBe<'0.19'>();
  });

  it('re-exports ledger type-only names as the ledger package\'s own types', () => {
    // Invisible to the run-time key-parity checks: a binding that drops one of these, or that
    // substitutes a structurally similar stand-in, surfaces only here.
    expect<Ledger.ContractOperation>().type.toBe<LedgerContractOperation>();
    expect<Ledger.SigningKey>().type.toBe<LedgerSigningKey>();
    expect<Ledger.SingleUpdate>().type.toBe<LedgerSingleUpdate>();
    expect<Ledger.Transcript<string>>().type.toBe<LedgerTranscript<string>>();
  });

  it('types every byte-level conversion as failing with ContractRuntimeError', () => {
    // The uniform error channel is what lets callers `catchAll`/`mapError` one error type across
    // the seam; an unwrapped conversion would surface as a defect instead.
    expect(Ledger.contractStateFromBytes(new Uint8Array())).type.toBe<
      Effect.Effect<Ledger.ContractState, ContractRuntimeError.ContractRuntimeError>
    >();
    expect(Ledger.parametersFromBytes(new Uint8Array())).type.toBe<
      Effect.Effect<Ledger.LedgerParameters, ContractRuntimeError.ContractRuntimeError>
    >();
  });

  it('constructs era-versioned values without exposing the version literal as a parameter', () => {
    // The era binding owns the literal: these take no version argument, so era-neutral code
    // cannot pass a stale one.
    expect(Ledger.makeContractOperationVersion).type.toBe<() => Ledger.ContractOperationVersion>();
    expect(Ledger.makeVersionedVerifierKey).type.toBe<
      (verifierKey: Uint8Array) => Ledger.ContractOperationVersionedVerifierKey
    >();
  });
});

describe('era-pinned entry type surface', () => {
  it('`/v9/effect` exposes ledger 9\'s own types', () => {
    // Anchored on the ledger-v9 package rather than on the unsuffixed entry: `/v9/effect`
    // re-exports that entry, so comparing the two is a tautology. This goes red once `/v9/effect`
    // resolves a different era's types.
    expect<typeof v9EffectEntry.Ledger.era.ledger>().type.toBe<9>();
    expect<v9EffectEntry.Ledger.ContractOperation>().type.toBe<LedgerContractOperation>();
  });
});
