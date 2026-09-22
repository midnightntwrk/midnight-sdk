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
 * Compile-time conformance for **every** compact-runtime binding, bound or not — the twin of
 * `internal/ledger/conformance.ts`, and for the same reason: `current.ts` asserts only the line it
 * re-exports, so an unbound binding could rot until the day someone repoints it.
 *
 * @remarks
 * Two things are checked per binding, plus one negative check that carries real policy:
 *
 * 1. **Core presence** — `typeof M extends RuntimeBinding`.
 * 2. **Relationships** — `RuntimeBindingViolations<typeof M>` is `never`.
 * 3. **Capability** — whether the line satisfies {@link CallTreeRuntimeBinding}. For 0.16 this is
 *    asserted *false*. That is the gate keeping contract events and cross-contract calls off the
 *    ledger 8 era, so it is stated here as an invariant rather than left implicit: if a future
 *    edit made 0.16 appear to satisfy the capability, this file fails the build.
 *
 * `import type` only: this module is erased entirely, so listing a second runtime line here costs
 * no bundle size and cannot instantiate a second copy of the WASM.
 *
 * @internal
 */
import { type LogEvent as ContractLogEvent } from '../../ContractLog.js';
import { type CallTreeRuntimeBinding, type RuntimeBinding, type RuntimeBindingViolations } from './binding.js';
import type * as V0_16 from './v0_16.js';
import type * as V0_19 from './v0_19.js';

// Routed through a constrained generic because a bare `A extends B ? true : never` conditional
// resolves silently and never fails a build.
type Extends<A, B> = [A] extends [B] ? true : false;
type Assert<_T extends true> = void;

// `never` is the only inhabitant of `never`, so a binding with violations instantiates this with a
// union of message literals and fails the build quoting the relationship that broke.
type AssertNoViolations<_V extends never> = void;

type _V0_16Conforms = Assert<Extends<typeof V0_16, RuntimeBinding>>;
type _V0_16NoViolations = AssertNoViolations<RuntimeBindingViolations<typeof V0_16>>;
// Asserted FALSE deliberately — see the capability note above. Do not "fix" this to `true`.
type _V0_16HasNoCallTree = Assert<Extends<Extends<typeof V0_16, CallTreeRuntimeBinding>, false>>;

// --- compact-runtime 0.19 (ledger 9 era; bound by `current.ts`) ---------------------------------
type _V0_19Conforms = Assert<Extends<typeof V0_19, RuntimeBinding>>;
type _V0_19NoViolations = AssertNoViolations<RuntimeBindingViolations<typeof V0_19>>;
type _V0_19HasCallTree = Assert<Extends<typeof V0_19, CallTreeRuntimeBinding>>;

// `ContractLog` decodes events era-free, against the structural minimum it reads rather than
// against a line's own `LogEvent` — which is what stops an era-pinned entry's decoder from
// following `current.ts`. This is what keeps that minimum honest: every line that *can* emit events
// must still satisfy it, so a line whose `LogEvent` gains a required field, renames `eventType`, or
// changes the `EncodedStateValue` arms fails here rather than silently decoding to degraded events
// at run time. Only the call-tree lines are checked, because a line with no events has no
// `LogEvent` to compare (0.16's is `never`, which satisfies anything).
type _V0_19LogEventDecodable = Assert<Extends<V0_19.LogEvent, ContractLogEvent>>;
