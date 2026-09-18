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
 * The **compact-runtime 0.19** facade — the runtime half of the ledger 9 era, pinned rather than
 * resolved through `current.ts`.
 *
 * @remarks
 * The ledger 9 twin of {@link v8Runtime}; see that module for why an era-pinned entry needs a
 * facade rather than the bare binding, and why {@link tryRuntime} is part of what "same public API
 * across eras" means. Pinned rather than re-exporting `effect/CompactRuntime.ts`, for the same
 * reason {@link v9Ledger} does not re-export `effect/Ledger.ts`: that module follows `current.ts`,
 * so `/v9/effect` would silently follow an era swap instead of staying on ledger 9.
 */
export { tryBoundary as tryRuntime } from '../boundary.js';
export { type RuntimeLine } from '../era.js';
export * from '../runtime/v0_19.js';
