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
 * The **ledger 8** era-pinned Effect entry (midnight-sdk#387/#388). The `v8` suffix names the
 * ledger era this entry targets — ledger 8 — not this package's own version.
 *
 * @remarks
 * Unlike `/v9/effect`, this entry does **not** follow `internal/ledger/current.ts`. It binds ledger
 * 8 and its paired compact-runtime 0.16 line directly, so importing it selects an era rather than
 * labelling whichever era the build happens to be bound to. Both era facades can be live in one
 * process; `test/era8/LedgerEightFacade.test.ts` exercises this one alongside the ledger 9 pair.
 *
 * ## What this entry provides
 *
 * - `Ledger` — the ledger 8 seam: its types and constructors, plus the runtime↔ledger conversions
 *   instantiated for the ledger 8 / runtime 0.16 pair.
 * - `CompactRuntime` — the compact-runtime 0.16 seam, including the execution adapter
 *   (`createExecutionContext` / `readExecution`) that presents 0.16's flat, single-frame execution
 *   model in the same shape as 0.19's call tree.
 * - The **era-free core** (`internal/eraFreeSurface.ts`) — contract and ZK-configuration modules
 *   whose module graph reaches neither facade, so the objects here are the *same instances* the
 *   ledger 9 entry exports. This is #388's "identical public API wherever the era permits": code
 *   using them compiles unchanged against either entry.
 *
 * ## What it does not provide, and why
 *
 * **Contract events and cross-contract calls are absent because ledger 8 cannot do them.**
 * onchain-runtime-v3's `log` payload is a bare `EncodedStateValue` with no emitting-contract
 * address and no versioning, 0.16 accumulates nothing on the circuit context, and there is no
 * `crossContractCall` or `ContractStateProvider` at all. `createExecutionContext` therefore
 * *rejects* a state provider rather than ignoring it. This is the "absent, not runtime-failing"
 * requirement in #388.
 *
 * **`ContractExecutable` executes against ledger 8 here, not against the build's bound era.** It is
 * `internal/executable.ts` applied to this entry's two facades, so `deploy`, `circuit` and the
 * maintenance operations all speak ledger 8 and runtime 0.16 — including the types they return.
 * A cross-contract state provider is *rejected* by this era's `createExecutionContext` rather than
 * ignored, and `CallResult.events` is statically empty, so the two features ledger 8 cannot do stay
 * unreachable from here rather than failing at run time.
 *
 * A compiled ledger 8 contract still has to resolve its own `@midnight-ntwrk/compact-runtime` to
 * the 0.16 line — its generated code imports that specifier directly and asserts
 * `checkRuntimeVersion('0.16.0')` on load, which no compact-js entry can influence. The recipe is
 * one line in the manifest of the package holding those artifacts; `test/effect/DualEraResolution.test.ts`
 * pins it, and `test/era8/LedgerEightExecutable.test.ts` runs a contract end to end through this
 * entry.
 */
export * as ContractExecutable from '../effect/internal/era/v8Executable.js';
export * as Ledger from '../effect/internal/era/v8Ledger.js';
export * as CompactRuntime from '../effect/internal/era/v8Runtime.js';
export * from '../effect/internal/eraFreeSurface.js';
