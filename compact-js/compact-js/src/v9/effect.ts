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
export * from '../effect/internal/eraFreeSurface.js';
export * as CompactRuntime from '../effect/internal/runtime/v0_19.js';

// `ContractExecutable` is the one public module whose *runtime* imports reach `Ledger.js` and
// `CompactRuntime.js`, so it still resolves whichever era `current.ts` binds rather than this
// entry's. While that is true, a ledger 9 entry is only honest on a build whose bound era *is*
// ledger 9 — hence the assertion below, which makes the mismatch a build error at this entry
// instead of a `/v9` that quietly executes another era. Remove it, and the indirection, once the
// executable takes its bindings as parameters the way the conversions factory does.
export * as ContractExecutable from '../effect/ContractExecutable.js';

import type { Assert, Extends } from '../effect/internal/typeAssertions.js';
import type * as BoundLedger from '../effect/Ledger.js';

// Fails the build if the era `ContractExecutable` resolves is not ledger 9. `import type` keeps
// this erased, so the assertion costs no module edge and cannot instantiate a second WASM. This is
// what CLAUDE.md's era-swap checklist calls out as step 5's trap — that repointing `current.ts`
// leaves `/v9` claiming an era it no longer executes — enforced rather than documented.
type _ExecutableEraIsLedger9 = Assert<Extends<typeof BoundLedger.era.ledger, 9>>;
