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
 * The **ledger 9 and later** half of the `/effect` surface: contract events.
 *
 * @remarks
 * Kept separate from `eraNeutralSurface.ts` because contract events are era-impossible below
 * ledger 9, not merely unimplemented there:
 *
 * - compact-runtime 0.16 has no `LogEvent` type and accumulates nothing on its circuit context,
 *   so there is no value for these modules to be built on.
 * - The VM-level `log` gather op *does* exist under onchain-runtime-v3, but its payload is a bare
 *   `EncodedStateValue`, against onchain-runtime-v4's `{ version, eventType, data }`, and it
 *   carries no emitting-contract address. Events on ledger 8 would have to be rebuilt against a
 *   different payload, not bound — so these types could not describe them even if a value existed.
 *
 * The gate is **the omission itself**: an era entry that cannot support events does not compose
 * this module, which is what #388 means by a member being absent rather than runtime-failing.
 *
 * It is *not* structural, and an earlier version of this note claimed otherwise — that "every
 * module re-exported here reaches `LogEvent` through the compact-runtime seam, so composing this
 * barrel on an era whose runtime line lacks it fails the build". Composing it on `/v8/effect`
 * compiles cleanly; that was verified rather than assumed. Three of the four modules name no
 * runtime type at all, and the fourth (`ContractLog`) reached the *bound* facade rather than a
 * binding argument — so on an older era the barrel would have compiled and handed back the wrong
 * era's events, which is the opposite of a gate.
 *
 * `CallTreeRuntimeBinding` (`internal/runtime/binding.ts`) is the type-level gate that backs the
 * omission up: `internal/runtime/conformance.ts` asserts 0.19 satisfies it and **0.16 does not**, so
 * a line that cannot accumulate events cannot claim it.
 *
 * These modules are era-free in their own right. `ContractLog` used to take `LogEvent` from the
 * bound facade — which would have made an era-pinned entry's decoder follow `current.ts` — and now
 * reads the structural minimum it decodes, recovering the caller's own event type by inference. So
 * composing this barrel on a later era is correct by construction rather than by coincidence.
 *
 * Internal by design, for the same reasons as its era-neutral sibling — and, like it, without an
 * internal-marker JSDoc tag, which `stripInternal` would apply to the first export below (see
 * `eraFreeSurface.ts`).
 */
export * as ContractEventStore from '../ContractEventStore.js';
export * as ContractEventValidationError from '../ContractEventValidationError.js';
export * from '../ContractEventValidator.js';
export * as ContractLog from '../ContractLog.js';
