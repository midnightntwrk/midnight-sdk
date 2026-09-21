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

import { type RuntimeLine } from '../era.js';

/**
 * The contract every compact-runtime binding module (`v0_19.ts`, a future `v0_16.ts`, …) must
 * satisfy. `current.ts` asserts its bound module against this at compile time, so a binding that
 * misses a name the facade re-exports fails the build at the swap point — naming the binding —
 * rather than far downstream at some call site.
 *
 * Runtime names are typed `unknown` deliberately: the compact-runtime package's own declarations
 * are authoritative for their shapes, so this contract enforces *presence* of each name, not its
 * signature. Type-only exports (e.g. `Op`, `WitnessContext`) are erased at this level and are
 * checked by consumers' compilation instead.
 *
 * @internal
 */
export interface RuntimeBinding {
  readonly line: RuntimeLine;
  readonly CompactError: unknown;
  readonly ContractMaintenanceAuthority: unknown;
  readonly ContractState: unknown;
  readonly createCircuitContext: unknown;
  readonly createConstructorContext: unknown;
  readonly decodeZswapLocalState: unknown;
  readonly emptyZswapLocalState: unknown;
  readonly encodeZswapLocalState: unknown;
  readonly sampleSigningKey: unknown;
  readonly signatureVerifyingKey: unknown;
}
