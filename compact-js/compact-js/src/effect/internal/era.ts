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

import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';

/**
 * The ledger majors this codebase has an era binding for. Extend the union as bindings are added
 * (e.g. `9 | 10`); keeping it a literal union means a binding declaring an era with no
 * corresponding `@midnightntwrk/ledger-v<N>` package fails the build, and `Ledger.era.ledger`
 * stays a literal at every use site.
 *
 * @category era
 */
export type LedgerMajor = 9;

/**
 * Which `@midnight-ntwrk/compact-runtime` line each ledger major pairs with, as `'<major>.<minor>'`
 * — the granularity at which the runtime is era-paired, patch releases within a line being
 * interchangeable. Add an entry alongside every {@link LedgerMajor} you add (e.g. `8: '0.16'`):
 * {@link RuntimeLine} indexes this by `LedgerMajor`, so a major with no entry fails the build here
 * rather than producing a binding that silently pairs with nothing.
 *
 * The pairing is expressed as a lookup rather than as two independent fields on {@link Era} so
 * that a descriptor claiming a line its ledger major does not pair with is *unrepresentable*. With
 * one era bound that is true only by accident — the union is a singleton — but the whole point of
 * the seam is that a second era arrives, and `CompactRuntime.test.ts` can only catch a mismatch
 * between the two bound `current.ts` files, never one inside a binding.
 *
 * @category era
 */
export interface EraPairing {
  readonly 9: '0.19';
}

/**
 * The `@midnight-ntwrk/compact-runtime` lines this codebase has a runtime binding for. Derived
 * from {@link EraPairing} rather than written out, so the set of lines and the ledger↔runtime
 * pairing cannot drift apart.
 *
 * @category era
 */
export type RuntimeLine = EraPairing[LedgerMajor];

/**
 * The era descriptor for one specific ledger major. {@link Era} is the union of these over every
 * bound major; this is the form to reach for when a binding wants to name its own era (e.g.
 * `satisfies EraDescriptor<9>`). Exported because {@link Era} is built from it and both must
 * survive declaration emit.
 *
 * @category era
 */
export interface EraDescriptor<L extends LedgerMajor> {
  /** The ledger major this binding targets (e.g. `9` for `@midnightntwrk/ledger-v9`). */
  readonly ledger: L;
  /**
   * The `@midnight-ntwrk/compact-runtime` line this era pairs with — fixed by `ledger` through
   * {@link EraPairing}, not chosen independently. Declared by the *ledger* binding because the
   * pairing is a fact about the era, not about either package alone. That the bound runtime seam
   * actually *supplies* this line is a separate question, asserted at run time by
   * `test/effect/CompactRuntime.test.ts`: the two seams are bound in separate `current.ts` files
   * and nothing in the type system ties those two choices together.
   */
  readonly runtime: EraPairing[L];
  /**
   * Whether a signature scheme is verified to work through this era's ledger CMA path (`signData`
   * and `signatureVerifyingKey`). Deliberately a predicate over a binding-private allowlist
   * rather than an exported set: a `ReadonlySet` is only a compile-time view and could be cast
   * back to `Set` and mutated, whereas the closure keeps the allowlist unreachable. The allowlist
   * is NOT platform-js's `SignatureKinds`: the constraint is what the ledger primitives support,
   * not what the type union happens to include.
   */
  readonly supportsCmaSignatureKind: (kind: SignatureKind) => boolean;
  /**
   * A human-readable rendering of the CMA signature-scheme allowlist, for error messages (e.g.
   * `'schnorr, ecdsa'`).
   */
  readonly cmaSignatureKindsDescription: string;
  /**
   * The scheme used when sampling a fresh CMA signing key for this era. Must satisfy
   * {@link supportsCmaSignatureKind}, so a sampled key is never rejected by the era's own
   * allowlist; era bindings assert this at module load.
   */
  readonly defaultCmaSignatureKind: SignatureKind;
}

/**
 * Describes a ledger era: the facts about a ledger generation that vary between generations and
 * that compact-js code must not hard-code. An era binding (e.g. `v9.ts`) supplies one of these
 * alongside its re-exported ledger API; everything outside `internal/ledger` reads era-varying
 * values from here rather than assuming them.
 *
 * The union over bound majors rather than a single generic interface with a defaulted parameter:
 * a bare `satisfies Era` then still checks the ledger↔runtime pairing, where `Era<L = LedgerMajor>`
 * would have widened `runtime` back to every line and let a mismatched binding through.
 *
 * This module sits above both seams rather than inside `internal/ledger/`, because an era is not
 * only a ledger generation: the ledger package, the compact-runtime line, and the onchain-runtime
 * WASM under it all move together, and `internal/runtime/` reads {@link RuntimeLine} from here too.
 *
 * Part of the public `Ledger` facade surface (re-exported as `Ledger.Era`), so it must survive
 * `stripInternal` in the published typings.
 *
 * @category era
 */
export type Era = { [L in LedgerMajor]: EraDescriptor<L> }[LedgerMajor];
