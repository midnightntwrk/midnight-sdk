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
 * The **ledger 9** `Ledger` facade — pinned to that era, independent of `current.ts`.
 *
 * @remarks
 * The twin of `v8Ledger.ts`, and the reason `/v9/effect` is now an era-pinned entry rather than a
 * second name for the build's bound era. Previously `/v9` re-exported `effect/Ledger.ts`, which
 * resolves `internal/ledger/current.ts`; repointing that at a later era therefore turned `/v9` into
 * an entry for *that* era, with no build error and no failing test — the `/v9`-versus-root parity
 * checks compared an alias against its own target, so they passed by construction. Binding v9 here
 * makes the suffix mean what it says (midnight-sdk#388).
 *
 * `effect/Ledger.ts` keeps its role: it is the facade for the **unsuffixed** entry, which is
 * deliberately "whatever era this build bound". The two agree today and are expected to diverge the
 * first time `current.ts` advances — that divergence is the point, not a defect.
 *
 * Both halves of the era pair are passed to one conversions factory, so a mismatched pair is a
 * construction error rather than a run-time surprise. The bodies live in
 * `internal/ledger/conversions.ts` and are shared with every other era; only the binding differs.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first statement — here the `effect` import — so under `stripInternal` the marker deleted that
 * import from the emitted typings while every conversion below went on returning an
 * `Effect.Effect<…>`, leaving the published `.d.ts` naming a namespace it no longer imports.
 * This is the `Ledger` of `/v9/effect`, so the damage landed on a headline entry. Privacy
 * comes from `package.json` `exports` blocking `./effect/internal/*` instead. See
 * `internal/boundary.ts` for why this note does not spell the tag out.
 */
import { Effect } from 'effect';

import * as ContractRuntimeError from '../../ContractRuntimeError.js';
import { makeConversions, tryConvert } from '../ledger/conversions.js';
import * as V9 from '../ledger/v9.js';
import * as V0_19 from '../runtime/v0_19.js';

export { type Era } from '../era.js';
export { tryConvert } from '../ledger/conversions.js';
export * from '../ledger/v9.js';

// Ledger 9 with compact-runtime 0.19 — the era pair `v9.ts` declares via `era.runtime`.
const conversions = makeConversions(V9, V0_19);

/** Converts a runtime `ContractState` to ledger 9's. @category conversions */
export const fromRuntimeContractState = conversions.fromRuntimeContractState;

/** Converts a ledger 9 `ContractState` to the paired runtime's. @category conversions */
export const toRuntimeContractState = conversions.toRuntimeContractState;

/** Deserializes ledger-serialized bytes into a ledger 9 `ContractState`. @category conversions */
export const contractStateFromBytes = conversions.contractStateFromBytes;

/** Deserializes ledger-serialized bytes into ledger 9 `LedgerParameters`. @category conversions */
export const parametersFromBytes = conversions.parametersFromBytes;

/** Converts a runtime `ContractMaintenanceAuthority` to ledger 9's. @category conversions */
export const fromRuntimeMaintenanceAuthority = conversions.fromRuntimeMaintenanceAuthority;

/** Converts a runtime `StateValue` to ledger 9's via the shared binary encoding. @category conversions */
export const fromRuntimeStateValue = conversions.fromRuntimeStateValue;

/** Converts a runtime `QueryContext` to ledger 9's. @category conversions */
export const fromRuntimeQueryContext = conversions.fromRuntimeQueryContext;

/**
 * Adapts a platform-js signing key to ledger 9's `SigningKey`.
 *
 * @remarks
 * Returns the `{ tag, value }` pair this era tags keys with, and accepts every scheme in the era's
 * CMA allowlist — unlike ledger 8, which has no tagged-key concept and only BIP-340.
 *
 * @category conversions
 */
export const fromPlatformSigningKey = conversions.fromPlatformSigningKey;

/**
 * Resolves the `ContractOperation` for a circuit from a ledger 9 contract state, failing if absent.
 *
 * @category conversions
 */
export const operationForCircuit: (
  contractState: V9.ContractState,
  circuitId: string,
  contractAddress: string
) => Effect.Effect<V9.ContractOperation, ContractRuntimeError.ContractRuntimeError> = (
  state,
  circuitId,
  contractAddress
) =>
  tryConvert(`Unexpected error resolving the operation for circuit '${circuitId}' on '${contractAddress}'`, () =>
    state.operation(circuitId)
  ).pipe(
    Effect.flatMap((operation) =>
      operation === undefined
        ? ContractRuntimeError.make(
            `Contract state for '${contractAddress}' has no operation for circuit '${circuitId}'.`
          )
        : Effect.succeed(operation)
    )
  );
