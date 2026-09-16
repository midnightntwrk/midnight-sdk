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
 * The `@midnight-ntwrk/compact-runtime` lines this codebase has a runtime binding for, as
 * `'<major>.<minor>'` — the granularity at which the runtime is era-paired (0.16 with ledger 8,
 * 0.19 with ledger 9), patch releases within a line being interchangeable. Extend the union as
 * bindings are added, for the same reason {@link LedgerMajor} is one.
 *
 * @category era
 */
export type RuntimeLine = '0.19';

/**
 * Describes a ledger era: the facts about a ledger generation that vary between generations and
 * that compact-js code must not hard-code. An era binding (e.g. `v9.ts`) supplies one of these
 * alongside its re-exported ledger API; everything outside `internal/ledger` reads era-varying
 * values from here rather than assuming them.
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
export interface Era {
  /** The ledger major this binding targets (e.g. `9` for `@midnightntwrk/ledger-v9`). */
  readonly ledger: LedgerMajor;
  /**
   * The `@midnight-ntwrk/compact-runtime` line this era pairs with. Declared by the *ledger*
   * binding because the pairing is a fact about the era, not about either package alone; that the
   * bound runtime seam actually supplies this line is asserted by
   * `test/effect/CompactRuntime.test.ts`, since the two seams are bound in separate `current.ts`
   * files and nothing in the type system ties them together.
   */
  readonly runtime: RuntimeLine;
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
