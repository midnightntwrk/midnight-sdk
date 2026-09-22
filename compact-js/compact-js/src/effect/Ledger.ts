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
import { Effect } from 'effect';

// Type-only: this module is where the two era-paired halves meet, so it is where a mismatched pair
// would first misbehave — `_SeamsArePaired` below reads the runtime line from here. The conversions
// themselves no longer name runtime types directly; they are instantiated from both bindings by
// `makeConversions`.
import type * as CompactRuntime from './CompactRuntime.js';
import * as ContractRuntimeError from './ContractRuntimeError.js';
import { type EraPairing } from './internal/era.js';
import { makeConversions, tryConvert } from './internal/ledger/conversions.js';
import * as CurrentEra from './internal/ledger/current.js';
import * as CurrentRuntime from './internal/runtime/current.js';
import type { Assert, Extends } from './internal/typeAssertions.js';

export { type Era } from './internal/era.js';
export { tryConvert } from './internal/ledger/conversions.js';
export * from './internal/ledger/current.js';

// The conversions are instantiated from the two `current.ts` bindings rather than written against
// them, so a second era can be instantiated alongside this one (midnight-sdk#387/#388). Passing
// both halves in one call is also what finally ties the era pair together statically: the ledger
// era and the compact-runtime line are era-paired, and until this existed only
// `CompactRuntime.test.ts` checked at run time that the two independent `current.ts` files agreed.
const conversions = makeConversions(CurrentEra, CurrentRuntime);

// Compile-time proof that the two seams are bound to the *same* era. The ledger and runtime
// halves are chosen in separate `current.ts` files, and `EraPairing` makes a mispaired descriptor
// unrepresentable *within* a binding but says nothing about which two bindings a build actually
// wired together. This module already imports both facades, so the check costs no new edge, and
// it fails closed: if either literal widens, the assertion errors rather than quietly passing.
// `CompactRuntime.test.ts` asserts the same pairing at run time; this makes a half-completed era
// swap a build failure instead, which is what step 5 of CLAUDE.md's checklist relies on.
type _SeamsArePaired = Assert<Extends<typeof CompactRuntime.line, EraPairing[typeof CurrentEra.era.ledger]>>;

/**
 * Converts a runtime `ContractState` to this era's ledger `ContractState`.
 *
 * @category conversions
 */
export const fromRuntimeContractState = conversions.fromRuntimeContractState;

/**
 * Converts this era's ledger `ContractState` to a runtime `ContractState`.
 *
 * @category conversions
 */
export const toRuntimeContractState = conversions.toRuntimeContractState;

/**
 * Deserializes ledger-serialized bytes into this era's ledger `ContractState`.
 *
 * @category conversions
 */
export const contractStateFromBytes = conversions.contractStateFromBytes;

/**
 * Deserializes ledger-serialized bytes into this era's `LedgerParameters`.
 *
 * @category conversions
 */
export const parametersFromBytes = conversions.parametersFromBytes;

/**
 * Converts a runtime `ContractMaintenanceAuthority` to this era's ledger one.
 *
 * @category conversions
 */
export const fromRuntimeMaintenanceAuthority = conversions.fromRuntimeMaintenanceAuthority;

/**
 * Converts a runtime `StateValue` to this era's ledger `StateValue` via the shared binary
 * encoding.
 *
 * @category conversions
 */
export const fromRuntimeStateValue = conversions.fromRuntimeStateValue;

/**
 * Converts a runtime `QueryContext` to this era's ledger `QueryContext`, carrying `state`,
 * `address`, `block`, `effects`, and the commitment indices (`comIndices`).
 *
 * @category conversions
 */
export const fromRuntimeQueryContext = conversions.fromRuntimeQueryContext;

/**
 * Adapts a platform-js signing key to this era's ledger `SigningKey`, failing when the signature
 * scheme is not supported by the era's CMA path.
 *
 * @category conversions
 */
export const fromPlatformSigningKey = conversions.fromPlatformSigningKey;

/**
 * Resolves the `ContractOperation` for a circuit from a contract's ledger state, failing with a
 * {@link ContractRuntimeError.ContractRuntimeError} if absent. A state with no operation for the
 * requested circuit (e.g. a state file for the wrong contract) would otherwise be cast from
 * `undefined` and surface as an opaque native fault.
 *
 * Era-independent, so it stays here rather than in the conversions factory: it reads the era's own
 * `ContractState` and needs no second binding.
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
