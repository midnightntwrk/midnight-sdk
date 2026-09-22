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
 * The **era-free** core of the `/effect` surface: modules whose runtime behaviour has no ledger or
 * compact-runtime dependency at all, so every era entry can re-export the same objects.
 *
 * @remarks
 * The distinction against `eraNeutralSurface.ts` is not stylistic. "Era-neutral" means *works on
 * whichever era the build bound* — those modules reach `Ledger.js`/`CompactRuntime.js` and so
 * resolve through each seam's `current.ts`. "Era-free" means the module graph never reaches either
 * facade, so the same compiled object is correct on every era simultaneously. Only the second kind
 * can be re-exported from an era-pinned entry without mislabelling what it returns.
 *
 * Membership is a verifiable property, not a judgement: take the transitive `import` closure of a
 * module in the **built** output (types erased) and check it contains neither `CompactRuntime.js`
 * nor `Ledger.js`. Two members look era-coupled in source and are not — `Contract.ts` and
 * `ContractConfigurationError.ts` import runtime types with `import type`, which is erased. Their
 * *type parameters* still name the bound era's shapes; that is a type-level inaccuracy for an older
 * era, tracked with the executable's parameterisation, and it does not make the values era-bound.
 *
 * `ContractExecutable` is deliberately **not** here: it is the one module in the public surface with
 * value-level imports of both facades, which is why `/v8/effect` cannot yet offer it
 * (midnight-sdk#388). The contract-event modules are also absent, but for the opposite reason —
 * they are era-free at run time yet meaningless on a line that cannot emit events, so they live in
 * `contractEventsSurface.ts` and are composed only by entries whose era supports them.
 *
 * Internal by design: consumers reach these through `@midnight-ntwrk/compact-js/effect` or an
 * era-pinned entry, and `package.json` `exports` blocks `./effect/internal/*` with `null`. The era
 * entry files under `src/v<N>` are package-internal source, so they may import it.
 *
 * Keep alphabetized, matching `effect/index.ts`.
 *
 * This docblock carries no internal-marker JSDoc tag: a module docblock attaches to the file's
 * first statement, so under `stripInternal` the marker deletes the first export below — silently,
 * since the ESM emit keeps it. Privacy comes from `package.json` `exports` blocking
 * `./effect/internal/*` instead, and `verify-exports` fails the build if the marker comes back.
 * See `internal/boundary.ts` for why this note does not spell the tag out.
 */
export * as CompactContext from '../CompactContext.js';
export * as CompiledContract from '../CompiledContract.js';
export * as Contract from '../Contract.js';
export * as ContractConfigurationError from '../ContractConfigurationError.js';
export * as ContractExecutableRuntime from '../ContractExecutableRuntime.js';
export * as ContractKeyLocation from '../ContractKeyLocation.js';
export * as ContractRuntimeError from '../ContractRuntimeError.js';
export * as MalformedHexPrefixError from '../MalformedHexPrefixError.js';
export * as ZKConfiguration from '../ZKConfiguration.js';
export * as ZKConfigurationReadError from '../ZKConfigurationReadError.js';
export * as ZKManifest from '../ZKManifest.js';
export * as ZKManifestError from '../ZKManifestError.js';
