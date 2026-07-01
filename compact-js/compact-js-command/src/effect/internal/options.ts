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

import { type Command, Options } from '@effect/cli';
import { Path } from '@effect/platform';
import * as CoinPublicKey from '@midnight-ntwrk/platform-js/effect/CoinPublicKey';
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { ConfigProvider, Effect, Option,Schema } from 'effect';

/** @internal */
export const config = Options.file('config', { exists: 'either' }).pipe(
  Options.withAlias('c'),
  Options.withDefault('contract.config.ts'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const coinPublicKey = Options.text('coin-public').pipe(
  Options.withAlias('p'),
  Options.withDescription('A user public key capable of receiving Zswap coins, hex or Bech32m encoded.'),
  Options.withSchema(Schema.Union(
    Schema.String.pipe(Schema.fromBrand(CoinPublicKey.Hex)),
    Schema.String.pipe(Schema.fromBrand(CoinPublicKey.Bech32m))
  ).annotations({ title: 'coin-public' })),
  Options.optional
);

/** @internal */
export const signingKey = Options.text('signing').pipe(
  Options.withAlias('s'),
  Options.withDescription('A public BIP-340 signing key, hex encoded.'),
  Options.withSchema(Schema.String.pipe(Schema.fromBrand(SigningKey.Value)).annotations({ title: 'signing' })),
  Options.optional
);

/** @internal */
export const outputFilePath = Options.file('output', { exists: 'either' }).pipe(
  Options.withAlias('o'),
  Options.withDescription('A file path of where the generated \'Intent\' data should be written.'),
  Options.withDefault('output.bin'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const outputPublicFilePath = Options.file('output-oc', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where the generated \'on-chain\' (on-chain) data should be written.'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath)))),
  Options.optional
);

/** @internal */
export const outputPrivateStateFilePath = Options.file('output-ps', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where the generated \'PrivateState\' data should be written.'),
  Options.withDefault('output.ps.json'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const outputZswapLocalStateFilePath = Options.file('output-zswap', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where the generated \'ZswapLocalState\' data should be written.'),
  Options.withDefault('zswap.json'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const outputResultFilePath = Options.file('output-result', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where the invoked circuit result data should be written.'),
  Options.withDefault('result.json'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const inputFilePath = Options.file('input', { exists: 'either' }).pipe(
  Options.withAlias('i'),
  Options.withDescription('A file path of where the current onchain (or ledger), state data can be read.'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const inputPrivateStateFilePath = Options.file('input-ps', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where the current private state data can be read.'),
  Options.mapEffect((filePath) => Path.Path.pipe(Effect.map((path) => path.resolve(filePath))))
);

/** @internal */
export const inputZswapLocalStateFilePath = Options.file('input-zswap', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where the current Zswap local state data can be read.'),
  Options.optional,
  Options.mapEffect((_) => Option.match(_, {
    onSome: (filePath) => Path.Path.pipe(Effect.map((path) => Option.some(path.resolve(filePath)))),
    onNone: () => Effect.succeed(Option.none())
  }))
);

/** @internal */
export const inputLedgerParamsFilePath = Options.file('input-ledger-params', { exists: 'either' }).pipe(
  Options.withDescription('A file path of where optional ledger parameters data can be read.'),
  Options.optional,
  Options.mapEffect((_) => Option.match(_, {
    onSome: (filePath) => Path.Path.pipe(Effect.map((path) => Option.some(path.resolve(filePath)))),
    onNone: () => Effect.succeed(Option.none())
  }))
);

/** @internal */
export const outputContractStatesDirPath = Options.directory('output-contract-states-dir', { exists: 'either' }).pipe(
  Options.withDescription(
    'A directory into which the updated ledger state of each cross-contract callee is written, each file ' +
    'named by its contract address. The root contract\'s updated state is written via --output-oc instead. ' +
    'Lets state be threaded across cross-contract calls without applying the transaction (feed this directory ' +
    'back as --contract-states-dir). The directory is created if absent.'
  ),
  Options.optional,
  Options.mapEffect((_) => Option.match(_, {
    onSome: (dirPath) => Path.Path.pipe(Effect.map((path) => Option.some(path.resolve(dirPath)))),
    onNone: () => Effect.succeed(Option.none())
  }))
);

/** @internal */
export const inputContractStatesDirPath = Options.directory('contract-states-dir', { exists: 'yes' }).pipe(
  Options.withDescription(
    'A directory of ledger-serialized contract-state files, each named by its contract address, used to ' +
    'resolve the targets of cross-contract calls. When provided, the invoked circuit may call into other ' +
    'contracts and the resulting intent will include a call for each.'
  ),
  Options.optional,
  Options.mapEffect((_) => Option.match(_, {
    onSome: (dirPath) => Path.Path.pipe(Effect.map((path) => Option.some(path.resolve(dirPath)))),
    onNone: () => Effect.succeed(Option.none())
  }))
);

export type ConfigOptionInput = Command.Command.ParseConfig<{
  config: typeof config;
}>;

/**
 * All the options that contribute to the underlying `ConfigurationProvider`.
 *
 * @see {@link asConfigProvider}
 * @internal
 */
export type AllConfigurableOptionInputs = Command.Command.ParseConfig<{
  coinPublicKey: typeof coinPublicKey,
  signingKey: typeof signingKey
}>;

export const asConfigProvider: (configurableOptions: Partial<AllConfigurableOptionInputs>) => ConfigProvider.ConfigProvider =
  (configurableOptions) => ConfigProvider.fromJson({
    keys: {
      coinPublic: Option.getOrUndefined(configurableOptions.coinPublicKey ?? Option.none()),
      signing: Option.getOrUndefined(configurableOptions.signingKey ?? Option.none())
    }
  });
