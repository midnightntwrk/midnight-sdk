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
 * The seam is deliberately a module, not an injected service: which ledger era a build speaks is
 * a packaging-level fact — one era per build artifact — not a runtime dependency to vary per
 * effect. Downstream multi-era consumers select between era-scoped entries instead.
 */
import type * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { Effect, Either } from 'effect';

import type * as CompactRuntime from './CompactRuntime.js';
// The runtime side of every conversion below comes through the compact-runtime seam, not the
// package: this module is where the two era-paired halves meet, so it is also where a mismatched
// pair would first misbehave. Aliased `Runtime*` to keep each conversion's direction readable.
import {
  type ContractMaintenanceAuthority as RuntimeContractMaintenanceAuthority,
  ContractState as RuntimeContractState,
  type QueryContext as RuntimeQueryContext,
  type StateValue as RuntimeStateValue
} from './CompactRuntime.js';
import * as ContractConfigurationError from './ContractConfigurationError.js';
import * as ContractRuntimeError from './ContractRuntimeError.js';
import * as boundary from './internal/boundary.js';
import { type EraPairing } from './internal/era.js';
import * as CurrentEra from './internal/ledger/current.js';
import type { Assert, Extends } from './internal/typeAssertions.js';

export { type Era } from './internal/era.js';
export * from './internal/ledger/current.js';

// Compile-time proof that the two seams are bound to the *same* era. The ledger and runtime
// halves are chosen in separate `current.ts` files, and `EraPairing` makes a mispaired descriptor
// unrepresentable *within* a binding but says nothing about which two bindings a build actually
// wired together. This module already imports both facades, so the check costs no new edge, and
// it fails closed: if either literal widens, the assertion errors rather than quietly passing.
// `CompactRuntime.test.ts` asserts the same pairing at run time; this makes a half-completed era
// swap a build failure instead, which is what step 5 of CLAUDE.md's checklist relies on.
type _SeamsArePaired = Assert<Extends<typeof CompactRuntime.line, EraPairing[typeof CurrentEra.era.ledger]>>;

/**
 * Wraps a call across the ledger (WASM) boundary so that a rejection becomes a typed failure
 * rather than a defect.
 *
 * @remarks
 * Ledger bindings signal rejection by throwing — a throw inside `Effect.gen` or a bare
 * `Effect.map` callback becomes a defect, which escapes the caller's typed error handling.
 * Every conversion below goes through this wrapper; any other ledger call made outside this
 * facade should too.
 *
 * This is `internal/boundary.ts`'s `tryBoundary` under the name the ledger side knows it by; the
 * compact-runtime seam re-exports the same function as `CompactRuntime.tryRuntime`, so there is
 * exactly one copy of the boundary handling across both seams.
 *
 * @param message A message describing the operation, used as the failure's message.
 * @param evaluate A thunk that performs the ledger call.
 * @returns An `Effect` that yields the result of `evaluate`, failing with a
 * {@link ContractRuntimeError.ContractRuntimeError} if the ledger rejects it.
 * @category combinators
 */
export const tryConvert: <A>(
  message: string,
  evaluate: () => A extends PromiseLike<unknown> ? never : A
) => Effect.Effect<A, ContractRuntimeError.ContractRuntimeError> = boundary.tryBoundary;

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
 * @remarks
 * Both of the ways a bad state file fails here are held in the error channel. `operation()`
 * returning `undefined` is the wrong-contract case; `operation()` *throwing* is the
 * wrong-WASM-instance case (`expected instance of ContractState`), and since this function's
 * result is built while the caller's `Effect.gen` body runs, an unwrapped throw would be a defect
 * that escapes the caller's `catchAll` entirely — the opaque fault this function exists to
 * prevent.
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

// Unwrapped form of `fromRuntimeStateValue`, for composing inside another conversion's
// `tryConvert`. It throws on an era-boundary decode failure, so every caller must be inside one.
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
 * `state`, `address`, `block`, `effects`, and the commitment indices (`comIndices`).
 *
 * `comIndices` is declared `readonly` and is only *writable* via `insertCommitment`, but it is
 * carried here by the `block` assignment: the commitment map is part of the block-level call
 * context, so assigning `block` restores it. This is verified by `test/effect/Ledger.test.ts` —
 * do not "fix" the apparent gap by re-inserting the entries, which would union two commitment
 * sets at any call site that also supplies its own (see
 * `ContractExecutable.partitionAllTranscripts`).
 *
 * @category conversions
 */
export const fromRuntimeQueryContext: (
  queryContext: RuntimeQueryContext
) => Effect.Effect<CurrentEra.QueryContext, ContractRuntimeError.ContractRuntimeError> = (queryContext) =>
  tryConvert('Unexpected error converting runtime query context', () => {
    const ledgerQueryContext = new CurrentEra.QueryContext(
      new CurrentEra.ChargedState(decodeStateValue(queryContext.state.state)),
      queryContext.address
    );
    // The constructor takes only the state and address; the remaining settable properties are
    // copied manually. `block` also carries `comIndices` (see the note above).
    ledgerQueryContext.block = queryContext.block;
    ledgerQueryContext.effects = queryContext.effects;
    return ledgerQueryContext;
  });

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
