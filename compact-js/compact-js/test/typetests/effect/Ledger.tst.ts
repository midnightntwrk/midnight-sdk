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

import { type CompactRuntime, type ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import type * as v8EffectEntry from '@midnight-ntwrk/compact-js/v8/effect';
import type * as v9EffectEntry from '@midnight-ntwrk/compact-js/v9/effect';
import type { SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import type {
  ContractAction as LedgerV8ContractAction,
  DustActions as LedgerV8DustActions,
  PreBinding as LedgerV8PreBinding,
  PreProof as LedgerV8PreProof,
  Proof as LedgerV8Proof,
  ProvingKeyMaterial as LedgerV8ProvingKeyMaterial,
  ProvingProvider as LedgerV8ProvingProvider,
  SignatureEnabled as LedgerV8SignatureEnabled,
  Transaction as LedgerV8Transaction,
  UnprovenIntent as LedgerV8UnprovenIntent,
  UnprovenOffer as LedgerV8UnprovenOffer,
  UnprovenTransaction as LedgerV8UnprovenTransaction,
  UnshieldedOffer as LedgerV8UnshieldedOffer
} from '@midnightntwrk/ledger-v8';
import type {
  ContractAction as LedgerV9ContractAction,
  ContractOperation as LedgerContractOperation,
  DustActions as LedgerV9DustActions,
  PreBinding as LedgerV9PreBinding,
  PreProof as LedgerV9PreProof,
  Proof as LedgerV9Proof,
  ProvingKeyMaterial as LedgerV9ProvingKeyMaterial,
  ProvingProvider as LedgerV9ProvingProvider,
  SignatureEnabled as LedgerV9SignatureEnabled,
  SigningKey as LedgerSigningKey,
  SingleUpdate as LedgerSingleUpdate,
  Transaction as LedgerV9Transaction,
  Transcript as LedgerTranscript,
  UnprovenIntent as LedgerV9UnprovenIntent,
  UnprovenOffer as LedgerV9UnprovenOffer,
  UnprovenTransaction as LedgerV9UnprovenTransaction,
  UnshieldedOffer as LedgerV9UnshieldedOffer
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
    //
    // `Era` is the union over every *bound* major, not the era this build speaks — that is
    // `typeof Ledger.era`, pinned in `LedgerEra.test.ts`. Each arm pairs its own runtime line.
    expect<Ledger.Era>().type.toBe<
      | {
          readonly ledger: 8;
          readonly runtime: '0.16';
          readonly supportsCmaSignatureKind: (kind: SignatureKind) => boolean;
          readonly cmaSignatureKindsDescription: string;
          readonly defaultCmaSignatureKind: SignatureKind;
        }
      | {
          readonly ledger: 9;
          readonly runtime: '0.20';
          readonly supportsCmaSignatureKind: (kind: SignatureKind) => boolean;
          readonly cmaSignatureKindsDescription: string;
          readonly defaultCmaSignatureKind: SignatureKind;
        }
    >();
  });

  it('fixes the runtime line from the ledger major rather than declaring the two independently', () => {
    // `Era` is the union of per-major descriptors and `runtime` is an `EraPairing` lookup on the
    // major, so a binding cannot declare ledger 9 alongside another era's line. With two eras bound
    // the union is no longer a singleton, which is what makes the negative case below able to fail.
    expect<Ledger.Era['runtime']>().type.toBe<'0.16' | '0.20'>();
  });

  it('rejects a descriptor pairing a ledger major with another era\'s runtime line', () => {
    // The negative case the NOTE below deferred until a second era existed. Both lines used here
    // are valid `RuntimeLine`s — they are simply the wrong one for the stated major — so this can
    // only pass because `Era` is the union of per-major descriptors. Flatten `Era` to
    // `{ ledger: LedgerMajor; runtime: RuntimeLine }` and both assertions go green, which is the
    // "simplification" this test exists to block.
    expect<{
      readonly ledger: 9;
      readonly runtime: '0.16';
      readonly supportsCmaSignatureKind: (kind: SignatureKind) => boolean;
      readonly cmaSignatureKindsDescription: string;
      readonly defaultCmaSignatureKind: SignatureKind;
    }>().type.not.toBeAssignableTo<Ledger.Era>();

    expect<{
      readonly ledger: 8;
      readonly runtime: '0.20';
      readonly supportsCmaSignatureKind: (kind: SignatureKind) => boolean;
      readonly cmaSignatureKindsDescription: string;
      readonly defaultCmaSignatureKind: SignatureKind;
    }>().type.not.toBeAssignableTo<Ledger.Era>();
  });

  // HISTORY: this used to carry a NOTE saying a negative pairing test was a trap, because with a
  // single bound era `RuntimeLine` was the singleton `'0.19'` and every "wrong" line was also not
  // a `RuntimeLine` — so the test passed whether `Era` was the union of per-major descriptors or a
  // flat `{ ledger: LedgerMajor; runtime: RuntimeLine }`, catching nothing. Ledger 8 landing is the
  // event that NOTE said to wait for, and the negative case above is now live.
  //
  // `Ledger.ts`'s `_SeamsArePaired` assertion remains the guard for a different thing: that the two
  // *bound* `current.ts` files agree. That is a build error rather than a test, and neither check
  // subsumes the other.

  it('exposes the bound era major as a literal, not a widened number', () => {
    // `as const satisfies Era` in the binding keeps this a literal, so downstream code can branch
    // on the era at compile time and a typo'd era fails the build rather than a test.
    expect(Ledger.era.ledger).type.toBe<9>();
  });

  it('exposes the paired compact-runtime line as a literal too', () => {
    // Same reason as the era major above: the pairing is a compile-time fact, so a binding that
    // declares a line with no corresponding runtime binding fails the build.
    expect(Ledger.era.runtime).type.toBe<'0.20'>();
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

describe('conversion parameter types', () => {
  // These conversions cross the runtime↔ledger boundary in one direction each, and passing the
  // handle for the other direction is the mistake they exist to prevent. Before the conversions
  // became an era factory, each parameter named its own runtime type and a swap was a compile
  // error. Typing them structurally — `Serializable`, i.e. `{ serialize(): Uint8Array }` — made
  // every ledger and runtime handle interchangeable, because they all serialize, so the mistake
  // now fails inside WASM instead of at the call site.
  //
  // Asserted as *negatives* rather than by pinning each signature: the parameter types are derived
  // from the binding by indexed access, so spelling them out here would restate the derivation
  // rather than check it.
  it('rejects a maintenance authority where a contract state belongs', () => {
    expect(Ledger.fromRuntimeContractState).type.not.toBeCallableWith(
      {} as CompactRuntime.ContractMaintenanceAuthority
    );
  });

  it('rejects a contract state where a maintenance authority belongs', () => {
    expect(Ledger.fromRuntimeMaintenanceAuthority).type.not.toBeCallableWith({} as CompactRuntime.ContractState);
  });

  it('rejects a maintenance authority on the ledger→runtime direction', () => {
    expect(Ledger.toRuntimeContractState).type.not.toBeCallableWith({} as CompactRuntime.ContractMaintenanceAuthority);
  });

  it('keeps `fromPlatformSigningKey`\'s contract state typed', () => {
    // Regressed to `unknown` plus an `as never` cast at the call into `ContractConfigurationError`,
    // which types the error's `contractState` field as a `ContractState` while it holds whatever
    // the caller passed.
    expect(Ledger.fromPlatformSigningKey).type.not.toBeCallableWith(
      {} as Parameters<typeof Ledger.fromPlatformSigningKey>[0],
      'not a contract state'
    );
  });

  it('still accepts the correct handles', () => {
    expect(Ledger.fromRuntimeContractState).type.toBeCallableWith({} as CompactRuntime.ContractState);
    expect(Ledger.fromRuntimeMaintenanceAuthority).type.toBeCallableWith(
      {} as CompactRuntime.ContractMaintenanceAuthority
    );
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

  // Without these a consumer can call the transaction constructors but cannot name what they take
  // or return, so it imports the era package around the seam anyway — which is midnight-sdk#401.
  it('`/v9/effect` names ledger 9\'s unproven transaction parts', () => {
    expect<v9EffectEntry.Ledger.UnprovenTransaction>().type.toBe<LedgerV9UnprovenTransaction>();
    expect<v9EffectEntry.Ledger.UnprovenOffer>().type.toBe<LedgerV9UnprovenOffer>();
    expect<v9EffectEntry.Ledger.UnprovenIntent>().type.toBe<LedgerV9UnprovenIntent>();
  });

  it('`/v8/effect` names ledger 8\'s unproven transaction parts', () => {
    expect<v8EffectEntry.Ledger.UnprovenTransaction>().type.toBe<LedgerV8UnprovenTransaction>();
    expect<v8EffectEntry.Ledger.UnprovenOffer>().type.toBe<LedgerV8UnprovenOffer>();
    expect<v8EffectEntry.Ledger.UnprovenIntent>().type.toBe<LedgerV8UnprovenIntent>();
  });

  // `Transaction.deserialize` already returns `Transaction<Signaturish, Proofish, Bindingish>`, so
  // those leak into the public surface named or not; exporting them makes the result usable.
  it('`/v9/effect` names what `prove` takes and returns', () => {
    expect<v9EffectEntry.Ledger.ProvingProvider>().type.toBe<LedgerV9ProvingProvider>();
    expect<Awaited<ReturnType<v9EffectEntry.Ledger.UnprovenTransaction['prove']>>>().type.toBe<
      LedgerV9Transaction<LedgerV9SignatureEnabled, LedgerV9Proof, LedgerV9PreBinding>
    >();
    expect<v9EffectEntry.Ledger.ContractAction<v9EffectEntry.Ledger.PreProof>>().type.toBe<
      LedgerV9ContractAction<LedgerV9PreProof>
    >();
  });

  it('`/v8/effect` names what `prove` takes and returns', () => {
    expect<v8EffectEntry.Ledger.ProvingProvider>().type.toBe<LedgerV8ProvingProvider>();
    expect<Awaited<ReturnType<v8EffectEntry.Ledger.UnprovenTransaction['prove']>>>().type.toBe<
      LedgerV8Transaction<LedgerV8SignatureEnabled, LedgerV8Proof, LedgerV8PreBinding>
    >();
    expect<v8EffectEntry.Ledger.ContractAction<v8EffectEntry.Ledger.PreProof>>().type.toBe<
      LedgerV8ContractAction<LedgerV8PreProof>
    >();
  });

  // What a consumer needs to implement a `ProvingProvider` and fund an intent without reaching for
  // the era package. `DustActions` and `UnshieldedOffer` are values, not just types: fetching those
  // classes from the consumer's own resolution is the second instantiation that makes
  // `Intent.dustActions` discard in silence.
  it('`/v9/effect` names the proving-key material and funding classes', () => {
    expect<v9EffectEntry.Ledger.ProvingKeyMaterial>().type.toBe<LedgerV9ProvingKeyMaterial>();
    expect<typeof v9EffectEntry.Ledger.DustActions>().type.toBe<typeof LedgerV9DustActions>();
    expect<typeof v9EffectEntry.Ledger.UnshieldedOffer>().type.toBe<typeof LedgerV9UnshieldedOffer>();
  });

  it('`/v8/effect` names the proving-key material and funding classes', () => {
    expect<v8EffectEntry.Ledger.ProvingKeyMaterial>().type.toBe<LedgerV8ProvingKeyMaterial>();
    expect<typeof v8EffectEntry.Ledger.DustActions>().type.toBe<typeof LedgerV8DustActions>();
    expect<typeof v8EffectEntry.Ledger.UnshieldedOffer>().type.toBe<typeof LedgerV8UnshieldedOffer>();
  });

  // Upstream gives each marker a private `type_`, so cross-era mixing is a compile error and the
  // runtime silent-drop in `LedgerDualInstantiation.test.ts` is reachable only by casting.
  it('keeps the two eras\' proof markers nominally distinct', () => {
    expect<LedgerV8Proof>().type.not.toBeAssignableTo<LedgerV9Proof>();
    expect<LedgerV8UnprovenIntent>().type.not.toBeAssignableTo<LedgerV9UnprovenIntent>();
  });
});
