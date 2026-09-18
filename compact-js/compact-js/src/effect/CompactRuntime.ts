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
 * The compact-runtime seam.
 *
 * All `@midnight-ntwrk/compact-runtime` types and functions used by compact-js (and its sibling
 * packages) are reached through this module rather than the package directly. The concrete line is
 * bound in `internal/runtime/current.ts`. The facade re-exports a curated list of runtime names: if
 * one you need is missing, widen the binding (`internal/runtime/v0_19.ts`) rather than importing
 * the package around the seam. Tests may import it directly where they must compare module
 * identity.
 *
 * @remarks
 * This is the twin of the {@link Ledger} seam, and exists for the same reason: the compact-runtime
 * line is era-paired with the ledger (0.19 with ledger 9, over onchain-runtime-v4), so a build that
 * targets a different ledger era needs a different runtime line too. Routing every call site
 * through one module is what lets an era-scoped entry rebind both by editing two `current.ts`
 * files, instead of hunting nine import sites across three packages (midnight-sdk#387/#388).
 *
 * Like the ledger seam, this is deliberately a module rather than an injected service: which
 * runtime line a build speaks is a packaging-level fact — one line per build artifact — not a
 * runtime dependency to vary per effect. Downstream multi-era consumers select between era-scoped
 * entries instead.
 *
 * Sibling packages (`compact-js-node`, `compact-js-command`) import this facade from
 * `@midnight-ntwrk/compact-js/effect` rather than declaring their own compact-runtime dependency,
 * so a swap here reaches them too and they cannot drift onto a second copy of the WASM.
 *
 * @example
 * ```ts
 * import { CompactRuntime } from '@midnight-ntwrk/compact-js/effect';
 * import { Effect } from 'effect';
 *
 * // Through the wrapper, not bare: the facade resolves the binding, it does not make the call
 * // safe — see `tryRuntime`.
 * const program = Effect.gen(function* () {
 *   const encoded = yield* CompactRuntime.tryRuntime(
 *     'Failed to encode the zswap local state',
 *     () => CompactRuntime.encodeZswapLocalState(zswapLocalState)
 *   );
 *   return encoded;
 * });
 * ```
 */
import { type Effect } from 'effect';

import type * as ContractRuntimeError from './ContractRuntimeError.js';
import * as boundary from './internal/boundary.js';

export { type RuntimeLine } from './internal/era.js';
export * from './internal/runtime/current.js';

/**
 * Wraps a call across the compact-runtime (WASM) boundary so that a rejection becomes a typed
 * failure rather than a defect.
 *
 * @remarks
 * Routing a call through this facade makes it *look* protected without making it so: the seam only
 * changes where the binding is resolved, and compact-runtime still signals rejection by throwing.
 * A throw evaluated in an `Effect.gen` body is a defect, which escapes the caller's declared error
 * channel — `ContractExecutable.circuit`'s `ContractExecutionError` becomes unsound at that point,
 * and the CLI (which runs with `disableErrorReporting`) exits non-zero printing nothing at all.
 * Every runtime call is held in the error channel one of three ways: inside an
 * `Effect.try`/`Effect.tryPromise` callback, through this wrapper, or — in `ContractExecutable`'s
 * synchronous `Either`-returning maintenance helpers, which have no `Effect` to wrap — inside a
 * plain `try`/`catch` yielding a `ContractConfigurationError`. Reach for this one by default; the
 * third applies only where the surrounding function is not an `Effect`.
 *
 * This is the ledger seam's {@link Ledger.tryConvert} under the name the runtime side knows it by
 * — one copy of the boundary handling, shared (see `internal/boundary.ts` for why it lives above
 * both facades rather than in either).
 *
 * @param message A message describing the operation, used as the failure's message.
 * @param evaluate A thunk that performs the runtime call.
 * @returns An `Effect` that yields the result of `evaluate`, failing with a
 * {@link ContractRuntimeError.ContractRuntimeError} if the runtime rejects it.
 * @category combinators
 */
export const tryRuntime: <A>(
  message: string,
  evaluate: () => A extends PromiseLike<unknown> ? never : A
) => Effect.Effect<A, ContractRuntimeError.ContractRuntimeError> = boundary.tryBoundary;
