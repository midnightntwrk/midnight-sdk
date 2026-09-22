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
 * The **compact-runtime 0.16** facade — the runtime half of the ledger 8 era, pinned rather than
 * resolved through `current.ts`.
 *
 * @remarks
 * The twin of `effect/CompactRuntime.ts`, and the runtime-side counterpart of
 * {@link v8Ledger}: an era-pinned entry needs its own instance of *both* seams, or the entry names
 * one era and hands back another's objects.
 *
 * The binding alone is not the facade. `internal/runtime/v0_16.ts` is a curated re-export of the
 * 0.16 package, and every one of those names signals rejection by throwing across the WASM
 * boundary — so an entry that exported the binding directly would be the one place in the package
 * where a rejection becomes a defect instead of a typed failure. That is not a stylistic gap: a
 * defect escapes the caller's declared error channel, so a dApp's `catchAll` over
 * `ContractExecutionError` never sees it and the CLI (running with `disableErrorReporting`) exits
 * non-zero printing nothing at all. Adding {@link tryRuntime} here is what makes `/v8/effect` offer
 * the same failure contract as the unsuffixed entry.
 *
 * One function object backs every alias — `Ledger.tryConvert`, `CompactRuntime.tryRuntime`, and
 * both eras' — because they all re-export `internal/boundary.ts`. The era 8 facade test asserts
 * that identity rather than just the presence of a function.
 */
export { tryBoundary as tryRuntime } from '../boundary.js';
export { type RuntimeLine } from '../era.js';
export * from '../runtime/v0_16.js';
