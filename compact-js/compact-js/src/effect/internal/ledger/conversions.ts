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

import { type SigningKey as PlatformSigningKey } from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { type Effect, Either } from 'effect';

import * as ContractConfigurationError from '../../ContractConfigurationError.js';
import type * as ContractRuntimeError from '../../ContractRuntimeError.js';
import { tryBoundary as tryConvert } from '../boundary.js';
import { type RuntimeLine } from '../era.js';

/**
 * The runtime↔ledger conversions, as a **factory over an era pair** rather than a module bound to
 * one era (midnight-sdk#387/#388).
 *
 * @remarks
 * `Ledger.ts` used to define these directly against `internal/ledger/current.js`, which made the
 * facade a module singleton: every entry — `/effect`, `/v9/effect`, and any future `/v8/effect` —
 * resolves the same `Ledger.ts` instance, so an era-suffixed subpath could only ever *label* the
 * one bound era rather than select it. Moving the bodies here means a second era can be
 * instantiated alongside the first.
 *
 * Types are derived from the supplied bindings by indexed access (`ReturnType`,
 * `InstanceType`, …) rather than declared, so each instantiation keeps its own era's concrete
 * types with no casts and no `unknown` leaking into the facade. That is the same technique the
 * relational binding contract uses, for the same reason: the era packages' declarations stay
 * authoritative.
 *
 * Taking *both* bindings in one call is deliberate. The ledger era and the compact-runtime line
 * are era-paired, and until now nothing in the type system tied them together — the two
 * `current.ts` files were independent, and only `CompactRuntime.test.ts` checked at run time that
 * they agreed. A conversion here needs both halves, so a mismatched pair now fails to construct.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first declaration, so under `stripInternal` the marker deleted {@link ConversionLedger} from the
 * emitted typings while `makeConversions`' own declaration went on naming it in its constraint —
 * which is exactly the failure the note on that interface says the export exists to prevent.
 * Privacy comes from `package.json` `exports` blocking `./effect/internal/*` instead. See
 * `internal/boundary.ts` for why this note does not spell the tag out.
 */

/** The ledger-binding members the conversions need. Narrow on purpose: this is not the whole binding. */
export interface ConversionLedger {
  readonly era: {
    /**
     * The compact-runtime line this ledger era pairs with. Present so {@link makeConversions} can
     * require the runtime half to *be* that line — see its `R` constraint.
     */
    readonly runtime: RuntimeLine;
    readonly supportsCmaSignatureKind: (kind: never) => boolean;
    readonly cmaSignatureKindsDescription: string;
  };
  readonly makeSigningKey: (signingKey: PlatformSigningKey) => unknown;
  // `Serializable` rather than `unknown` where a conversion serializes the value: it keeps
  // `.serialize()` callable in the body without a cast, and costs no precision, because for a
  // concrete binding `ReturnType<…>` is still that binding's own class.
  readonly ContractState: { deserialize(raw: Uint8Array): Serializable };
  readonly LedgerParameters: { deserialize(raw: Uint8Array): unknown };
  readonly ContractMaintenanceAuthority: { deserialize(raw: Uint8Array): unknown };
  readonly StateValue: { decode(value: never): unknown };
  readonly ChargedState: new (state: never) => unknown;
  readonly QueryContext: new (state: never, address: never) => unknown;
}

/** The runtime-binding members the conversions need. */
export interface ConversionRuntime {
  /** The line this binding speaks, checked against the ledger half's `era.runtime`. */
  readonly line: RuntimeLine;
  readonly ContractState: { deserialize(raw: Uint8Array): Serializable };
  readonly ContractMaintenanceAuthority: { deserialize(raw: Uint8Array): Serializable };
}

/**
 * A serializable value — every ledger and runtime handle the conversions cross exposes this.
 *
 * Exported because it appears in the conversions' inferred signatures, which `Ledger.ts`
 * re-exports; a module-private name there fails declaration emit (TS4023).
 */
export interface Serializable {
  serialize(): Uint8Array;
}

