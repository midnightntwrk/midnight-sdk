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
 * The **ledger 9** era-pinned Effect entry (midnight-sdk#387/#388). The `v9` suffix names the
 * ledger era this entry targets — ledger 9 — not this package's own version. Same API as
 * `@midnight-ntwrk/compact-js/effect`.
 *
 * This entry **binds ledger 9 itself** (`internal/era/v9Ledger.ts` and `internal/runtime/v0_19.ts`),
 * rather than re-exporting the facades. It used to do the latter, which made it an alias for
 * whatever `internal/ledger/current.ts` bound: advancing that turned `/v9` into an entry for a
 * different era, with nothing to catch it — the `/v9`-versus-root parity tests were comparing an
 * alias with its own target. The unsuffixed `@midnight-ntwrk/compact-js/effect` keeps that
 * follow-the-build-era behaviour, which is what it is *for*; the two agree today and are meant to
 * diverge the first time `current.ts` advances.
 *
 * Composed from named modules rather than by re-exporting `../effect/index.js`, so what a ledger 9
 * entry includes is visible here:
 *
 * - `eraFreeSurface.ts` — the core every era entry shares, the same object instances on both.
 * - `contractEventsSurface.ts` — ledger 9 only. A ledger 8 entry omits *this* module and takes the
 *   era-free core alone (`src/v8/effect.ts`), which is the shape #388 asks for: a member that
 *   cannot exist on an older era is absent rather than present and failing.
 * - its own `Ledger` and `CompactRuntime` bindings, plus `ContractExecutable` — see below.
 */
export * from '../effect/internal/contractEventsSurface.js';
export * as Ledger from '../effect/internal/era/v9Ledger.js';
export * as CompactRuntime from '../effect/internal/era/v9Runtime.js';
export * from '../effect/internal/eraFreeSurface.js';

// `ContractExecutable` is this entry's own application of `internal/executable.ts` to the ledger 9
// pair, not a re-export of `effect/ContractExecutable.ts`. That module applies the same factory to
// the *bound* facades, so re-exporting it would have made this entry follow a `current.ts` swap —
// the trap CLAUDE.md's era-swap checklist calls out at step 5. It needed a build-time assertion to
// catch; now it cannot happen, because the era arrives as an argument here.
export * as ContractExecutable from '../effect/internal/era/v9Executable.js';
