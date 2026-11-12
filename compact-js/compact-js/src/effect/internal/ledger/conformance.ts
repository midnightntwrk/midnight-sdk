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

/**
 * Compile-time conformance for **every** ledger era binding, whether or not `current.ts` names it.
 *
 * @remarks
 * `current.ts` only asserts the binding it re-exports,. Listing each
 * binding here means the build checks all of them on every run, which is what lets a new era be
 * developed against the contract before anything points at it.
 *
 * Three things are checked per binding, because no one of them is sufficient:
 *
 * 1. **Presence** — `typeof M extends LedgerBinding`: every name the facade re-exports exists and
 *    is callable/constructible with the right arity.
 * 2. **Relationships** — `LedgerBindingViolations<typeof M>` is `never`: the member pairs compact-js
 *    composes still fit together. This is the stage that catches *signature* drift, which presence
 *    alone cannot see.
 * 3. **Type-only exports** — named explicitly below, because `typeof M` erases them entirely and
 *    no interface can constrain them.
 *
 * `import type` only: this module is erased entirely, so adding a binding here costs no bundle size
 * and cannot instantiate a second ledger WASM (the property `LedgerEra.test.ts` guards).
 *
 * Add one block per binding. There is deliberately no runtime export.
 *
 * @internal
 */
import { type LedgerBinding, type LedgerBindingViolations } from './binding.js';
import type * as V8 from './v8.js';
import type * as V9 from './v9.js';

// Routed through a constrained generic because a bare `A extends B ? true : never` conditional
// resolves silently and never fails a build.
type Extends<A, B> = [A] extends [B] ? true : false;
type Assert<_T extends true> = void;

// `never` is the only inhabitant of `never`, so a binding with violations instantiates this with a
// union of message literals and fails the build quoting the relationship that broke.
type AssertNoViolations<_V extends never> = void;

// --- ledger 8 (bound by the `/v8` entry) --------------------------------------------------------
type _V8Conforms = Assert<Extends<typeof V8, LedgerBinding>>;
type _V8NoViolations = AssertNoViolations<LedgerBindingViolations<typeof V8>>;
// Ledger 8 keys are BIP-340 only, so the era represents a signing key as a bare hex string. Pinned
// here so a binding that quietly adopts v9's tagged shape (or drops the distinction) fails the
// build rather than mis-signing a maintenance update.
type _V8SigningKeyIsBareHex = Assert<Extends<V8.SigningKey, string>>;
type _V8HasContractOperation = Assert<Extends<V8.ContractOperation, { verifierKey: Uint8Array }>>;
type _V8HasSingleUpdate = Assert<Extends<InstanceType<typeof V8.ReplaceAuthority>, V8.SingleUpdate>>;
type _V8HasTranscript = Assert<Extends<V8.Transcript<string>, { program: readonly unknown[] }>>;
type _V8ProveTakesProvingProvider = Assert<Extends<V8.ProvingProvider, Parameters<V8.UnprovenTransaction['prove']>[0]>>;
type _V8ProveTakesLedgerCostModel = Assert<
  Extends<ReturnType<typeof V8.CostModel.initialCostModel>, Parameters<V8.UnprovenTransaction['prove']>[1]>
>;
type _V8ProvesToAProvenTransaction = Assert<
  Extends<
    Awaited<ReturnType<V8.UnprovenTransaction['prove']>>,
    V8.Transaction<V8.SignatureEnabled, V8.Proof, V8.PreBinding>
  >
>;
// Asserted FALSE deliberately: ledger 8's `ProvingProvider` is `check` + `prove` only — `lookupKey`
// arrived with ledger 9. `ProvingKeyMaterial` is still re-exported for v8 (the type exists, and the
// facade presents the same names across eras), it is simply not reachable through this provider.
// Do not "fix" this to `true`.
type _V8ProvingProviderHasNoLookupKey = Assert<
  Extends<'lookupKey' extends keyof V8.ProvingProvider ? true : false, false>
>;
type _V8DustActionsFundsItsIntent = Assert<
  Extends<
    V8.DustActions<V8.SignatureEnabled, V8.PreProof>,
    NonNullable<ReturnType<typeof V8.Intent.new>['dustActions']>
  >
