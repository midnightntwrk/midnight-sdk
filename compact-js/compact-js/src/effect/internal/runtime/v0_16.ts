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
 * The compact-runtime 0.16 binding — the runtime half of the ledger 8 era, and **spike status**
 * (midnight-sdk#387 phase 3).
 *
 * @remarks
 * Paired with `internal/ledger/v8.ts`: ledger 8 ↔ compact-runtime 0.16 ↔ onchain-runtime-v3 ↔
 * compactc 0.31.x. Neither half is meaningful alone. Like its ledger twin this is not reachable
 * from any entry — `current.ts` still binds 0.19, and there is no `/v8` subpath — but
 * `conformance.ts` checks it on every build so it cannot rot before it is switched on.
 *
 * It satisfies {@link RuntimeBinding} (the era-neutral core) and deliberately **not**
 * {@link CallTreeRuntimeBinding}. That is not an omission to be filled in later: the 0.16
 * execution model is a single flat frame, and the call-tree members simply do not exist on this
 * line. What is missing, measured against 0.19.0-rc.0:
 *
 * - `CircuitContext` is `{ currentPrivateState, currentZswapLocalState, currentQueryContext,
 *   costModel, gasLimit }` — one contract, no `callContext`, no `queryContexts`/`gasCosts`/
 *   `zswapLocalStates`/`contractStates` maps, no `callProofDataTrace`, no `events`.
 * - `createCircuitContext` takes the contract address first (0.19 takes the circuit id) and has no
 *   `stateProvider`, `parentBlockHash` or `reentrancyGuard` parameters.
 * - `CircuitResults` carries `proofData: ProofData`; 0.19 dropped it in favour of the trace on the
 *   context.
 * - Absent entirely: `CircuitId`, `CallContext`, `CallProofData`, `CallProofDataTrace`,
 *   `CommunicationCommitmentData`, `LogEvent`, `ContractStateProvider`, `crossContractCall`,
 *   `copyCircuitContext`, `finalizeCallProofData`, `createInitialQueryContext`,
 *   `createCallContext`.
 * - `queryLedgerState` returns `AlignedValue | GatherResult[]`, against 0.19's
 *   `AlignedValue | undefined`.
 *
 * Everything else — `constructor-context`, `zswap`, `proof-data`, `contract-dependencies`,
 * `compact-types`, `casts`, `built-ins`, `utils`, `error`, `constants`, `witness`, `version` — is
 * identical to 0.19 apart from the onchain-runtime-v3 → v4 import swap, which is why the core
 * contract below is satisfiable at all.
 *
 * `checkRuntimeVersion` hard-fails across minors while the major is 0, so contracts compiled for
 * 0.19 can never run on this line: binding this era for real needs its own compiled fixtures
 * (compactc 0.31.1, Compact language 0.23.0), not a recompile of the current set.
 *
 * The package is reached through the `compact-runtime-ledger8` npm alias so that one dependency
 * tree can hold both lines, and the alias resolves the public npmjs tarball rather than the
 * GitHub Packages copy the `@midnight-ntwrk` scope routing would otherwise pick.
 */
import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { sampleSigningKey, type SigningKey } from 'compact-runtime-ledger8';

import { type RuntimeLine } from '../era.js';

export {
  type AlignedValue,
  type CircuitContext,
  type CircuitResults,
  CompactError,
  type ConstructorContext,
  type ConstructorResult,
  ContractMaintenanceAuthority,
  ContractState,
  createCircuitContext,
  createConstructorContext,
  decodeZswapLocalState,
  emptyZswapLocalState,
  type EncodedZswapLocalState,
  encodeZswapLocalState,
  type Op,
  type ProofData,
  type QueryContext,
  signatureVerifyingKey,
  type StateValue,
  type WitnessContext,
  type ZswapLocalState
} from 'compact-runtime-ledger8';

/**
 * The compact-runtime line this binding targets.
 *
 * @category era
 */
export const line = '0.16' satisfies RuntimeLine;

/**
 * Samples a fresh signing key in this line's native representation.
 *
 * @remarks
 * `kind` is accepted and **ignored**: onchain-runtime-v3 has no scheme concept at all — its
 * `SigningKey` is a bare hex string and `sampleSigningKey()` takes no argument — so BIP-340
 * Schnorr is the only thing this line can produce. Callers must consult the *ledger* era's
 * allowlist first (`internal/ledger/v8.ts` permits `schnorr` only), which is what makes ignoring
 * the argument safe rather than silently wrong.
 *
 * The key is returned in this line's native representation — a bare hex string — so that it stays
 * assignable to this line's own `signatureVerifyingKey`. {@link signingKeyHex} is what makes the
 * hex readable era-neutrally.
 *
 * @category constructors
 */
export const makeSampleSigningKey = (_kind: SignatureKind): SigningKey => sampleSigningKey();

/**
 * Extracts the hex value of a ledger 8 era signing key.
 *
 * @remarks
 * The identity: onchain-runtime-v3 has no tagged-key concept, so a `SigningKey` *is* its hex
 * string. Present so era-neutral code can read a key's hex without branching — the ledger 9 era's
 * counterpart reads `.value` off a tagged key.
 *
 * @category conversions
 */
export const signingKeyHex = (key: SigningKey): string => key;
