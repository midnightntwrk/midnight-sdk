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

import { FileSystem, Path } from '@effect/platform';
import { CompiledContract, Contract, ZKConfiguration, ZKConfigurationReadError } from '@midnight-ntwrk/compact-js/effect';
import { Effect, Layer, Option } from 'effect';

const KEYS_FOLDER = 'keys';
const VERIFIER_EXT = '.verifier';
const COMPILER_FOLDER = 'compiler';
const CONTRACT_INFO_FILE = 'contract-info.json';

interface Circuit {
  readonly name: string;
  readonly pure: boolean;
  readonly hasVerifierKey: boolean;
}
interface ContractInfo {
  readonly circuits: Circuit[];
}

/**
 * Returns a function, that when invoked, will create a ZK asset reader over the file system.
 *
 * @param path A `Path` implementation.
 * @param fs A `FileSystem` implementation.
 * @returns A function that receives a `CompiledContract` instance and returns a ZK asset reader over `fs`.
 *
 * @internal
 */
const makeFileSystemReader =
  <C extends Contract.Contract<PS>, PS>(path: Path.Path, fs: FileSystem.FileSystem, baseAssetFolderPath: string) =>
  (compiledContract: CompiledContract.CompiledContract<C, PS>) =>
    // eslint-disable-next-line require-yield
    Effect.gen(function* () {
      const assetsPath = CompiledContract.getCompiledAssetsPath(compiledContract);
      const resolvedAssetsPath = path.resolve(baseAssetFolderPath, assetsPath);

      let cachedContractInfo: ContractInfo | undefined;
      const getContractInfo = Effect.gen(function* () {
        if (cachedContractInfo !== undefined) {
          return cachedContractInfo;
        }
        const contractInfoPath = path.join(resolvedAssetsPath, COMPILER_FOLDER, CONTRACT_INFO_FILE);
        const contractInfoData = yield* fs.readFileString(contractInfoPath);
        cachedContractInfo = JSON.parse(contractInfoData) as ContractInfo;
        return cachedContractInfo;
      });

      const getVerifierKey = (impureCircuitId: Contract.ImpureCircuitId<C>) =>
        Effect.gen(function* () {
          const contractInfo = yield* getContractInfo;
          const verifierKeyPath = path.join(resolvedAssetsPath, KEYS_FOLDER, `${impureCircuitId}${VERIFIER_EXT}`);
          const circuit = contractInfo.circuits.find((_) => _.name === impureCircuitId);

          if (!circuit) {
            return yield* Effect.fail(`Circuit '${impureCircuitId}' was not found in the contract manifest (${CONTRACT_INFO_FILE}).`);
          }
          // If the verifier key file exists, return it...
          if (yield* fs.exists(verifierKeyPath)) {
            return Option.some(Contract.VerifierKey(yield* fs.readFile(verifierKeyPath)));
          }
          // ...otherwise, check if the circuit manifest indicates that it has been compiled requiring a
          // verifier key (meaning it should exist)...
          // TODO: Uncomment the following lines once the contract manifest carries a property indicating whether
          // a verifier key was expected to be generated for the circuit.
          // if (circuit.verifiable) {
          //   return yield* Effect.fail(
          //     `Verifier key for circuit '${impureCircuitId}' was expected at path '${verifierKeyPath}', but the file does not exist.`
          //   );
          // }
          // ...otherwise, return none (the circuit is not verifiable and no verifier key will exist for it).
          return Option.none<Contract.VerifierKey>();
        }).pipe(
          Effect.mapError((err: unknown) =>
            ZKConfigurationReadError.make(compiledContract.tag, impureCircuitId, 'verifier-key', err)
          )
        );

      return {
        getVerifierKey,
        getVerifierKeys: (impureCircuitIds) =>
          Effect.forEach(
            impureCircuitIds,
            (impureCircuitId) =>
              getVerifierKey(impureCircuitId).pipe(
                Effect.map((verifierKey) => [impureCircuitId, verifierKey] as const)
              ),
            { concurrency: 'unbounded', discard: false }
          )
      } satisfies ZKConfiguration.ZKConfiguration.Reader<C, PS>;
    });

/**
 * A {@link ZKConfiguration.ZKConfiguration | ZKConfiguration} implementation that reads ZK assets from the
 * file system.
 *
 * @param baseAssetFolderPath A base path to a folder containing the compiled contract assets.
 *
 * @category layers
 */
export const layer = (baseAssetFolderPath = '.') => Layer.effect(
  ZKConfiguration.ZKConfiguration,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;

    return ZKConfiguration.ZKConfiguration.of({
      createReader: makeFileSystemReader(path, fs, baseAssetFolderPath)
    });
  })
);
