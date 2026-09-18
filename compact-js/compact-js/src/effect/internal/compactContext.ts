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

import { Effect, type Types } from 'effect';

import type * as CompactContext from '../CompactContext.js';
import type { CompiledContract } from '../CompiledContract.js';
import { type Contract } from '../Contract.js';

// None of the declarations below carry an internal-marker JSDoc tag, deliberately.
// `CompiledContract`'s public interface indexes by `TypeId` and holds a `Partial<Context<C>>`, so
// under `stripInternal` the marker erases them from this module's `.d.ts` while
// `CompiledContract.d.ts` still names them — typings that only look sound because most consumers
// build with `skipLibCheck`. Privacy comes from `package.json` `exports` blocking
// `./effect/internal/*`; `verify-exports` fails the build if the marker comes back. See
// `internal/boundary.ts` for why this note does not spell the tag out.
export const TypeId = Symbol();
export type TypeId = typeof TypeId;

export interface Context<C extends Contract.Any>
  extends CompactContext.Witnesses<C>, CompactContext.CompiledAssetsPath {
    readonly ctor: Types.Ctor<C>;
  }

export const getContractContext: <C extends Contract<PS>, PS>(
  compiledContract: CompiledContract<C, PS>
) => Types.Simplify<Required<Context<C>>> = <C extends Contract<PS>, PS>(compiledContract: CompiledContract<C, PS>) =>
  compiledContract[TypeId] as Required<Context<C>>;

export const createContract: <C extends Contract<PS>, PS>(
  compiledContract: CompiledContract<C, PS>
) => Effect.Effect<C> = <C extends Contract<PS>, PS>(compiledContract: CompiledContract<C, PS>) =>
  Effect.sync(() => {
    const context = getContractContext(compiledContract);

    if (!context.ctor) throw new Error('Invalid CompactContext (missing constructor)');
    return new context.ctor(context.witnesses);
  });
