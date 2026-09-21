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
import { type PlatformError } from '@effect/platform/Error';
import { CompactRuntime, Contract, type ContractExecutable, ContractKeyLocation, ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import { FileSystemContractStateProvider } from '@midnight-ntwrk/compact-js-node/effect';
import { Array, type ConfigError, Console, Effect, Option } from 'effect';

import * as CompiledContractReflection from '../CompiledContractReflection.js';
import { type ConfigCompiler } from '../ConfigCompiler.js';
import * as InternalArgs from './args.js';
import * as InternalCommand from './command.js';
import { decodeZswapLocalStateObject, encodeZswapLocalStateObject } from './encodedZswapLocalStateSchema.js'
import { stringifyCircuitOutput } from './json.js';
import * as InternalOptions from './options.js';

/** @internal */
export type Args = Command.Command.ParseConfig<typeof Args>;
/** @internal */
export const Args = { 
  address: InternalArgs.contractAddress,
  circuitId: InternalArgs.circuitId,
  args: InternalArgs.contractArgs
};

/**
 * Reads and parses a JSON input file, naming the file in the failure.
 *
 * @remarks
 * `JSON.parse` throws, and both call sites below sit in an `Effect.gen` body or an `Effect.flatMap`
 * callback where a throw is a *defect*: it escapes {@link InternalCommand.invocationHandler}'s
 * `catchAll` and the CLI, running with `disableErrorReporting`, exits non-zero printing nothing.
 * A truncated or empty input file is ordinary — this handler writes `--output-ps` *after*
 * `--output`, so an interrupted run leaves exactly that state behind.
 *
 * @internal
 */
const readJsonFile = (
  fs: FileSystem.FileSystem,
  filePath: string
): Effect.Effect<any, ContractRuntimeError.ContractRuntimeError | PlatformError> => // eslint-disable-line @typescript-eslint/no-explicit-any
  fs.readFileString(filePath).pipe(
    Effect.flatMap((str) =>
      Effect.try({
        try: () => JSON.parse(str),
        catch: (err) => ContractRuntimeError.make(`'${filePath}' does not contain valid JSON`, err)
      })
    )
  );

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
      Effect.flatMap(Ledger.contractStateFromBytes)
    );
    const rawPrivateState = yield* readJsonFile(fs, inputPrivateStateFilePath);
    // `JSON.parse('null')` returns `null` rather than throwing, so `readJsonFile` cannot catch this
    // one, and `--input-ps` is required (unlike `--input-zswap`): a `null` payload is never the
    // user asking for a fresh state. There is exactly one contract shape for which it is faithful —
    // one whose private state *is* `undefined`, which JSON cannot encode any other way. For every
    // other contract it means the file has lost the state it was meant to carry, and substituting
    // `createInitialPrivateState()` runs the circuit against an invented state, writes a
    // well-formed signed intent, and exits 0: the user finds out on chain, with nothing pointing
    // back at the state file. `createInitialPrivateState()` is the only thing that tells the two
    // apart.
    if (rawPrivateState === null || rawPrivateState === undefined) {
      const initialPrivateState = yield* Effect.try({
        try: () => contractModule.createInitialPrivateState(),
        catch: (err) => ContractRuntimeError.make('Failed to create an initial private state for the contract', err)
      });
      if (initialPrivateState !== undefined) {
        return yield* ContractRuntimeError.make(
          `'${inputPrivateStateFilePath}' contains no private state (the file holds JSON 'null'), but this ` +
            `contract has one. Supply the private state written by a previous invocation, or the contract's ` +
            `initial private state if it has not run yet.`
        );
      }
    }
    // Guarded above: `null` here can only be the JSON encoding of a contract with no private state.
    const privateState = rawPrivateState ?? undefined;
    const encodedZswapLocalState = Option.map(
      inputZswapLocalStateFilePath,
      (filePath) => readJsonFile(fs, filePath).pipe(
        Effect.flatMap(decodeZswapLocalStateObject),
        // `EncodedZswapLocalStateSchema` validates shape only — no length constraint on the key or
        // the coin nonces/colours, and `value` is any bigint — so a hand-edited or cross-network
        // file passes it and is rejected by the runtime instead. The decode belongs here, where
        // `filePath` is in scope to name in the failure; left unwrapped in the `Effect.gen` body
        // below it would be a defect, and the CLI would exit non-zero printing nothing at all.
        Effect.flatMap((encoded) =>
          CompactRuntime.tryRuntime(
            `Failed to decode the zswap local state read from '${filePath}'`,
            () => CompactRuntime.decodeZswapLocalState(encoded)
          )
        )
      )
    );
    const decodedLedgerParameters = Option.map(
      inputLedgerParamsFilePath,
      (filePath) => fs.readFile(filePath).pipe(
        Effect.flatMap(Ledger.parametersFromBytes)
      )
    );

    // When a contract-states directory is supplied, the circuit may make cross-contract calls:
    // their target states are resolved lazily, on demand, from the directory.
    const contractStateProvider = Option.map(inputContractStatesDirPath, (dir) =>
      FileSystemContractStateProvider.make(dir)
    );

    const baseCircuitContext = {
      address,
      contractState: yield* Ledger.toRuntimeContractState(ledgerContractState),
      privateState,
      zswapLocalState: Option.isSome(encodedZswapLocalState)
        ? yield* encodedZswapLocalState.value
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
    // last), folding them into a single intent. Each call's `ContractOperation` comes from that
    // contract's on-chain state: the root call uses the input state; sub-calls are read from the
    // contract-states directory.
    //
    // `finalCalleeStates` is the updated ledger state of each cross-contract *callee*, keyed by
    // address. The root contract is deliberately excluded — its updated state is the job of
    // `--output-oc`, mirroring how the root's input state comes from `--input` rather than
    // `--contract-states-dir`. A callee may be called more than once; folding in trace order means
    // the last write for an address holds its final state. `ledgerState` carries the contract's
    // operations/maintenance authority (unchanged by execution); `data` is its post-execution
    // state value.
    const { intent, finalCalleeStates } = yield* Effect.reduce(
      result.calls,
      {
        intent: yield* InternalCommand.newIntent(),
        finalCalleeStates: new Map<string, { readonly ledgerState: Ledger.ContractState; readonly data: CompactRuntime.StateValue }>()
      },
      (acc, call) =>
        Effect.gen(function* () {
          let callLedgerState: Ledger.ContractState;
          if (call.contractAddress === address) {
            callLedgerState = ledgerContractState;
          } else if (Option.isSome(inputContractStatesDirPath)) {
            const filePath = join(inputContractStatesDirPath.value, call.contractAddress);
            const bytes = yield* fs.readFile(filePath);
            callLedgerState = yield* Ledger.contractStateFromBytes(bytes).pipe(
              Effect.mapError((err) =>
                ContractRuntimeError.make(
                  `Failed to read contract state for '${call.contractAddress}' from '${filePath}' ` +
                    `(expected ledger era ${Ledger.era.ledger} encoding)`,
                  err
                )
              )
            );
          } else {
            // A sub-call can only occur when a state provider (i.e. a contract-states directory) was
            // supplied, so this branch is unreachable in practice; fail loudly if it is reached.
            return yield* ContractRuntimeError.make(
              `Cannot resolve the operation for cross-contract call to '${call.contractAddress}': ` +
              `no --contract-states-dir was provided.`
            );
          }
          const callOperation = yield* Ledger.operationForCircuit(callLedgerState, call.circuitId, call.contractAddress);
          const nextIntent = yield* InternalCommand.tryLedger(
            `Failed to add the call to '${call.circuitId}' on '${call.contractAddress}' to the intent`,
            () => acc.intent.addCall(new Ledger.ContractCallPrototype(
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
                onNone: () => Ledger.communicationCommitmentRandomness()
              }),
              // The canonical key location routes the proof for this call to the key material of the
              // specific deployed circuit (by contract address and verifier-key content), so that
              // identically named circuits across contracts in one transaction cannot collide.
              ContractKeyLocation.encodeContractKeyLocation({
                contractAddress: call.contractAddress,
                circuitId: call.circuitId,
                verifierKeyHash: ContractKeyLocation.hashVerifierKey(callOperation.verifierKey)
              })
            ))
          );
          // Record callee states only; the root's updated state is handled by `--output-oc`.
          const nextFinalCalleeStates = call.contractAddress === address
            ? acc.finalCalleeStates
            : new Map(acc.finalCalleeStates).set(call.contractAddress, {
                ledgerState: callLedgerState,
                data: call.public.contractState
              });
          return { intent: nextIntent, finalCalleeStates: nextFinalCalleeStates };
        })
    );
    // The root call is always the last entry in the trace (callees first, root last); an empty
    // trace would leave it absent, which is an invariant breach rather than a user error.
    const maybeRootCall = Array.last(result.calls);
    if (Option.isNone(maybeRootCall)) {
      return yield* ContractRuntimeError.make(
        'Circuit execution produced no calls; the root call is missing.'
      );
    }
    const rootCall = maybeRootCall.value;

    // If the output public file path is provided, write the on-chain (public state) data to the specified file.
    if (Option.isSome(outputPublicFilePath)) {
      const rootState = yield* Ledger.fromRuntimeStateValue(rootCall.public.contractState);
      const rootStateBytes = yield* InternalCommand.tryLedger(
        `Failed to serialize the updated contract state for '${address}'`,
        () => {
          ledgerContractState.data = new Ledger.ChargedState(rootState);
          return ledgerContractState.serialize();
        }
      );
      yield* fs.writeFile(outputPublicFilePath.value, rootStateBytes);
    }

    // If an output contract-states directory is provided, write the updated ledger state of each
    // cross-contract callee, each file named by its address. Combined with `--output-oc` for the
    // root, this lets callers thread state across cross-contract calls without applying the
    // transaction: feed this directory back as `--contract-states-dir` (and the root via `--input`).
    if (Option.isSome(outputContractStatesDirPath)) {
      const dir = outputContractStatesDirPath.value;
      yield* fs.makeDirectory(dir, { recursive: true });
      for (const [contractAddress, { ledgerState, data }] of finalCalleeStates) {
        const calleeState = yield* Ledger.fromRuntimeStateValue(data);
        const calleeStateBytes = yield* InternalCommand.tryLedger(
          `Failed to serialize the updated contract state for '${contractAddress}'`,
          () => {
            ledgerState.data = new Ledger.ChargedState(calleeState);
            return ledgerState.serialize();
          }
        );
        yield* fs.writeFile(join(dir, contractAddress), calleeStateBytes);
      }
    }
    yield* fs.writeFileString(outputResultFilePath, stringifyCircuitOutput(result.result));
    yield* fs.writeFile(
      outputFilePath,
      yield* InternalCommand.serializeIntent(intent)
    );
    yield* fs.writeFileString(outputPrivateStateFilePath, JSON.stringify(result.privateState));
    yield* fs.writeFileString(
      outputZswapLocalStateFilePath,
      JSON.stringify(
        yield* encodeZswapLocalStateObject(
          // The intent file is already written at this point, so an unwrapped throw here would be
          // a defect that leaves a partially-written output directory and reports nothing at all.
          yield* CompactRuntime.tryRuntime(
            'Failed to encode the zswap local state produced by the circuit',
            () => CompactRuntime.encodeZswapLocalState(result.zswapLocalState)
          )
        )
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
