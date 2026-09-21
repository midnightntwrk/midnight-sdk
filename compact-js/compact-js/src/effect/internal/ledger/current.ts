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
 * The era currently bound to this build. Every entry — suffixed and unsuffixed — resolves the
 * `Ledger` facade through this one module, so changing the export below changes the era for ALL
 * of them, `/v9` included. Giving each era-pinned entry its own binding is the outstanding work
 * (midnight-sdk#388).
 */
export * from './v9.js';

import { type LedgerBinding } from './binding.js';
import type * as Bound from './v9.js';

// Compile-time proof that the bound module satisfies the binding contract, so an era swap that
// misses a facade name fails the build HERE, naming the binding. Routed through a constrained
// generic because a bare `A extends B ? true : never` conditional resolves silently and never
// fails a build. `import type` keeps this file emit-free beyond the re-export, preserving the
// single-WASM-instantiation property LedgerEra.test.ts guards.
type Extends<A, B> = [A] extends [B] ? true : false;
type Assert<_T extends true> = void;
type _BindingIsComplete = Assert<Extends<typeof Bound, LedgerBinding>>;
