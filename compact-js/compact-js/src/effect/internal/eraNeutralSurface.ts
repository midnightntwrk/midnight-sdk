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
 * The **era-neutral** half of the `/effect` surface: the era-free core, plus the members that work
 * on whichever era this build bound.
 *
 * @remarks
 * Split out from `effect/index.ts` so an era-scoped entry composes only the levels its runtime line
 * can actually provide (midnight-sdk#387/#388). This barrel is what the *unsuffixed* entry uses:
 * the three members added below reach `Ledger.js`/`CompactRuntime.js`, so they resolve through each
 * seam's `current.ts` and describe the build's bound era rather than a named one.
 *
 * An era-pinned entry therefore composes `eraFreeSurface.ts` plus its **own** binding, not this
 * module — see `src/v8/effect.ts` and `src/v9/effect.ts`. Re-exporting this barrel from `/v8` would
 * hand back ledger-9-bound objects from a path named v8, and re-exporting it from `/v9` is what
 * previously made `/v9` an alias that silently followed an era swap.
 *
 * #388 requires that a member which cannot exist on an older era is *absent* from that era's entry
 * rather than present and failing at run time. The contract-event modules are absent from every
 * barrel here and live in `contractEventsSurface.ts`, composed only by entries whose era can emit
 * events. `LedgerEra.test.ts` asserts both halves of that.
 *
 * Internal by design: consumers reach these through `@midnight-ntwrk/compact-js/effect` or an
 * era-pinned entry, and `package.json` `exports` blocks `./effect/internal/*` with `null`. The
 * era entry files under the `src/v<N>` directories are package-internal source, so they may
 * import it.
 *
 * Keep alphabetized, matching `effect/index.ts`.
 *
 * No internal-marker JSDoc tag — see `eraFreeSurface.ts` for why a module docblock must not carry
 * one here.
 */
export * as CompactRuntime from '../CompactRuntime.js';
export * as ContractExecutable from '../ContractExecutable.js';
export * as Ledger from '../Ledger.js';
export * from './eraFreeSurface.js';
