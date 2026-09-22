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
 * The ledger 8 era binding — **spike status** (midnight-sdk#387 phase 3).
 *
 * @remarks
 * This exists to answer the ledger-8 feasibility question on #388 by *building* rather than by
 * reading `.d.ts` diffs: written against the same {@link LedgerBinding} contract as `v9.ts`, so
 * every missing name or changed signature surfaces as a compile error here. It is NOT reachable
 * from any entry — `current.ts` still binds v9, and there is no `/v8` subpath — and it is not
 * paired with a compact-runtime 0.16 binding yet (that half needs GitHub Packages credentials).
 *
 * Findings so far, from the surface comparison against `@midnightntwrk/ledger-v8@8.1.2`:
 *
 * - All 24 names the facade re-exports are present on v8; nothing was added between v8 and v9 that
 *   the facade depends on.
 * - `SigningKey` is a bare `string` on v8, against `{ tag, value }` on v9, and `sampleSigningKey()`
 *   takes no argument (v9 takes an optional `SignatureKind`). v8 has no `SignatureKind` concept at
 *   all: its keys are BIP-340 only. This is the one difference that reaches the public API, via
 *   `Ledger.fromPlatformSigningKey`'s return type — see the note on {@link era} below.
 * - `ContractOperationVersion` accepts only `'v3'` on v8 (`'v3' | 'v4'` on v9), so the shared `'v3'`
 *   literal is correct for both eras and needs no era-varying treatment.
 */
import {
  type SignatureKind,
  type SigningKey as PlatformSigningKey
} from '@midnight-ntwrk/platform-js/effect/SigningKey';
import {
  ContractMaintenanceAuthority as LedgerContractMaintenanceAuthority,
  ContractOperationVersion,
  ContractOperationVersionedVerifierKey,
  type SignatureVerifyingKey,
  type SigningKey as LedgerSigningKey
} from '@midnightntwrk/ledger-v8';

import { type Era } from '../era.js';

export {
  ChargedState,
  communicationCommitmentRandomness,
  ContractCallPrototype,
  ContractDeploy,
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
} from '@midnightntwrk/ledger-v8';

/**
 * Ledger 8's `ContractMaintenanceAuthority`, with `deserialize`'s return type repaired.
 *
 * @remarks
 * `@midnightntwrk/ledger-v8@8.1.2` declares `static deserialize(raw: Uint8Array): ContractState` —
 * an upstream mistake in the generated `.d.ts`. The WASM really returns a
 * `ContractMaintenanceAuthority` (verified against 8.1.2: `deserialize(cma.serialize())` yields a
 * value whose constructor is `ContractMaintenanceAuthority`, and which fails
 * `instanceof ContractState`). Repaired here, at the seam, so every era presents the same
 * relationship to `Ledger.fromRuntimeMaintenanceAuthority` and no call site has to know.
 *
 * Do not drop this in a routine "remove redundant cast" pass: `LedgerBindingViolations` fails the
 * build without it, naming the broken round-trip. Re-check it on each v8 patch release — if
 * upstream fixes the declaration, the cast becomes a no-op and can go.
 */
const ContractMaintenanceAuthority = LedgerContractMaintenanceAuthority as unknown as {
  new (committee: SignatureVerifyingKey[], threshold: number, counter?: bigint): LedgerContractMaintenanceAuthority;
  deserialize(raw: Uint8Array): LedgerContractMaintenanceAuthority;
};

export { ContractMaintenanceAuthority };

/** Ledger 8's `ContractMaintenanceAuthority` instance type, unaffected by the repair above. */
export type ContractMaintenanceAuthority = LedgerContractMaintenanceAuthority;

/**
 * The contract operation (verifier key) version this era's ledger expects. Same literal as v9: v8
 * accepts only `'v3'`, and v9 accepts `'v3' | 'v4'` but compact-js emits `'v3'`.
 */
const CONTRACT_OPERATION_VERSION = 'v3';

/**
 * Ledger 8 CMA keys are BIP-340 only — the era has no tagged-key concept, so there is exactly one
 * scheme to allow. Kept in the same shape as v9's allowlist so era-neutral code reads one API.
 */
const CMA_SIGNATURE_KINDS: ReadonlySet<SignatureKind> = new Set(['schnorr']);

/**
 * The ledger 8 {@link Era} descriptor.
 *
 * @remarks
 * `supportsCmaSignatureKind` carries real weight here rather than being a formality: an ECDSA key
 * configured against a v8 build has no representation in this era's `SigningKey` at all, so it must
 * be rejected at the descriptor rather than coerced into a bare hex string.
 *
 * Not yet expressible: `Era` describes which *schemes* an era allows, but not the *shape* of its
 * `SigningKey`. `Ledger.fromPlatformSigningKey` returns `{ tag, value }` because v9 wants that;
 * against v8 it must return the bare `value`. Binding this era for real needs `Era` to gain a
 * signing-key-shape discriminant (or `fromPlatformSigningKey` to move into the binding).
 */
export const era = {
  ledger: 8,
  runtime: '0.16',
  supportsCmaSignatureKind: (kind: SignatureKind) => CMA_SIGNATURE_KINDS.has(kind),
  cmaSignatureKindsDescription: [...CMA_SIGNATURE_KINDS].join(', '),
  defaultCmaSignatureKind: 'schnorr'
} as const satisfies Era;

// Mirrors v9: a half-built binding must fail at import, not at first CMA signing.
if (!era.supportsCmaSignatureKind(era.defaultCmaSignatureKind)) {
  throw new Error(
    `ledger ${era.ledger} era binding: default CMA signature kind '${era.defaultCmaSignatureKind}' is not in the era's allowlist`
  );
}

/**
 * Creates the {@link ContractOperationVersion} for this era.
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

/**
 * Adapts a platform-js signing key to ledger 8's `SigningKey`.
 *
 * @remarks
 * This is the one era difference that reaches compact-js's public API. Ledger 8 has no tagged-key
 * concept — its keys are BIP-340 only and `SigningKey` is a bare hex `string` — so the platform
 * key's `tag` is *dropped* rather than carried, and only its `value` survives. Dropping it is safe
 * only because {@link era}'s allowlist has already rejected every scheme but `schnorr` by the time
 * `Ledger.fromPlatformSigningKey` calls this; an ECDSA key has no representation here at all and
 * must never reach this function.
 *
 * @category constructors
 */
export const makeSigningKey = (signingKey: PlatformSigningKey): LedgerSigningKey => signingKey.value;
