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

import { join } from 'node:path';

import { type Command } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { Contract, type ContractExecutable, ContractKeyLocation, ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { FileSystemContractStateProvider } from '@midnight-ntwrk/compact-js-node/effect';
import { decodeZswapLocalState, type EncodedZswapLocalState,
  encodeZswapLocalState, type StateValue } from '@midnight-ntwrk/compact-runtime';
import {
  ChargedState as LedgerChargedState,
  communicationCommitmentRandomness,
  ContractCallPrototype,
  type ContractState as LedgerContractState,
  Intent,
  StateValue as LedgerStateValue,
} from '@midnightntwrk/ledger-v9';
import { type ConfigError, Console,Duration, Effect, Option } from 'effect';

import * as CompiledContractReflection from '../CompiledContractReflection.js';
import { type ConfigCompiler } from '../ConfigCompiler.js';
import * as InternalArgs from './args.js';
import * as InternalCommand from './command.js';
import * as ContractState from './contractState.js';
import { decodeZswapLocalStateObject, encodeZswapLocalStateObject } from './encodedZswapLocalStateSchema.js'
import { stringifyCircuitOutput } from './json.js';
import * as LedgerParameters from './ledgerParameters.js';
import * as InternalOptions from './options.js';

/** @internal */
export type Args = Command.Command.ParseConfig<typeof Args>;
/** @internal */
export const Args = { 
  address: InternalArgs.contractAddress,
  circuitId: InternalArgs.circuitId,
  args: InternalArgs.contractArgs
};

/** @internal */
export type Options = Command.Command.ParseConfig<typeof Options>;

/**
 * A placeholder block hash for the cross-contract state provider. A {@link
 * FileSystemContractStateProvider} resolves state purely by address and ignores the block hash,
 * but the runtime requires one to be present when a state provider is supplied.
 *
 * @internal
 */
const PLACEHOLDER_BLOCK_HASH = '0'.repeat(64);

/** @internal */
export const Options = {
  inputFilePath: InternalOptions.inputFilePath,
  inputPrivateStateFilePath: InternalOptions.inputPrivateStateFilePath,
  inputZswapLocalStateFilePath: InternalOptions.inputZswapLocalStateFilePath,
  inputLedgerParamsFilePath: InternalOptions.inputLedgerParamsFilePath,
  inputContractStatesDirPath: InternalOptions.inputContractStatesDirPath,
  outputContractStatesDirPath: InternalOptions.outputContractStatesDirPath,
  outputFilePath: InternalOptions.outputFilePath,
  outputPublicFilePath: InternalOptions.outputPublicFilePath,
  outputPrivateStateFilePath: InternalOptions.outputPrivateStateFilePath,
  outputZswapLocalStateFilePath: InternalOptions.outputZswapLocalStateFilePath,
  outputResultFilePath: InternalOptions.outputResultFilePath,
  outputEventsFilePath: InternalOptions.outputEventsFilePath
}

/** @internal */
export const handler: (inputs: Args & Options, moduleSpec: ConfigCompiler.ModuleSpec) =>
  Effect.Effect<
    void,
    ContractExecutable.ContractExecutionError | ConfigError.ConfigError,
    CompiledContractReflection.CompiledContractReflection | FileSystem.FileSystem
  > =
  (
    {
      address,
      circuitId,
      args,
      inputFilePath,
      inputPrivateStateFilePath,
      inputZswapLocalStateFilePath,
      inputLedgerParamsFilePath,
      inputContractStatesDirPath,
      outputContractStatesDirPath,
      outputFilePath,
      outputPublicFilePath,
      outputPrivateStateFilePath,
      outputZswapLocalStateFilePath,
      outputResultFilePath,
      outputEventsFilePath
    },
    moduleSpec
  ) => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { module: { default: contractModule } } = moduleSpec;
    const contractReflector = yield* CompiledContractReflection.CompiledContractReflection;
    const argsParser = yield* contractReflector.createArgumentParser(contractModule.contractExecutable.compiledContract);
    const ledgerContractState = yield* fs.readFile(inputFilePath).pipe(
      Effect.flatMap(ContractState.asLedgerContractStateFromBytes)
    );
    const privateState = JSON.parse(yield* fs.readFileString(inputPrivateStateFilePath));
    const encodedZswapLocalState = Option.map(
      inputZswapLocalStateFilePath,
      (filePath) => fs.readFileString(filePath).pipe(
        Effect.flatMap((str) => decodeZswapLocalStateObject(JSON.parse(str))
      ))
    );
    const decodedLedgerParameters = Option.map(
      inputLedgerParamsFilePath,
      (filePath) => fs.readFile(filePath).pipe(
        Effect.flatMap(LedgerParameters.asLedgerParameters)
      )
    );

    // When a contract-states directory is supplied, the circuit may make cross-contract calls:
    // their target states are resolved lazily, on demand, from the directory.
    const contractStateProvider = Option.map(inputContractStatesDirPath, (dir) =>
      FileSystemContractStateProvider.make(dir)
    );

    const baseCircuitContext = {
      address,
      contractState: yield* ContractState.asContractState(ledgerContractState),
      privateState: privateState ?? contractModule.createInitialPrivateState(),
      zswapLocalState: Option.isSome(encodedZswapLocalState)
        ? decodeZswapLocalState((yield* encodedZswapLocalState.value) as EncodedZswapLocalState)
        : undefined,
      ledgerParameters: Option.isSome(decodedLedgerParameters)
        ? yield* decodedLedgerParameters.value
        : undefined
    };

    const result = yield* contractModule.contractExecutable.circuit(
      Contract.ProvableCircuitId(circuitId),
      Option.match(contractStateProvider, {
        onSome: (stateProvider) => ({ ...baseCircuitContext, stateProvider, parentBlockHash: PLACEHOLDER_BLOCK_HASH }),
        onNone: () => baseCircuitContext
      }),
      ...(yield* argsParser.parseCircuitArgs(Contract.ProvableCircuitId(circuitId), args))
    );
    yield* Console.log(stringifyCircuitOutput(result.result, 2));
    // Build one contract-call prototype per call in the trace (callees first, the root call
    // last). Each call's `ContractOperation` comes from that contract's on-chain state: the root
    // call uses the input state; sub-calls are read from the contract-states directory.
    let intent = Intent.new(yield* InternalCommand.ttl(Duration.minutes(10)));
    // The updated ledger state of each cross-contract *callee*, keyed by address. The root
    // contract is deliberately excluded — its updated state is the job of `--output-oc`, mirroring
    // how the root's input state comes from `--input` rather than `--contract-states-dir`. A callee
    // may be called more than once; iterating in trace order means the last write for an address
    // holds its final state. `ledgerState` carries the contract's operations/maintenance authority
    // (unchanged by execution); `data` is its post-execution state value.
    const finalCalleeStates = new Map<string, { readonly ledgerState: LedgerContractState; readonly data: StateValue }>();
    for (const call of result.calls) {
      let callLedgerState: LedgerContractState;
      if (call.contractAddress === address) {
        callLedgerState = ledgerContractState;
      } else if (Option.isSome(inputContractStatesDirPath)) {
        const bytes = yield* fs.readFile(join(inputContractStatesDirPath.value, call.contractAddress));
        callLedgerState = yield* ContractState.asLedgerContractStateFromBytes(bytes);
      } else {
        // A sub-call can only occur when a state provider (i.e. a contract-states directory) was
        // supplied, so this branch is unreachable in practice; fail loudly if it is reached.
        return yield* ContractRuntimeError.make(
          `Cannot resolve the operation for cross-contract call to '${call.contractAddress}': ` +
          `no --contract-states-dir was provided.`
        );
      }
      const callOperation = yield* ContractState.operationForCircuit(callLedgerState, call.circuitId, call.contractAddress);
      intent = intent.addCall(new ContractCallPrototype(
        call.contractAddress,
        call.circuitId,
        callOperation,
        call.public.partitionedTranscript[0],
        call.public.partitionedTranscript[1],
        call.private.privateTranscriptOutputs,
        call.private.input,
        call.private.output,
        Option.match(call.communicationCommitment, {
          onSome: (c) => c.commCommRand,
          onNone: () => communicationCommitmentRandomness()
        }),
        // The canonical key location routes the proof for this call to the key material of the
        // specific deployed circuit (by contract address and verifier-key content), so that
        // identically named circuits across contracts in one transaction cannot collide.
        ContractKeyLocation.encodeContractKeyLocation({
          contractAddress: call.contractAddress,
          circuitId: call.circuitId,
          verifierKeyHash: ContractKeyLocation.hashVerifierKey(callOperation.verifierKey)
        })
      ));
      // Record callee states only; the root's updated state is handled by `--output-oc`.
      if (call.contractAddress !== address) {
        finalCalleeStates.set(call.contractAddress, { ledgerState: callLedgerState, data: call.public.contractState });
      }
    }
    const rootCall = result.calls[result.calls.length - 1];

    // If the output public file path is provided, write the on-chain (public state) data to the specified file.
    if (Option.isSome(outputPublicFilePath)) {
      ledgerContractState.data = new LedgerChargedState(
        LedgerStateValue.decode(rootCall.public.contractState.encode())
      );
      yield* fs.writeFile(outputPublicFilePath.value, ledgerContractState.serialize());
    }

    // If an output contract-states directory is provided, write the updated ledger state of each
    // cross-contract callee, each file named by its address. Combined with `--output-oc` for the
    // root, this lets callers thread state across cross-contract calls without applying the
    // transaction: feed this directory back as `--contract-states-dir` (and the root via `--input`).
    if (Option.isSome(outputContractStatesDirPath)) {
      const dir = outputContractStatesDirPath.value;
      yield* fs.makeDirectory(dir, { recursive: true });
      for (const [contractAddress, { ledgerState, data }] of finalCalleeStates) {
        ledgerState.data = new LedgerChargedState(LedgerStateValue.decode(data.encode()));
        yield* fs.writeFile(join(dir, contractAddress), ledgerState.serialize());
      }
    }
    yield* fs.writeFileString(outputResultFilePath, stringifyCircuitOutput(result.result));
    yield* fs.writeFile(outputFilePath, intent.serialize());
    yield* fs.writeFileString(outputPrivateStateFilePath, JSON.stringify(result.privateState));
    yield* fs.writeFileString(
      outputZswapLocalStateFilePath,
      JSON.stringify(
        yield* encodeZswapLocalStateObject(encodeZswapLocalState(result.zswapLocalState))
      )
    );
    // Contract log events (MIP-0002) are non-consensus output; only write them when a destination
    // is requested.
    if (Option.isSome(outputEventsFilePath)) {
      yield* fs.writeFileString(
        outputEventsFilePath.value,
        stringifyCircuitOutput(result.events)
      );
    }
  }).pipe(
    Effect.mapError(
      (err) => ContractRuntimeError.make('Failed to invoke circuit', err)
    )
  );
