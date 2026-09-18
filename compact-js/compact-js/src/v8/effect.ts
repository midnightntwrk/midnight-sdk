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
 * **`ContractExecutable` is absent for a different reason: an outstanding implementation limit, not
 * an era truth.** It is the one module in the public surface whose *runtime* imports reach both
 * facades, so it resolves whatever `current.ts` binds — today ledger 9. Exposing it here would hand
 * back ledger-9-bound objects from a path named v8, which is exactly the mis-labelling this entry
 * exists to avoid. Ledger 8 execution itself is proven to work
 * (`test/era8/LedgerEightExecution.test.ts` runs a circuit end to end); what remains is
 * parameterising that one module on an era pair the way the conversions now are.
 *
 * Note this is a *smaller* gap than it once was. `CompiledContract`, `Contract` and the
 * ZK-configuration services were previously withheld for the same stated reason, but their built
 * import closures reach neither facade — the coupling was `import type`, which is erased — so they
 * are exported above. `LedgerEra.test.ts` pins both the inclusion and the exclusion.
 *
 * Until then, a consumer that wants the full executable surface against ledger 8 selects the era at
 * resolution time — repoint both `current.ts` files, or resolve `@midnight-ntwrk/compact-js` to a
 * ledger-8-pinned build in that subtree. That is the same mechanism a compiled ledger-8 contract
 * already forces, since its generated code imports `@midnight-ntwrk/compact-runtime` by bare
 * specifier and asserts `checkRuntimeVersion('0.16.0')` on load.
 */
export * as Ledger from '../effect/internal/era/v8Ledger.js';
export * from '../effect/internal/eraFreeSurface.js';
export * as CompactRuntime from '../effect/internal/runtime/v0_16.js';
