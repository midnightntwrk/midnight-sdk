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
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
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
  newSigningKey: InternalArgs.signingKey
};

/** @internal */
export type Options = Command.Command.ParseConfig<typeof Options>;
/** @internal */
export const Options = {
  ...InternalMaintainCommand.Options,
  signingKey: InternalOptions.signingKey
};

/**
 * Builds the `maintain contract` handler for one era.
 *
 * @param ledger The era's `Ledger` facade. This command touches no compact-runtime API of its own —
 * the executable does that behind the maintenance call — so it takes only the ledger half.
 *
 * @internal
 */
export const makeHandler: (
  ledger: EraBinding.CommandLedger
) => InternalCommand.CommandHandler<Args & Options> = (ledger) => {
  const { tryLedger, newIntent, serializeIntent } = InternalCommand.makeIntents(ledger);

  return ({ address, inputFilePath, newSigningKey, outputFilePath }, moduleSpec) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const {
        module: { default: contractModule }
      } = moduleSpec;
      const ledgerContractState = yield* fs
        .readFile(inputFilePath)
        .pipe(Effect.flatMap(ledger.contractStateFromBytes));
      const result = yield* contractModule.contractExecutable.replaceContractMaintenanceAuthority(
        Option.some(SigningKey.make(newSigningKey)),
        {
          address,
          contractState: yield* ledger.toRuntimeContractState(ledgerContractState as never)
        } satisfies EraBinding.CommandContractContext as never
      );
      const emptyIntent = yield* newIntent();
      const intent = yield* tryLedger(
        'Failed to add the maintenance update to the intent',
        () => emptyIntent.addMaintenanceUpdate(result.public.maintenanceUpdate as never)
      );
      yield* fs.writeFile(
        outputFilePath,
        yield* serializeIntent(intent)
      );
    }).pipe(Effect.mapError((err) => ContractRuntimeError.make('Failed to apply maintenance operation', err)));
};
