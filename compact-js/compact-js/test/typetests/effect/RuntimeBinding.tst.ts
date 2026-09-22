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

import { describe, expect, it } from 'tstyche';

import type {
  CallTreeRuntimeBinding,
  RuntimeBinding,
  RuntimeBindingViolations
} from '../../../src/effect/internal/runtime/binding.js';
import type * as V0_16 from '../../../src/effect/internal/runtime/v0_16.js';
import type * as V0_19 from '../../../src/effect/internal/runtime/v0_19.js';

/**
 * Type-level coverage for the compact-runtime binding **contract**.
 *
 * @remarks
 * The runtime seam carries a harder problem than the ledger seam. All eleven value names the old
 * `unknown`-typed contract listed exist on compact-runtime 0.16 *and* 0.19, so a 0.16 binding
 * satisfied it completely — while `CircuitContext`, `createCircuitContext` and `CircuitResults` all
 * changed shape between the two, and `CallProofData`, `LogEvent`, `ContractStateProvider` and
 * `crossContractCall` do not exist on 0.16 at all. Presence-only conformance would have gone green
 * on a binding that breaks every consumer.
 *
 * So the contract is split, and these tests pin the split:
 *
 * - {@link RuntimeBinding} is the era-neutral core — the members whose signatures really are
 *   identical on both lines.
 * - {@link CallTreeRuntimeBinding} is the 0.19+ capability: the call-tree execution model, contract
 *   events, and cross-contract calls. Ledger 8's runtime cannot satisfy it, and the test below
 *   asserts that it does not, which is what keeps those features off the older era's entry.
 */

/** Replaces one member of the 0.19 binding, keeping every other member intact. */
type Drifted<K extends keyof typeof V0_19, T> = Omit<typeof V0_19, K> & Readonly<Record<K, T>>;

describe('RuntimeBinding — real bindings', () => {
  it('reports no violations for the compact-runtime 0.19 binding', () => {
    expect<RuntimeBindingViolations<typeof V0_19>>().type.toBe<never>();
  });

  it('reports no violations for the compact-runtime 0.16 binding', () => {
    expect<RuntimeBindingViolations<typeof V0_16>>().type.toBe<never>();
  });

  it('has both bindings satisfy the era-neutral core', () => {
    expect<typeof V0_19>().type.toBeAssignableTo<RuntimeBinding>();
    expect<typeof V0_16>().type.toBeAssignableTo<RuntimeBinding>();
  });

  it('deserializes a maintenance authority to a maintenance authority on both lines', () => {
    // onchain-runtime-v3 declares `ContractMaintenanceAuthority.deserialize(raw): ContractState` —
    // wrong, the same way `@midnightntwrk/ledger-v8@8.1.2` was. Verified against the shipped WASM:
    // the returned value's constructor is `ContractMaintenanceAuthority` and it fails
    // `instanceof ContractState`. Unrepaired it reaches the published surface, because
    // `makeConversions` derives `fromRuntimeMaintenanceAuthority`'s *parameter* from this return
    // type: `/v8/effect` then advertises a function that rejects the authority it is meant to take
    // and accepts a contract state it will fail on inside WASM.
    expect<ReturnType<(typeof V0_16)['ContractMaintenanceAuthority']['deserialize']>>().type.toBe<
      V0_16.ContractMaintenanceAuthority
    >();
    expect<ReturnType<(typeof V0_19)['ContractMaintenanceAuthority']['deserialize']>>().type.toBe<
      V0_19.ContractMaintenanceAuthority
    >();
  });
});

