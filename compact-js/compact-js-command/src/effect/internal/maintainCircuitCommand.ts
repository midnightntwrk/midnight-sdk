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
import { Contract, ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { Effect, Option } from 'effect';

import * as InternalArgs from './args.js';
import * as InternalCommand from './command.js';
import type * as EraBinding from './era/binding.js';
import * as InternalMaintainCommand from './maintainCommand.js';
import * as InternalOptions from './options.js';

/** @internal */
export type Args = Command.Command.ParseConfig<typeof Args>;
/** @internal */
export const Args = {
  ...InternalMaintainCommand.Args,
  circuitId: InternalArgs.circuitId,
  verifierKeyPath: InternalArgs.verifierKeyPath
};

/** @internal */
export type Options = Command.Command.ParseConfig<typeof Options>;
/** @internal */
export const Options = {
  ...InternalMaintainCommand.Options,
  signingKey: InternalOptions.signingKey,
}

/**
 * Builds the `maintain circuit` handler for one era.
 *
 * @param ledger The era's `Ledger` facade. As with `maintain contract`, no compact-runtime API is
 * reached from here directly.
 *
 * @internal
 */
export const makeHandler: (
  ledger: EraBinding.CommandLedger
) => InternalCommand.CommandHandler<Args & Options> = (ledger) => {
  const { tryLedger, newIntent, serializeIntent } = InternalCommand.makeIntents(ledger);

  return (
    { inputFilePath, outputFilePath, address, circuitId, verifierKeyPath },
    moduleSpec
  ) => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { module: { default: contractModule } } = moduleSpec;
    const { contractExecutable } = contractModule;
    const ledgerContractState = yield* fs.readFile(inputFilePath).pipe(
      Effect.flatMap(ledger.contractStateFromBytes)
    );
    const contractContext = {
      address,
      contractState: yield* ledger.toRuntimeContractState(ledgerContractState as never)
    } satisfies EraBinding.CommandContractContext;
    const result = yield* Option.match(verifierKeyPath, {
      onSome: (filePath) => fs.readFile(filePath).pipe(
        Effect.flatMap((data) => contractExecutable.addOrReplaceContractOperation(
          Contract.ProvableCircuitId(circuitId),
          Contract.VerifierKey(data),
          contractContext as never
        ))
      ),
      onNone: () => contractExecutable.removeContractOperation(
        Contract.ProvableCircuitId(circuitId),
        contractContext as never
      )
    });
    const emptyIntent = yield* newIntent();
    const intent = yield* tryLedger(
      'Failed to add the maintenance update to the intent',
      () => emptyIntent.addMaintenanceUpdate(result.public.maintenanceUpdate as never)
    );
    yield* fs.writeFile(
      outputFilePath,
      yield* serializeIntent(intent)
    );
  }).pipe(
    Effect.mapError(
      (err) => ContractRuntimeError.make('Failed to apply maintenance operation', err)
    )
  );
};
