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
 * The **ledger 8** `Ledger` facade — pinned to that era, independent of `current.ts`.
 *
 * @remarks
 * The twin of `effect/Ledger.ts`, which instantiates the same conversions factory against whatever
 * `current.ts` binds. This module instead pins ledger 8 and its paired compact-runtime 0.16 line,
 * so `/v8/effect` genuinely *selects* an era rather than labelling the build's one bound era
 * (midnight-sdk#387/#388).
 *
 * Both facades exist at once, which is the property that makes an era-suffixed subpath meaningful:
 * `test/era8/LedgerEightFacade.test.ts` exercises this pair while the default test project
 * exercises the ledger 9 pair.
 *
 * The duplication against `Ledger.ts` is deliberate and thin — a curated type re-export list plus
 * one factory call. The *bodies* live in `internal/ledger/conversions.ts` and are shared; only the
 * era binding differs. A type re-export cannot come from a factory, which is why there is a module
 * per era rather than one parameterised module.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first statement — here the `effect` import — so under `stripInternal` the marker deleted that
 * import from the emitted typings while every conversion below went on returning an
 * `Effect.Effect<…>`, leaving the published `.d.ts` naming a namespace it no longer imports.
 * This is the `Ledger` of `/v8/effect`, so the damage landed on a headline entry. Privacy
 * comes from `package.json` `exports` blocking `./effect/internal/*` instead. See
 * `internal/boundary.ts` for why this note does not spell the tag out.
 */
import { Effect } from 'effect';

import * as ContractRuntimeError from '../../ContractRuntimeError.js';
import { makeConversions, tryConvert } from '../ledger/conversions.js';
import * as V8 from '../ledger/v8.js';
import * as V0_16 from '../runtime/v0_16.js';

export { type Era } from '../era.js';
export { tryConvert } from '../ledger/conversions.js';
export * from '../ledger/v8.js';

// Ledger 8 with compact-runtime 0.16 — the era pair `v8.ts` declares via `era.runtime`. Passing
// both halves to one factory is what makes a mismatched pair a construction error rather than a
// run-time surprise.
const conversions = makeConversions(V8, V0_16);

/** Converts a runtime `ContractState` to ledger 8's. @category conversions */
export const fromRuntimeContractState = conversions.fromRuntimeContractState;

/** Converts a ledger 8 `ContractState` to the paired runtime's. @category conversions */
export const toRuntimeContractState = conversions.toRuntimeContractState;

/** Deserializes ledger-serialized bytes into a ledger 8 `ContractState`. @category conversions */
export const contractStateFromBytes = conversions.contractStateFromBytes;

/** Deserializes ledger-serialized bytes into ledger 8 `LedgerParameters`. @category conversions */
export const parametersFromBytes = conversions.parametersFromBytes;

/** Converts a runtime `ContractMaintenanceAuthority` to ledger 8's. @category conversions */
export const fromRuntimeMaintenanceAuthority = conversions.fromRuntimeMaintenanceAuthority;

/** Converts a runtime `StateValue` to ledger 8's via the shared binary encoding. @category conversions */
export const fromRuntimeStateValue = conversions.fromRuntimeStateValue;

/** Converts a runtime `QueryContext` to ledger 8's. @category conversions */
export const fromRuntimeQueryContext = conversions.fromRuntimeQueryContext;

/**
 * Adapts a platform-js signing key to ledger 8's `SigningKey`.
 *
 * @remarks
 * Returns a **bare hex string**, not the `{ tag, value }` pair the ledger 9 facade returns: this
 * era has no tagged-key concept. An ECDSA key is rejected rather than coerced, because it has no
 * representation here at all.
 *
 * @category conversions
 */
export const fromPlatformSigningKey = conversions.fromPlatformSigningKey;

/**
 * Resolves the `ContractOperation` for a circuit from a ledger 8 contract state, failing if absent.
 *
 * @category conversions
 */
export const operationForCircuit: (
  contractState: V8.ContractState,
  circuitId: string,
  contractAddress: string
) => Effect.Effect<V8.ContractOperation, ContractRuntimeError.ContractRuntimeError> = (
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
