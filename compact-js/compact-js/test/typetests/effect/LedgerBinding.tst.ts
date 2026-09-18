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

import type { SigningKey as PlatformSigningKey } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { describe, expect, it } from 'tstyche';

import type { LedgerBinding, LedgerBindingViolations } from '../../../src/effect/internal/ledger/binding.js';
import type * as V8 from '../../../src/effect/internal/ledger/v8.js';
import type * as V9 from '../../../src/effect/internal/ledger/v9.js';

/**
 * Type-level coverage for the ledger binding **contract** itself.
 *
 * @remarks
 * `LedgerBinding` used to type every member `unknown`, which made conformance a presence check:
 * a binding could re-export a name whose signature had drifted across eras and still satisfy the
 * contract, with the breakage surfacing far downstream at a call site. These tests pin the two
 * properties that fix must have — the real bindings pass, and a binding with a *drifted signature*
 * (not a missing name) is rejected — so the contract cannot silently regress to presence-only.
 *
 * Each `Drifted<...>` fake below deliberately still satisfies `LedgerBinding`; it is the
 * *relational* check that must catch it.
 */

/** Replaces one member of the ledger 9 binding, keeping every other member intact. */
type Drifted<K extends keyof typeof V9, T> = Omit<typeof V9, K> & Readonly<Record<K, T>>;

type LedgerContractState = InstanceType<typeof V9.ContractState>;
// `StateValue` has a private constructor, so its instance type is only reachable through a static.
type LedgerStateValue = ReturnType<typeof V9.StateValue.decode>;

describe('LedgerBinding — real bindings', () => {
  it('reports no violations for the ledger 9 binding', () => {
    expect<LedgerBindingViolations<typeof V9>>().type.toBe<never>();
  });

  it('reports no violations for the ledger 8 binding', () => {
    // v8 is an unbound spike, so nothing else in the build would catch drift in it. This is the
    // check that lets the binding be developed against the contract before it is switched on.
    expect<LedgerBindingViolations<typeof V8>>().type.toBe<never>();
  });
});

describe('LedgerBinding — presence', () => {
  it('rejects a binding that is missing a member', () => {
    expect<Omit<typeof V9, 'partitionTranscripts'>>().type.not.toBeAssignableTo<LedgerBinding>();
  });

  it('rejects a binding whose era descriptor is absent', () => {
    expect<Omit<typeof V9, 'era'>>().type.not.toBeAssignableTo<LedgerBinding>();
  });
});

describe('LedgerBinding — signature drift', () => {
  it('rejects a state codec whose deserialize returns a foreign type', () => {
    // The exact shape of the bug the `unknown`-typed contract could not see: the name is present
    // and it is still a static method taking bytes, but it no longer round-trips to the era's
    // own `ContractState`, so `Ledger.contractStateFromBytes` would mistype its result.
    type Fake = Drifted<
      'ContractState',
      {
        new (): LedgerContractState;
        deserialize(raw: Uint8Array): LedgerStateValue;
      }
    >;

    expect<Fake>().type.toBeAssignableTo<LedgerBinding>();
    expect<LedgerBindingViolations<Fake>>().type.not.toBe<never>();
  });

  it('rejects a maintenance-authority codec whose deserialize returns a foreign type', () => {
    // Not hypothetical: `@midnightntwrk/ledger-v8@8.1.2` declares exactly this
    // (`deserialize(raw): ContractState`), while the WASM really returns a
    // `ContractMaintenanceAuthority`. `v8.ts` narrows it back; this test is why that narrowing
    // cannot be quietly dropped.
    type Fake = Drifted<
      'ContractMaintenanceAuthority',
      {
        new (committee: readonly string[], threshold: number, counter?: bigint): { readonly threshold: number };
        deserialize(raw: Uint8Array): LedgerContractState;
      }
    >;

    expect<Fake>().type.toBeAssignableTo<LedgerBinding>();
    expect<LedgerBindingViolations<Fake>>().type.not.toBe<never>();
  });

  it('rejects a binding whose signData does not accept the era signing key', () => {
    // The era-variant signature that reaches the public API: v8 signs with a bare hex string and
    // v9 with `{ tag, value }`. A binding that pairs one era's `makeSigningKey` with the other's
    // `signData` type-checks member by member and fails only in relation.
    type Fake = Drifted<'signData', (key: { readonly nonsense: true }, data: Uint8Array) => string>;

    expect<Fake>().type.toBeAssignableTo<LedgerBinding>();
    expect<LedgerBindingViolations<Fake>>().type.not.toBe<never>();
  });

  it('rejects a binding whose verifier-key constructor disagrees with VerifierKeyInsert', () => {
    // `version: string` rather than the era's `'v3' | 'v4'` literal union: presence is satisfied
    // (the contract asks only for a `string`), so this is caught purely by the relation against
    // `VerifierKeyInsert`'s constructor. A binding that lost the operation-version literal — the
    // one value the binding is supposed to own — drifts exactly this way.
    type Fake = Drifted<
      'makeVersionedVerifierKey',
      (verifierKey: Uint8Array) => { readonly version: string; readonly rawVk: Uint8Array }
    >;

    expect<Fake>().type.toBeAssignableTo<LedgerBinding>();
    expect<LedgerBindingViolations<Fake>>().type.not.toBe<never>();
  });
});

describe('LedgerBinding — era signing-key shape', () => {
  it('has the ledger 9 binding produce a tagged signing key', () => {
    expect<ReturnType<typeof V9.makeSigningKey>>().type.toBe<V9.SigningKey>();
    expect<V9.SigningKey>().type.toBeAssignableTo<{ readonly tag: string; readonly value: string }>();
  });

  it('has the ledger 8 binding produce a bare hex signing key', () => {
    // The difference `Era` could not express before: v8 has no tagged-key concept at all, so the
    // adaptation has to live in the binding rather than in the era-neutral facade.
    expect<ReturnType<typeof V8.makeSigningKey>>().type.toBe<V8.SigningKey>();
    expect<V8.SigningKey>().type.toBe<string>();
  });

  it('accepts a platform signing key on both eras', () => {
    // Asserted on the parameter type rather than with `toBeCallableWith`, because both bindings
    // are imported `import type`: importing them as values here would load two ledger WASM
    // modules into one process, the very thing `LedgerEra.test.ts` exists to prevent.
    expect<Parameters<typeof V9.makeSigningKey>[0]>().type.toBe<PlatformSigningKey>();
    expect<Parameters<typeof V8.makeSigningKey>[0]>().type.toBe<PlatformSigningKey>();
  });
});
