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
 * The compact-runtime 0.19 binding. This module (together with its peers under `internal/runtime`)
 * is the only place in `src/` that may import from `@midnight-ntwrk/compact-runtime`; everything
 * else goes through the `CompactRuntime` facade so that a future runtime line binds by swapping
 * `current.ts`, not by editing call sites (midnight-sdk#387). ESLint enforces this
 * (`no-restricted-imports`); tests are exempt by design, since some must compare module identity.
 *
 * The runtime line is era-paired with the ledger — 0.19 with ledger 9, over onchain-runtime-v4 —
 * so this binding and `internal/ledger/v9.ts` are swapped together. Neither is meaningful alone.
 */
import { sampleSigningKey, type SigningKey } from '@midnight-ntwrk/compact-runtime';
import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';

import { type RuntimeLine } from '../era.js';

export {
  type AlignedValue,
  type CallProofData,
  type CircuitContext,
  type CircuitResults,
  type CommunicationCommitmentData,
  CompactError,
  type ConstructorContext,
  type ConstructorResult,
  ContractMaintenanceAuthority,
  ContractState,
  type ContractStateProvider,
  createCircuitContext,
  createConstructorContext,
  decodeZswapLocalState,
  emptyZswapLocalState,
  type EncodedZswapLocalState,
  encodeZswapLocalState,
  type LogEvent,
  type Op,
  type QueryContext,
  sampleSigningKey,
  signatureVerifyingKey,
  type StateValue,
  type WitnessContext,
  type ZswapLocalState
} from '@midnight-ntwrk/compact-runtime';

/**
 * The compact-runtime line this binding targets. Read by the era-pairing check rather than
 * hard-coded at any call site, so a runtime swap is a one-line edit here plus `current.ts`.
 *
 * `as const satisfies` rather than a `: RuntimeLine` annotation, matching the ledger twin
 * (`internal/ledger/v9.ts`): an annotation widens `typeof CompactRuntime.line` to the whole union
 * at every consumer and in the emitted `.d.ts`, which forecloses any compile-time use of the
 * pairing. The two coincide while the union is a singleton and stop coinciding the moment a second
 * line is bound.
 *
 * @category era
 */
export const line = '0.19' as const satisfies RuntimeLine;

/**
 * Samples a fresh signing key for `kind`.
 *
 * @remarks
 * A thin pass-through on this line: onchain-runtime-v4 keys are already tagged (`{ tag, value }`)
 * and `sampleSigningKey` already takes the scheme. The wrapper exists so the *older* line can
 * present the same shape — see `v0_16.ts`, where the underlying call takes no argument and returns
 * a bare hex string — and so era-neutral code reads `.value` without branching.
 *
 * @category constructors
 */
export const makeSampleSigningKey = (kind: SignatureKind): SigningKey => sampleSigningKey(kind);

/**
 * Extracts the hex value of a ledger 9 era signing key.
 *
 * @remarks
 * onchain-runtime-v4 keys are tagged, so the hex lives under `value`. The 0.16 binding's
 * counterpart is the identity, its keys being bare hex strings already.
 *
 * @category conversions
 */
export const signingKeyHex = (key: SigningKey): string => key.value;
