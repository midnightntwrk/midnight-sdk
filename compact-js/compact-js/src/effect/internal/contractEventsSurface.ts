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
 * That is why the gate is structural rather than a feature flag: every module re-exported here
 * reaches `LogEvent` through the compact-runtime seam, so composing this barrel on an era whose
 * runtime line lacks it fails the build. An era entry that cannot support events simply does not
 * compose this module, which is what #388 means by a member being absent rather than
 * runtime-failing. The corresponding type-level gate is `CallTreeRuntimeBinding` in
 * `internal/runtime/binding.ts`, asserted unsatisfiable by `v0_16.ts`.
 *
 * Internal by design, for the same reasons as its era-neutral sibling.
 *
 * @internal
 */
export * as ContractEventStore from '../ContractEventStore.js';
export * as ContractEventValidationError from '../ContractEventValidationError.js';
export * from '../ContractEventValidator.js';
export * as ContractLog from '../ContractLog.js';
