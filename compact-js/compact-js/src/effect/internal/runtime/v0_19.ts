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
 * @category era
 */
export const line: RuntimeLine = '0.19';
