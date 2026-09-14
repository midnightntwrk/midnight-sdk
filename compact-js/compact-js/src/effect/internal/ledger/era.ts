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
 * Describes a ledger era: the facts about a ledger generation that vary between generations and
 * that compact-js code must not hard-code. An era binding (e.g. `v9.ts`) supplies one of these
 * alongside its re-exported ledger API; everything outside `internal/ledger` reads era-varying
 * values from here rather than assuming them.
 *
 * Part of the public `Ledger` facade surface (re-exported as `Ledger.Era`), so it must survive
 * `stripInternal` in the published typings.
 *
 * @category era
 */
export interface Era {
  /** The ledger major this binding targets (e.g. `9` for `@midnightntwrk/ledger-v9`). */
  readonly ledger: number;
  /**
   * The contract operation (verifier key) version literal this era's ledger expects in
   * maintenance updates. Informational; construction of versioned values goes through the
   * binding's constructors so the literal never leaks into era-neutral code.
   */
  readonly contractOperationVersion: string;
  /**
   * The signature schemes verified to work through this era's ledger CMA path (`signData` and
   * `signatureVerifyingKey`). This is deliberately an explicit allowlist, NOT platform-js's
   * `SignatureKinds`: the constraint is what the ledger primitives support, not what the type
   * union happens to include. A new scheme is added only once it is verified end-to-end against
   * the ledger CMA path.
   */
  readonly cmaSignatureKinds: ReadonlySet<SignatureKind>;
}
