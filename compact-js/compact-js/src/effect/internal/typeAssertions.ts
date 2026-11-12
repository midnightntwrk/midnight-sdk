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
 * Compile-time assertion helpers shared by both era seams.
 *
 * @remarks
 * These live above `internal/ledger/` and `internal/runtime/` for the same reason `internal/era.ts`
 * does: they belong to neither seam and importing them creates no binding point — this module
 * imports nothing at all, so it cannot reach a ledger or compact-runtime package. Hoisting them
 * also keeps the subtle reasoning in {@link Extends} in one place rather than in a copy per
 * `current.ts`.
 *
 * Types only, so every consumer's `import type` stays erased and the single-WASM-instantiation
 * property the era tests guard is preserved.
 *
 * @internal
 */

/**
 * Whether `A` is assignable to `B`, as a `true`/`false` type.
 *
 * @remarks
 * Tupled (`[A] extends [B]`) so the conditional does not distribute over a union operand: without
 * the tuples, a union `A` is checked member-wise and the result is a union of `true | false` rather
 * than a single verdict.
 *
 * @internal
 */
export type Extends<A, B> = [A] extends [B] ? true : false;

/**
 * Fails the build unless `_T` is `true`.
 *
 * @remarks
 * Routed through a constrained generic rather than written as a bare
 * `A extends B ? true : never` conditional: a bare conditional resolves silently to `never` and
 * never fails a build, so it reads as a guard while checking nothing. The constraint is what turns
 * a violation into an error, and the error names the assertion's own type alias.
 *
 * @internal
 */
export type Assert<_T extends true> = void;