>;
type _V8UnshieldedOfferFundsItsIntent = Assert<
  Extends<
    ReturnType<typeof V8.UnshieldedOffer.new>,
    NonNullable<ReturnType<typeof V8.Intent.new>['guaranteedUnshieldedOffer']>
  >
>;
type _V8UnshieldedOfferFundsItsFallibleSlot = Assert<
  Extends<
    ReturnType<typeof V8.UnshieldedOffer.new>,
    NonNullable<ReturnType<typeof V8.Intent.new>['fallibleUnshieldedOffer']>
  >
>;

// --- ledger 9 (bound by `current.ts`) -----------------------------------------------------------
type _V9Conforms = Assert<Extends<typeof V9, LedgerBinding>>;
type _V9NoViolations = AssertNoViolations<LedgerBindingViolations<typeof V9>>;
// Ledger 9 tags each key with its scheme, which is what makes ECDSA representable at all.
type _V9SigningKeyIsTagged = Assert<Extends<V9.SigningKey, { tag: string; value: string }>>;
type _V9HasContractOperation = Assert<Extends<V9.ContractOperation, { verifierKey: Uint8Array }>>;
type _V9HasSingleUpdate = Assert<Extends<InstanceType<typeof V9.ReplaceAuthority>, V9.SingleUpdate>>;
type _V9HasTranscript = Assert<Extends<V9.Transcript<string>, { program: readonly unknown[] }>>;
// The proving path (midnight-sdk#401). Written facade-value → parameter, not the reverse: an era
// that *narrowed* `prove`'s parameter would satisfy the reverse direction while consumer code that
// passes the facade's own `ProvingProvider` broke.
type _V9ProveTakesProvingProvider = Assert<Extends<V9.ProvingProvider, Parameters<V9.UnprovenTransaction['prove']>[0]>>;
type _V9ProveTakesLedgerCostModel = Assert<
  Extends<ReturnType<typeof V9.CostModel.initialCostModel>, Parameters<V9.UnprovenTransaction['prove']>[1]>
>;
type _V9ProvesToAProvenTransaction = Assert<
  Extends<
    Awaited<ReturnType<V9.UnprovenTransaction['prove']>>,
    V9.Transaction<V9.SignatureEnabled, V9.Proof, V9.PreBinding>
  >
>;
// `lookupKey`'s result is what a consumer must name to implement `ProvingProvider` at all, and the
// parameter check above cannot see it — that pins the type, not its members.
type _V9ProvingProviderKeyIsNameable = Assert<
  Extends<Awaited<ReturnType<V9.ProvingProvider['lookupKey']>>, V9.ProvingKeyMaterial | undefined>
>;
// The fee-payment slot. Pinned at concrete markers because `DustActions` is generic in both, so the
// binding contract's `InstanceType<>` widens past the pair `Intent.dustActions` accepts.
type _V9DustActionsFundsItsIntent = Assert<
  Extends<
    V9.DustActions<V9.SignatureEnabled, V9.PreProof>,
    NonNullable<ReturnType<typeof V9.Intent.new>['dustActions']>
  >
>;
type _V9UnshieldedOfferFundsItsIntent = Assert<
  Extends<
    ReturnType<typeof V9.UnshieldedOffer.new>,
    NonNullable<ReturnType<typeof V9.Intent.new>['guaranteedUnshieldedOffer']>
  >
>;
type _V9UnshieldedOfferFundsItsFallibleSlot = Assert<
  Extends<
    ReturnType<typeof V9.UnshieldedOffer.new>,
    NonNullable<ReturnType<typeof V9.Intent.new>['fallibleUnshieldedOffer']>
  >
>;

// Asserted FALSE: `CostModel` is the only name with no nominal separation of its own, so dropping
// either binding's brand — or giving both the same major — would silently make the two eras'
// interchangeable again.
type _CostModelIsEraDistinct = Assert<
  Extends<
    Extends<ReturnType<typeof V8.CostModel.initialCostModel>, ReturnType<typeof V9.CostModel.initialCostModel>>,
    false
  >
>;
