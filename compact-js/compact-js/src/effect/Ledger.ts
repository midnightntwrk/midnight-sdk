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
 * The ledger era seam.
 *
 * All ledger types, constructors, and runtime↔ledger conversions used by compact-js (and its
 * sibling packages) are reached through this module rather than a `@midnightntwrk/ledger-v<N>`
 * package directly. The concrete era is bound in `internal/ledger/current.ts`. The facade
 * re-exports a curated list of ledger names: if one you need is missing, widen the era binding
 * (`internal/ledger/v9.ts`) rather than importing the ledger package around the seam. Tests may
 * import the ledger package directly where they must compare module identity.
 *
 * The design rationale (why a module rather than an injected service, and the era-scoped entry
 * plan) is recorded in `docs/adr/0001-ledger-era-seam.md`.
 */
import {
  type ContractMaintenanceAuthority as RuntimeContractMaintenanceAuthority,
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

// Every conversion below is a WASM-boundary (de)serialization that can throw; this wraps the
// thunk so a failure surfaces as a typed `ContractRuntimeError` with a conversion-specific message.
const tryConvert = <A>(
  message: string,
  evaluate: () => A
): Effect.Effect<A, ContractRuntimeError.ContractRuntimeError> =>
  Effect.try({
    try: evaluate,
    catch: (err) => ContractRuntimeError.make(message, err)
  });

/**
 * Converts a runtime {@link RuntimeContractState} to this era's ledger `ContractState`.
 *
 * @category conversions
 */
export const fromRuntimeContractState: (
  contractState: RuntimeContractState
) => Effect.Effect<CurrentEra.ContractState, ContractRuntimeError.ContractRuntimeError> = (state) =>
  tryConvert('Unexpected error converting runtime contract state', () =>
    CurrentEra.ContractState.deserialize(state.serialize())
  );

/**
 * Converts this era's ledger `ContractState` to a runtime {@link RuntimeContractState}.
 *
 * @category conversions
 */
export const toRuntimeContractState: (
  contractState: CurrentEra.ContractState
) => Effect.Effect<RuntimeContractState, ContractRuntimeError.ContractRuntimeError> = (state) =>
  tryConvert('Unexpected error converting ledger contract state', () =>
    RuntimeContractState.deserialize(state.serialize())
  );

/**
 * Deserializes ledger-serialized bytes into this era's ledger `ContractState`.
 *
 * @category conversions
 */
export const contractStateFromBytes: (
  bytes: Uint8Array
) => Effect.Effect<CurrentEra.ContractState, ContractRuntimeError.ContractRuntimeError> = (bytes) =>
  tryConvert('Unexpected error deserializing ledger contract state from bytes', () =>
    CurrentEra.ContractState.deserialize(bytes)
  );

/**
 * Deserializes ledger-serialized bytes into this era's `LedgerParameters`.
 *
 * @category conversions
 */
export const parametersFromBytes: (
  bytes: Uint8Array
) => Effect.Effect<CurrentEra.LedgerParameters, ContractRuntimeError.ContractRuntimeError> = (bytes) =>
  tryConvert('Unexpected error deserializing ledger parameters', () =>
    CurrentEra.LedgerParameters.deserialize(bytes)
  );

/**
 * Converts a runtime {@link RuntimeContractMaintenanceAuthority} to this era's ledger
 * `ContractMaintenanceAuthority`.
 *
 * @category conversions
 */
export const fromRuntimeMaintenanceAuthority: (
  authority: RuntimeContractMaintenanceAuthority
) => Effect.Effect<CurrentEra.ContractMaintenanceAuthority, ContractRuntimeError.ContractRuntimeError> = (authority) =>
  tryConvert('Unexpected error converting runtime contract maintenance authority', () =>
    CurrentEra.ContractMaintenanceAuthority.deserialize(authority.serialize())
  );

/**
 * Resolves the `ContractOperation` for a circuit from a contract's ledger state, failing with a
 * {@link ContractRuntimeError.ContractRuntimeError} if absent. A state with no operation for the
 * requested circuit (e.g. a state file for the wrong contract) would otherwise be cast from
 * `undefined` and surface as an opaque native fault.
 *
 * @category conversions
 */
export const operationForCircuit: (
  contractState: CurrentEra.ContractState,
  circuitId: string,
  contractAddress: string
) => Effect.Effect<CurrentEra.ContractOperation, ContractRuntimeError.ContractRuntimeError> = (
  state,
  circuitId,
  contractAddress
) => {
  const operation = state.operation(circuitId);
  return operation === undefined
    ? ContractRuntimeError.make(`Contract state for '${contractAddress}' has no operation for circuit '${circuitId}'.`)
    : Effect.succeed(operation);
};

// Total form of `fromRuntimeStateValue` for internal composition (`fromRuntimeQueryContext` is
// itself total); an era-boundary decode failure here throws raw and is wrapped by the caller.
const decodeStateValue = (value: RuntimeStateValue): CurrentEra.StateValue =>
  CurrentEra.StateValue.decode(value.encode());

/**
 * Converts a runtime {@link RuntimeStateValue} to this era's ledger `StateValue` via the shared
 * binary encoding.
 *
 * @category conversions
 */
export const fromRuntimeStateValue: (
  value: RuntimeStateValue
) => Effect.Effect<CurrentEra.StateValue, ContractRuntimeError.ContractRuntimeError> = (value) =>
  tryConvert('Unexpected error converting runtime state value', () => decodeStateValue(value));

/**
 * Converts a runtime {@link RuntimeQueryContext} to this era's ledger `QueryContext`, carrying
 * `state`, `address`, `block`, `effects`, and the commitment indices (`comIndices`, re-inserted
 * entry by entry since they are only carriable via `insertCommitment`).
 *
 * @category conversions
 */
export const fromRuntimeQueryContext = (queryContext: RuntimeQueryContext): CurrentEra.QueryContext => {
  const ledgerQueryContext = Array.from(queryContext.comIndices).reduce(
    (context, [commitment, index]) => context.insertCommitment(commitment, index),
    new CurrentEra.QueryContext(
      new CurrentEra.ChargedState(decodeStateValue(queryContext.state.state)),
      queryContext.address
    )
  );
  // The constructor only takes the state and address, and `comIndices` rides on `insertCommitment`
  // above; the remaining settable properties are copied manually.
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
  CurrentEra.era.supportsCmaSignatureKind(signingKey.tag)
    ? Either.right({ tag: signingKey.tag, value: signingKey.value })
    : Either.left(
        ContractConfigurationError.make(
          `Unsupported signature scheme '${signingKey.tag}' for a contract maintenance authority; ` +
            `supported schemes are: ${CurrentEra.era.cmaSignatureKindsDescription}`,
          contractState
        )
      );
