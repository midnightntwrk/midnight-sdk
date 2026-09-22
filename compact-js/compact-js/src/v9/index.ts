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
 * The **ledger 9** era-pinned entry (midnight-sdk#387/#388). The `v9` suffix names the ledger
 * era this entry targets — ledger 9 — not this package's own version. Binding to this path
 * records an intent to speak a specific ledger era (e.g. across a hardfork window).
 *
 * Same surface as `@midnight-ntwrk/compact-js/v9/effect`, exactly as `/v8` mirrors `/v8/effect`.
 *
 * This used to be `export * from '../index.js'` — the *root* barrel, which resolves both seams'
 * `current.ts`. That made this entry an alias for whichever era the build bound, so repointing
 * `current.ts` at ledger 10 would have turned `/v9` into a ledger 10 entry: a path naming an era it
 * no longer speaks, with no build error to catch it. `/v9/effect` was rebound to its own binding
 * when the era-pinned entries landed and this one was missed, which is the failure mode
 * `internal/era/v9Ledger.ts` describes and CLAUDE.md's era-swap checklist promises cannot happen.
 */
export * from './effect.js';
