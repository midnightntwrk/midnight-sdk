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
import * as ContractRuntimeError from '../ContractRuntimeError.js';

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

/**
 * Instantiates the compactc-generated contract class from a {@link CompiledContract}.
 *
 * @remarks
 * `Effect.try`, not `Effect.sync`, and the declared error channel is load-bearing. The generated
 * constructor **throws** a `CompactError` when the supplied witnesses are missing, misspelled or
 * not functions — an ordinary mistake in a hand-written `contract.config.ts`, not an invariant
 * breach. Under `Effect.sync` that throw became a *defect* on an effect declared `Effect<C>`: it
 * passed `ContractExecutable`'s `ContractExecutionError` channel, passed any consumer's `catchAll`
 * over it, and in the CLI — which runs with `disableErrorReporting` — produced exit 1 with no
 * output at all. The `Effect.mapError` that sat at the call site looked like the guard and could
 * never fire, because it was mapping a `never`.
 *
 * The message names the contract and points at the witnesses, since those are the one part of a
 * `CompiledContract` the caller supplies.
 */
export const createContract: <C extends Contract<PS>, PS>(
  compiledContract: CompiledContract<C, PS>
) => Effect.Effect<C, ContractRuntimeError.ContractRuntimeError> = <C extends Contract<PS>, PS>(
  compiledContract: CompiledContract<C, PS>
) =>
  Effect.try({
    try: () => {
      const context = getContractContext(compiledContract);

      if (!context.ctor) throw new Error('the compiled contract carries no constructor');
      return new context.ctor(context.witnesses);
    },
    catch: (err) =>
      ContractRuntimeError.make(
        `Failed to construct contract '${compiledContract.tag}'; check the witnesses supplied by ` +
          'the contract configuration',
        err
      )
  });