describe('CallTreeRuntimeBinding — the ledger 9+ capability', () => {
  it('is satisfied by compact-runtime 0.19', () => {
    expect<typeof V0_19>().type.toBeAssignableTo<CallTreeRuntimeBinding>();
  });

  it('is NOT satisfied by compact-runtime 0.16', () => {
    // The gate that keeps contract events and cross-contract calls off ledger 8. 0.16 has no
    // `LogEvent`, no `ContractStateProvider`, no `crossContractCall`, and a flat single-contract
    // `CircuitContext` with no `callProofDataTrace` or `events`. Anything that needs those must
    // require this capability, so it is absent from an older era's entry rather than present and
    // failing at run time (midnight-sdk#388).
    expect<typeof V0_16>().type.not.toBeAssignableTo<CallTreeRuntimeBinding>();
  });

  it('separates the two eras on the circuit context shape, not on a version check', () => {
    // The three members that make the 0.19 context a call *tree* instead of a single frame, and
    // that `ContractExecutable` walks. Asserted on each line's own `CircuitContext` so the
    // difference is visible as a type fact rather than only as a failed capability check.
    expect<V0_19.CircuitContext<unknown>>().type.toBeAssignableTo<{
      readonly callProofDataTrace: readonly unknown[];
      readonly events: readonly unknown[];
    }>();
    expect<V0_16.CircuitContext<unknown>>().type.not.toBeAssignableTo<{
      readonly callProofDataTrace: readonly unknown[];
    }>();
  });
});

describe('RuntimeBinding — signature drift', () => {
  it('rejects a state codec whose deserialize returns a foreign type', () => {
    type Fake = Drifted<
      'ContractState',
      {
        new (): { serialize(): Uint8Array };
        deserialize(raw: Uint8Array): { readonly notAContractState: true };
      }
    >;

    expect<Fake>().type.toBeAssignableTo<RuntimeBinding>();
    expect<RuntimeBindingViolations<Fake>>().type.not.toBe<never>();
  });

  it('rejects a binding whose zswap codecs do not round-trip', () => {
    // `encodeZswapLocalState`'s output is fed straight back to `decodeZswapLocalState` when a
    // circuit context is rebuilt between calls; a drift here silently corrupts coin tracking.
    type Fake = Drifted<'decodeZswapLocalState', (encoded: { readonly unrelated: true }) => unknown>;

    expect<Fake>().type.toBeAssignableTo<RuntimeBinding>();
    expect<RuntimeBindingViolations<Fake>>().type.not.toBe<never>();
  });

  it('rejects a binding whose sampled signing key is not accepted by signatureVerifyingKey', () => {
    type Fake = Drifted<'makeSampleSigningKey', (kind: 'schnorr' | 'ecdsa') => { readonly value: string }>;

    expect<Fake>().type.toBeAssignableTo<RuntimeBinding>();
    expect<RuntimeBindingViolations<Fake>>().type.not.toBe<never>();
  });
});

describe('RuntimeBinding — era-varying signing key', () => {
  it('reads a hex value on both eras despite the native shapes differing', () => {
    // onchain-runtime-v3 types `SigningKey` as a bare hex `string`; v4 tags it (`{ tag, value }`)
    // and `sampleSigningKey` gained a `kind` parameter. The keys themselves stay native — they
    // have to remain assignable to each line's own `signatureVerifyingKey` — so `signingKeyHex` is
    // where the difference is absorbed, letting `ContractExecutable` read hex era-neutrally.
    expect<ReturnType<typeof V0_19.signingKeyHex>>().type.toBe<string>();
    expect<ReturnType<typeof V0_16.signingKeyHex>>().type.toBe<string>();
  });

  it('keeps each era\'s sampled key in its own native representation', () => {
    // Deliberately different: normalising these to one shape is what broke the first draft, by
    // making the key unassignable to the line's native `signatureVerifyingKey`.
    expect<ReturnType<typeof V0_16.makeSampleSigningKey>>().type.toBe<string>();
    expect<ReturnType<typeof V0_19.makeSampleSigningKey>>().type.toBeAssignableTo<{
      readonly tag: string;
      readonly value: string;
    }>();
  });

  it('names the runtime line each binding targets as a literal', () => {
    expect<typeof V0_19.line>().type.toBe<'0.19'>();
    expect<typeof V0_16.line>().type.toBe<'0.16'>();
  });
});
