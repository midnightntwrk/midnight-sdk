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
 * Compile-time conformance for **every** ledger era binding, bound or not.
 *
 * @remarks
 * `current.ts` only asserts the binding it re-exports, so an unbound binding (a spike, or an era
 * being prepared) could rot until the day someone repoints `current` at it — exactly when the
 * breakage is most expensive. Listing each binding here means the build checks all of them on every
 * run, which is what lets a new era be developed against the contract before it is switched on.
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

// --- ledger 8 (spike; not bound by `current.ts`) ------------------------------------------------
type _V8Conforms = Assert<Extends<typeof V8, LedgerBinding>>;
type _V8NoViolations = AssertNoViolations<LedgerBindingViolations<typeof V8>>;
// Ledger 8 keys are BIP-340 only, so the era represents a signing key as a bare hex string. Pinned
// here so a binding that quietly adopts v9's tagged shape (or drops the distinction) fails the
// build rather than mis-signing a maintenance update.
type _V8SigningKeyIsBareHex = Assert<Extends<V8.SigningKey, string>>;
type _V8HasContractOperation = Assert<Extends<V8.ContractOperation, { verifierKey: Uint8Array }>>;
type _V8HasSingleUpdate = Assert<Extends<InstanceType<typeof V8.ReplaceAuthority>, V8.SingleUpdate>>;
type _V8HasTranscript = Assert<Extends<V8.Transcript<string>, { program: readonly unknown[] }>>;

// --- ledger 9 (bound by `current.ts`) -----------------------------------------------------------
type _V9Conforms = Assert<Extends<typeof V9, LedgerBinding>>;
type _V9NoViolations = AssertNoViolations<LedgerBindingViolations<typeof V9>>;
// Ledger 9 tags each key with its scheme, which is what makes ECDSA representable at all.
type _V9SigningKeyIsTagged = Assert<Extends<V9.SigningKey, { tag: string; value: string }>>;
type _V9HasContractOperation = Assert<Extends<V9.ContractOperation, { verifierKey: Uint8Array }>>;
type _V9HasSingleUpdate = Assert<Extends<InstanceType<typeof V9.ReplaceAuthority>, V9.SingleUpdate>>;
type _V9HasTranscript = Assert<Extends<V9.Transcript<string>, { program: readonly unknown[] }>>;
