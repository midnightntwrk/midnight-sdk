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
  ContractOperationVersion,
  ContractOperationVersionedVerifierKey,
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

/** The ledger 9 {@link Era} descriptor. @internal */
export const era: Era = {
  ledger: 9,
  contractOperationVersion: 'v3',
  cmaSignatureKinds: new Set(['schnorr', 'ecdsa'])
};

/**
 * Creates the {@link ContractOperationVersion} for this era. The version literal lives here so it
 * cannot leak into era-neutral code.
 *
 * @internal
 */
export const makeContractOperationVersion = (): ContractOperationVersion => new ContractOperationVersion('v3');

/**
 * Creates a {@link ContractOperationVersionedVerifierKey} for `verifierKey` at this era's
 * operation version.
 *
 * @internal
 */
export const makeVersionedVerifierKey = (verifierKey: Uint8Array): ContractOperationVersionedVerifierKey =>
  new ContractOperationVersionedVerifierKey('v3', verifierKey);
