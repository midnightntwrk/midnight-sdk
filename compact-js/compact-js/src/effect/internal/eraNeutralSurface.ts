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
 * The **era-neutral** half of the `/effect` surface: every module that any ledger era this
 * codebase binds can support.
 *
 * @remarks
 * Split out from `effect/index.ts` so an era-scoped entry composes only the levels its runtime
 * line can actually provide (midnight-sdk#387/#388). A ledger 8 entry would re-export exactly
 * this module and nothing more; the ledger 9 entry adds `contractEventsSurface.ts` on top.
 *
 * #388 requires that a member which cannot exist on an older era is *absent* from that era's
 * entry rather than present and failing at run time. Omission is not merely the tidy option here
 * — the contract-event modules import `LogEvent` from the compact-runtime seam, which
 * compact-runtime 0.16 does not have, so an entry that re-exported them would not compile at all.
 * `LedgerEra.test.ts` asserts the event modules stay out of this barrel, and that everything in it
 * remains reachable from the era entry.
 *
 * Internal by design: consumers reach these through `@midnight-ntwrk/compact-js/effect` or an
 * era-pinned entry, and `package.json` `exports` blocks `./effect/internal/*` with `null`. The
 * era entry files under the `src/v<N>` directories are package-internal source, so they may
 * import it.
 *
 * Keep alphabetized, matching `effect/index.ts`.
 *
 * @internal
 */
export * as CompactContext from '../CompactContext.js';
export * as CompactRuntime from '../CompactRuntime.js';
export * as CompiledContract from '../CompiledContract.js';
export * as Contract from '../Contract.js';
export * as ContractConfigurationError from '../ContractConfigurationError.js';
export * as ContractExecutable from '../ContractExecutable.js';
export * as ContractExecutableRuntime from '../ContractExecutableRuntime.js';
export * as ContractKeyLocation from '../ContractKeyLocation.js';
export * as ContractRuntimeError from '../ContractRuntimeError.js';
export * as Ledger from '../Ledger.js';
export * as MalformedHexPrefixError from '../MalformedHexPrefixError.js';
export * as ZKConfiguration from '../ZKConfiguration.js';
export * as ZKConfigurationReadError from '../ZKConfigurationReadError.js';
export * as ZKManifest from '../ZKManifest.js';
export * as ZKManifestError from '../ZKManifestError.js';
