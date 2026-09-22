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

import { type Command } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { Effect, Option } from 'effect';

import * as CompiledContractReflection from '../CompiledContractReflection.js';
import * as InternalArgs from './args.js';
import * as InternalCommand from './command.js';
import { encodeZswapLocalStateObject } from './encodedZswapLocalStateSchema.js'
import type * as EraBinding from './era/binding.js';
import * as InternalOptions from './options.js';

/** @internal */
export type Args = Command.Command.ParseConfig<typeof Args>;
/** @internal */
export const Args = { args: InternalArgs.contractArgs };

/** @internal */
export type Options = Command.Command.ParseConfig<typeof Options>;
/** @internal */
export const Options = {
  signingKey: InternalOptions.signingKey,
  outputFilePath: InternalOptions.outputFilePath,
  outputPublicFilePath: InternalOptions.outputPublicFilePath,
  outputPrivateStateFilePath: InternalOptions.outputPrivateStateFilePath,
  outputZswapLocalStateFilePath: InternalOptions.outputZswapLocalStateFilePath
}

/**
 * Builds the `deploy` handler for one era.
 *
 * @param ledger The era's `Ledger` facade.
 * @param runtime The compact-runtime facade that era pairs with.
 *
 * @internal
 */
export const makeHandler: (
  ledger: EraBinding.CommandLedger,
  runtime: EraBinding.CommandRuntime
) => InternalCommand.CommandHandler<Args & Options> = (ledger, runtime) => {
  const { tryLedger, newIntent, serializeIntent } = InternalCommand.makeIntents(ledger);

  return (
    {
      outputFilePath,
      outputPublicFilePath,
      outputPrivateStateFilePath,
      outputZswapLocalStateFilePath,
      args
    },
    moduleSpec
  ) => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { module: { default: contractModule } } = moduleSpec;
    const contractReflector = yield* CompiledContractReflection.CompiledContractReflection;
    const argsParser = yield* contractReflector.createArgumentParser(contractModule.contractExecutable.compiledContract);
    const result = yield* contractModule.contractExecutable.initialize(
      contractModule.createInitialPrivateState(),
      ...(yield* argsParser.parseInitializationArgs(args))
    );
    // `as never` throughout: the executable's results and the facade's parameters are this era's own
    // types, which the handler deliberately does not name (see `era/binding.ts`). That the two
    // genuinely match is the job of `invocationHandler`'s era reconciliation, not of a cast.
    const ledgerContractState = yield* ledger.fromRuntimeContractState(result.public.contractState as never);
    const emptyIntent = yield* newIntent();
    const intent = yield* tryLedger(
      'Failed to add the contract deployment to the intent',
      () => emptyIntent.addDeploy(new ledger.ContractDeploy(ledgerContractState as never) as never)
    );

    // If the output public file path is provided, write the on-chain (public state) data to the specified file.
    if (Option.isSome(outputPublicFilePath)) {
      yield* fs.writeFile(
        Option.getOrThrow(outputPublicFilePath),
        yield* tryLedger(
          'Failed to serialize the initial contract state',
          () => ledgerContractState.serialize()
        )
      );
    }
    yield* fs.writeFile(
      outputFilePath,
      yield* serializeIntent(intent)
    );
    yield* fs.writeFileString(outputPrivateStateFilePath, JSON.stringify(result.private.privateState));
    yield* fs.writeFileString(
      outputZswapLocalStateFilePath,
      JSON.stringify(
        yield* encodeZswapLocalStateObject(
          // As in `circuitCommand`: the intent file is already written above, so an unwrapped throw
          // would be a defect leaving a partially-written output directory and reporting nothing.
          yield* runtime.tryRuntime(
            'Failed to encode the initial zswap local state',
            () => runtime.encodeZswapLocalState(result.private.zswapLocalState as never)
          )
        )
      )
    );
  }).pipe(
    Effect.mapError(
      (err) => ContractRuntimeError.make('Failed to initialize contract', err)
    )
  );
};
