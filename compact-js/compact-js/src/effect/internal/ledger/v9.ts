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
 * The ledger 9 era binding. This module (together with its peers under `internal/ledger`) is the
 * ONLY place allowed to import from a `@midnightntwrk/ledger-v<N>` package; everything else goes
 * through the `Ledger` facade so that a future era binds by swapping `current.ts`, not by editing
 * call sites (midnight-sdk#387).
 */
import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import {
  ContractOperationVersion,
  ContractOperationVersionedVerifierKey
} from '@midnightntwrk/ledger-v9';

import { type Era } from './era.js';

export {
  ChargedState,
  communicationCommitmentRandomness,
  ContractCallPrototype,
  ContractDeploy,
  ContractMaintenanceAuthority,
  type ContractOperation,
  type ContractOperationVersion,
  type ContractOperationVersionedVerifierKey,
  ContractState,
  Intent,
  LedgerParameters,
  MaintenanceUpdate,
  partitionTranscripts,
  PreTranscript,
  QueryContext,
  ReplaceAuthority,
  signData,
  type SigningKey,
  type SingleUpdate,
  StateValue,
  type Transcript,
  VerifierKeyInsert,
  VerifierKeyRemove
} from '@midnightntwrk/ledger-v9';

/**
 * The contract operation (verifier key) version this era's ledger expects. Defined once so an era
 * bump is a one-line edit; both constructors below read it from here.
 */
const CONTRACT_OPERATION_VERSION = 'v3';

/**
 * The signature schemes verified end-to-end against the ledger 9 CMA path (`signData` and
 * `signatureVerifyingKey`). Add a scheme here only once it has been verified end-to-end; an
 * unlisted scheme is rejected loudly by the facade, never silently coerced. Module-local so the
 * allowlist cannot be reached (or mutated) through the public `era` value.
 */
const CMA_SIGNATURE_KINDS: ReadonlySet<SignatureKind> = new Set(['schnorr', 'ecdsa']);

/** The ledger 9 {@link Era} descriptor. @category era */
export const era = {
  ledger: 9,
  supportsCmaSignatureKind: (kind: SignatureKind) => CMA_SIGNATURE_KINDS.has(kind),
  cmaSignatureKindsDescription: [...CMA_SIGNATURE_KINDS].join(', '),
  defaultCmaSignatureKind: 'schnorr'
} as const satisfies Era;

// A half-built binding must fail at import, not at first CMA signing: the default sampling scheme
// must be in its own verified allowlist (which therefore also cannot be empty).
if (!era.supportsCmaSignatureKind(era.defaultCmaSignatureKind)) {
  throw new Error(
    `ledger ${era.ledger} era binding: default CMA signature kind '${era.defaultCmaSignatureKind}' is not in the era's allowlist`
  );
}

/**
 * Creates the {@link ContractOperationVersion} for this era. The version literal lives here so it
 * cannot leak into era-neutral code.
 *
 * @category constructors
 */
export const makeContractOperationVersion = (): ContractOperationVersion =>
  new ContractOperationVersion(CONTRACT_OPERATION_VERSION);

/**
 * Creates a {@link ContractOperationVersionedVerifierKey} for `verifierKey` at this era's
 * operation version.
 *
 * @category constructors
 */
export const makeVersionedVerifierKey = (verifierKey: Uint8Array): ContractOperationVersionedVerifierKey =>
  new ContractOperationVersionedVerifierKey(CONTRACT_OPERATION_VERSION, verifierKey);
