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
 * The compact-runtime line currently bound to this build. Every entry — suffixed and unsuffixed —
 * resolves the `CompactRuntime` facade through this one module, so changing the export below
 * changes the runtime for ALL of them, `/v9` included. Giving each era-pinned entry its own
 * binding is the outstanding work (midnight-sdk#388).
 *
 * Swap this together with `internal/ledger/current.ts`: the two are era-paired, and
 * `test/effect/CompactRuntime.test.ts` fails if only one of them moves.
 */
export * from './v0_19.js';

import type { Assert, Extends } from '../typeAssertions.js';
import { type RuntimeBinding } from './binding.js';
import type * as Bound from './v0_19.js';

// Compile-time proof that the bound module satisfies the binding contract, so a runtime swap that
// misses a facade name fails the build HERE, naming the binding. `import type` keeps this file
// emit-free beyond the re-export, preserving the single-WASM-instantiation property the era tests
// guard. `Assert`/`Extends` are shared with the other seam — see `internal/typeAssertions.ts` for
// why the constrained generic is load-bearing.
type _BindingIsComplete = Assert<Extends<typeof Bound, RuntimeBinding>>;