/**
 * Wraps a call across the ledger (WASM) boundary so a rejection becomes a typed failure rather
 * than a defect. This is `internal/boundary.ts`'s `tryBoundary` under the name the ledger side
 * knows it by.
 *
 * @remarks
 * Era-independent, so it lives outside {@link makeConversions}: ledger bindings signal rejection by
 * throwing, and a throw inside `Effect.gen` or a bare `Effect.map` callback becomes a defect that
 * escapes the caller's typed error handling.
 *
 * Re-exported rather than defined here so that both seams share *one* copy of the boundary
 * handling — the compact-runtime seam exposes the same function as `CompactRuntime.tryRuntime`,
 * and `CompactRuntime.test.ts` asserts the two are identical. A second definition also loses
 * `tryBoundary`'s constraint rejecting an `async` thunk, which is the defect the wrapper exists to
 * prevent.
 *
 * @category combinators
 */
export { tryConvert };

/**
 * Builds the runtime↔ledger conversions for one era pair.
 *
 * @param ledger The era's ledger binding (`v8.ts`, `v9.ts`, …).
 * @param runtime The compact-runtime binding that era pairs with (`v0_16.ts`, `v0_19.ts`, …).
 *
 * @category constructors
 */
export const makeConversions = <
  L extends ConversionLedger,
  // `R`'s line must be the one `L`'s era pairs with, so `makeConversions(V9, V0_16)` does not
  // compile. Without it the docstring above claimed a guarantee nothing provided: the two
  // `current.ts` files are chosen independently, and only `CompactRuntime.test.ts` compared them,
  // at run time, for the *bound* pair alone — an era-pinned entry pairing the wrong halves was
  // caught nowhere.
  R extends ConversionRuntime & { readonly line: L['era']['runtime'] }
