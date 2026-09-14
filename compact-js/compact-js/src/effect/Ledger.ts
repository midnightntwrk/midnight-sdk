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
 * The ledger era seam (midnight-sdk#387).
 *
 * All ledger types, constructors, and runtime↔ledger conversions used by compact-js (and its
 * sibling packages) are reached through this module rather than a `@midnightntwrk/ledger-v<N>`
 * package directly. The concrete era is bound in `internal/ledger/current.ts`; an era-scoped
 * build (midnight-sdk#388) rebinds that one module and every consumer of this facade follows.
 *
 * The seam is deliberately a module, not an injected service: which ledger era a build speaks is
 * a packaging-level fact (one era per era-scoped entry), not a runtime dependency to vary per
 * effect. Downstream multi-era consumers select between era-scoped entries instead.
 */
import {
  ContractState as RuntimeContractState,
  type QueryContext as RuntimeQueryContext,
  type StateValue as RuntimeStateValue
} from '@midnight-ntwrk/compact-runtime';
import type * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { Effect, Either } from 'effect';

import * as ContractConfigurationError from './ContractConfigurationError.js';
import * as ContractRuntimeError from './ContractRuntimeError.js';
import * as CurrentEra from './internal/ledger/current.js';

export * from './internal/ledger/current.js';
export { type Era } from './internal/ledger/era.js';

/**
 * Converts a runtime {@link RuntimeContractState} to this era's ledger `ContractState`.
 *
 * @category conversions
 */
export const fromRuntimeContractState: (
  contractState: RuntimeContractState
) => Effect.Effect<CurrentEra.ContractState, ContractRuntimeError.ContractRuntimeError> = (state) =>
  Effect.try({
    try: () => CurrentEra.ContractState.deserialize(state.serialize()),
    catch: (err) => ContractRuntimeError.make('Unexpected error converting runtime contract state', err)
  });

/**
 * Converts this era's ledger `ContractState` to a runtime {@link RuntimeContractState}.
 *
 * @category conversions
 */
export const toRuntimeContractState: (
  contractState: CurrentEra.ContractState
) => Effect.Effect<RuntimeContractState, ContractRuntimeError.ContractRuntimeError> = (state) =>
  Effect.try({
    try: () => RuntimeContractState.deserialize(state.serialize()),
    catch: (err) => ContractRuntimeError.make('Unexpected error converting ledger contract state', err)
  });

/**
 * Deserializes ledger-serialized bytes into this era's ledger `ContractState`.
 *
 * @category conversions
 */
export const contractStateFromBytes: (
  bytes: Uint8Array
) => Effect.Effect<CurrentEra.ContractState, ContractRuntimeError.ContractRuntimeError> = (bytes) =>
  Effect.try({
    try: () => CurrentEra.ContractState.deserialize(bytes),
    catch: (err) => ContractRuntimeError.make('Unexpected error deserializing ledger contract state from bytes', err)
  });

/**
 * Deserializes ledger-serialized bytes into this era's `LedgerParameters`.
 *
 * @category conversions
 */
export const parametersFromBytes: (
  bytes: Uint8Array
) => Effect.Effect<CurrentEra.LedgerParameters, ContractRuntimeError.ContractRuntimeError> = (bytes) =>
  Effect.try({
    try: () => CurrentEra.LedgerParameters.deserialize(bytes),
    catch: (err) => ContractRuntimeError.make('Unexpected error deserializing ledger parameters', err)
  });

/**
 * Converts a runtime {@link RuntimeStateValue} to this era's ledger `StateValue` via the shared
 * binary encoding.
 *
 * @category conversions
 */
export const fromRuntimeStateValue = (value: RuntimeStateValue): CurrentEra.StateValue =>
  CurrentEra.StateValue.decode(value.encode());

/**
 * Converts a runtime {@link RuntimeQueryContext} to this era's ledger `QueryContext`.
 *
 * @category conversions
 */
export const fromRuntimeQueryContext = (queryContext: RuntimeQueryContext): CurrentEra.QueryContext => {
  const ledgerQueryContext = new CurrentEra.QueryContext(
    new CurrentEra.ChargedState(fromRuntimeStateValue(queryContext.state.state)),
    queryContext.address
  );
  // The above method of converting to ledger query context only retains the state. So, we have to set the settable properties manually
  ledgerQueryContext.block = queryContext.block;
  ledgerQueryContext.effects = queryContext.effects;
  return ledgerQueryContext;
};

/**
 * Adapts a platform-js {@link SigningKey.SigningKey} to this era's ledger `SigningKey`, failing
 * when the signature scheme is not supported by the era's CMA path.
 *
 * As of platform-js@3.0.0 both are `{ tag: SignatureKind, value }` and structurally compatible;
 * the onchain-runtime `SigningKey` is identical too, so this serves both `signData` (ledger) and
 * `signatureVerifyingKey` (compact-runtime). The caller-supplied `tag` is preserved so
 * ECDSA-tagged keys are not silently treated as Schnorr; a scheme outside the era's
 * `cmaSignatureKinds` allowlist fails rather than being silently coerced.
 *
 * @category conversions
 */
export const fromPlatformSigningKey = (
  signingKey: SigningKey.SigningKey,
  contractState?: RuntimeContractState
): Either.Either<CurrentEra.SigningKey, ContractConfigurationError.ContractConfigurationError> =>
  CurrentEra.era.cmaSignatureKinds.has(signingKey.tag)
    ? Either.right({ tag: signingKey.tag, value: signingKey.value })
    : Either.left(
        ContractConfigurationError.make(
          `Unsupported signature scheme '${signingKey.tag}' for a contract maintenance authority; ` +
            `supported schemes are: ${[...CurrentEra.era.cmaSignatureKinds].join(', ')}`,
          contractState
        )
      );
