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

import { Effect } from 'effect';

import * as ContractRuntimeError from '../ContractRuntimeError.js';

/**
 * Wraps a call across a WASM boundary so that a rejection becomes a typed failure rather than a
 * defect.
 *
 * @remarks
 * Both era seams need this, and it lives above both rather than in either. The dependency between
 * the facades runs one way — `Ledger` imports `CompactRuntime` (it is where the two era-paired
 * halves meet), not the reverse — so a wrapper owned by `Ledger` would make `CompactRuntime`'s
 * import of it a cycle. Owning it in `CompactRuntime` would not cycle, but it would route every
 * *ledger* rejection through the runtime facade and make the runtime seam load-bearing for the
 * ledger one, which is the layering the two-seam split exists to avoid. Each facade re-exports it
 * under the name that documents its own package's failure mode — `Ledger.tryConvert` and
 * `CompactRuntime.tryRuntime` — so there is exactly one copy of the boundary handling.
 *
 * Every ledger and compact-runtime binding signals rejection by throwing. A throw evaluated in an
 * `Effect.gen` body (or a bare `Effect.map` callback) is a defect, and a defect escapes the
 * caller's declared error channel: a dApp's `catchAll` over `ContractExecutionError` never sees
 * it, and the CLI — which runs with `disableErrorReporting` — exits non-zero printing nothing at
 * all.
 *
 * `evaluate` is constrained to a synchronous thunk. `Effect.try` does not await, so an `async`
 * thunk would infer `A = Promise<X>`: the effect *succeeds* carrying a pending promise, the
 * rejection never reaches the error channel, and the caller gets an unhandled rejection plus a
 * `Promise` where a value was expected — the very defect this function exists to prevent, arrived
 * at through the wrapper meant to stop it. Use `Effect.tryPromise` for an async boundary call.
 *
 * @param message A message describing the operation, used as the failure's message.
 * @param evaluate A synchronous thunk that performs the boundary call.
 * @returns An `Effect` that yields the result of `evaluate`, failing with a
 * {@link ContractRuntimeError.ContractRuntimeError} if the boundary rejects it.
 * @internal
 */
export const tryBoundary: <A>(
  message: string,
  evaluate: () => A extends PromiseLike<unknown> ? never : A
) => Effect.Effect<A, ContractRuntimeError.ContractRuntimeError> = (message, evaluate) =>
  Effect.try({
    try: evaluate,
    catch: (err) => ContractRuntimeError.make(message, err)
  });