>(
  ledger: L,
  runtime: R
) => {
  type LedgerContractState = ReturnType<L['ContractState']['deserialize']>;
  type LedgerParameters = ReturnType<L['LedgerParameters']['deserialize']>;
  type LedgerAuthority = ReturnType<L['ContractMaintenanceAuthority']['deserialize']>;
  type LedgerStateValue = ReturnType<L['StateValue']['decode']>;
  type LedgerQueryContext = InstanceType<L['QueryContext']>;
  type LedgerSigningKey = ReturnType<L['makeSigningKey']>;
  type RuntimeContractState = ReturnType<R['ContractState']['deserialize']>;
  type RuntimeAuthority = ReturnType<R['ContractMaintenanceAuthority']['deserialize']>;

  // Unwrapped, for composing inside another conversion's `tryConvert`. Throws on an era-boundary
  // decode failure, so every caller must already be inside one.
  const decodeStateValue = (value: { encode(): unknown }): LedgerStateValue =>
    (ledger.StateValue as { decode(v: unknown): LedgerStateValue }).decode(value.encode());

  return {
    /** Converts a runtime contract state to this era's ledger `ContractState`. @category conversions */
    fromRuntimeContractState: (
      contractState: RuntimeContractState
    ): Effect.Effect<LedgerContractState, ContractRuntimeError.ContractRuntimeError> =>
      tryConvert(
        'Unexpected error converting runtime contract state',
        () => ledger.ContractState.deserialize(contractState.serialize()) as LedgerContractState
      ),

    /** Converts this era's ledger `ContractState` to a runtime contract state. @category conversions */
    toRuntimeContractState: (
      contractState: LedgerContractState
    ): Effect.Effect<RuntimeContractState, ContractRuntimeError.ContractRuntimeError> =>
      tryConvert(
        'Unexpected error converting ledger contract state',
        () => runtime.ContractState.deserialize(contractState.serialize()) as RuntimeContractState
      ),

    /** Deserializes ledger-serialized bytes into this era's `ContractState`. @category conversions */
    contractStateFromBytes: (
      bytes: Uint8Array
    ): Effect.Effect<LedgerContractState, ContractRuntimeError.ContractRuntimeError> =>
      tryConvert(
        'Unexpected error deserializing ledger contract state from bytes',
        () => ledger.ContractState.deserialize(bytes) as LedgerContractState
      ),

    /** Deserializes ledger-serialized bytes into this era's `LedgerParameters`. @category conversions */
    parametersFromBytes: (
      bytes: Uint8Array
    ): Effect.Effect<LedgerParameters, ContractRuntimeError.ContractRuntimeError> =>
      tryConvert(
        'Unexpected error deserializing ledger parameters',
        () => ledger.LedgerParameters.deserialize(bytes) as LedgerParameters
      ),

    /**
     * Converts a runtime contract maintenance authority to this era's ledger one.
     * @category conversions
     */
    fromRuntimeMaintenanceAuthority: (
      authority: RuntimeAuthority
    ): Effect.Effect<LedgerAuthority, ContractRuntimeError.ContractRuntimeError> =>
      tryConvert(
        'Unexpected error converting runtime contract maintenance authority',
        () => ledger.ContractMaintenanceAuthority.deserialize(authority.serialize()) as LedgerAuthority
      ),

    /** Converts a runtime `StateValue` to this era's, via the shared binary encoding. @category conversions */
    fromRuntimeStateValue: (value: {
      encode(): unknown;
    }): Effect.Effect<LedgerStateValue, ContractRuntimeError.ContractRuntimeError> =>
      tryConvert('Unexpected error converting runtime state value', () => decodeStateValue(value)),

    /**
     * Converts a runtime `QueryContext` to this era's, carrying `state`, `address`, `block`,
     * `effects` and the commitment indices (`comIndices`).
     *
     * @remarks
     * `comIndices` is declared `readonly` and is only *writable* via `insertCommitment`, but it is
     * carried here by the `block` assignment: the commitment map is part of the block-level call
     * context, so assigning `block` restores it. Verified by `test/effect/Ledger.test.ts` — do not
     * "fix" the apparent gap by re-inserting the entries, which would union two commitment sets at
     * any call site that also supplies its own (see `ContractExecutable.partitionAllTranscripts`).
     *
     * @category conversions
     */
    fromRuntimeQueryContext: (queryContext: {
      readonly state: { readonly state: { encode(): unknown } };
      readonly address: unknown;
      block: unknown;
      effects: unknown;
    }): Effect.Effect<LedgerQueryContext, ContractRuntimeError.ContractRuntimeError> =>
      // The thunk's return is annotated rather than inferred: construction widens it to
      // `LedgerQueryContext & { block; effects }` (the settable props are cast in below), and
      // `tryConvert`'s constraint rejecting an `async` thunk cannot resolve against an
      // intersection of a deferred generic. The extra props are a construction detail, not part of
      // what this conversion returns.
      tryConvert('Unexpected error converting runtime query context', (): LedgerQueryContext => {
        const ChargedState = ledger.ChargedState as new (state: unknown) => unknown;
        const QueryContext = ledger.QueryContext as new (state: unknown, address: unknown) => LedgerQueryContext & {
          block: unknown;
          effects: unknown;
        };
        const ledgerQueryContext = new QueryContext(
          new ChargedState(decodeStateValue(queryContext.state.state)),
          queryContext.address
        );
        // The constructor takes only the state and address; the remaining settable properties are
        // copied manually. `block` also carries `comIndices` (see the note above).
        ledgerQueryContext.block = queryContext.block;
        ledgerQueryContext.effects = queryContext.effects;
        return ledgerQueryContext;
      }),

    /**
     * Adapts a platform-js signing key to this era's ledger `SigningKey`, failing when the scheme
     * is not supported by the era's CMA path.
     *
     * @remarks
     * The two halves live in different places on purpose. Admissibility is era-neutral policy and
     * stays here: a scheme outside the era's allowlist fails rather than being silently coerced.
     * The key's *shape* is era-varying — ledger 9 tags each key, ledger 8 uses a bare hex string —
     * so construction is delegated to the binding's `makeSigningKey`.
     *
     * @category conversions
     */
    fromPlatformSigningKey: (
      signingKey: PlatformSigningKey,
      contractState?: RuntimeContractState
    ): Either.Either<LedgerSigningKey, ContractConfigurationError.ContractConfigurationError> =>
      (ledger.era.supportsCmaSignatureKind as (kind: PlatformSigningKey['tag']) => boolean)(signingKey.tag)
        ? Either.right(ledger.makeSigningKey(signingKey) as LedgerSigningKey)
        : Either.left(
            ContractConfigurationError.make(
              `Unsupported signature scheme '${signingKey.tag}' for a contract maintenance authority; ` +
                `supported schemes are: ${ledger.era.cmaSignatureKindsDescription}`,
              // The one genuine impedance mismatch left: `ContractConfigurationError` names the
              // *bound* era's `ContractState`, while `R` here is whichever runtime this factory was
              // given. The cast is narrow — the parameter above is the era's own contract state, so
              // this can no longer launder an arbitrary value (a string, a signing key) into a field
              // the type system reports as a `ContractState`. Removing it entirely needs the error
              // type to be era-parameterised too.
              contractState as Parameters<typeof ContractConfigurationError.make>[1]
            )
          )
  };
};
