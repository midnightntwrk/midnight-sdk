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

import {
  type AlignedValue,
  type CallProofData,
  type CommunicationCommitmentData,
  CompactError,
  ContractMaintenanceAuthority,
  type ContractState,
  type ContractStateProvider,
  createCircuitContext,
  createConstructorContext,
  decodeZswapLocalState,
  emptyZswapLocalState,
  encodeZswapLocalState,
  type LogEvent,
  type Op,
  type QueryContext,
  sampleSigningKey,
  signatureVerifyingKey,
  type StateValue,
  type ZswapLocalState
} from '@midnight-ntwrk/compact-runtime';
import * as CoinPublicKey from '@midnight-ntwrk/platform-js/effect/CoinPublicKey';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import {
  ChargedState as LedgerChargedState,
  ContractMaintenanceAuthority as LedgerContractMaintenanceAuthority,
  ContractOperationVersion,
  ContractOperationVersionedVerifierKey,
  LedgerParameters,
  MaintenanceUpdate,
  partitionTranscripts,
  PreTranscript,
  QueryContext as LedgerQueryContext,
  ReplaceAuthority,
  signData,
  type SigningKey as LedgerSigningKey,
  type SingleUpdate,
  StateValue as LedgerStateValue,
  type Transcript,
  VerifierKeyInsert,
  VerifierKeyRemove
} from '@midnightntwrk/ledger-v9';
import { Effect, Either, type Layer, Option } from 'effect';
import { dual, identity } from 'effect/Function';
import { type Pipeable, pipeArguments } from 'effect/Pipeable';

import { type CompiledContract } from './CompiledContract.js';
import * as Contract from './Contract.js';
import * as ContractConfigurationError from './ContractConfigurationError.js';
import { validateEvents } from './ContractEventValidator.js';
import * as ContractRuntimeError from './ContractRuntimeError.js';
import * as CompactContextInternal from './internal/compactContext.js';
import { ZKConfiguration } from './ZKConfiguration.js';
import { type ZKConfigurationReadError } from './ZKConfigurationReadError.js';

/**
 * An executable form of a Compact compiled contract.
 */
export interface ContractExecutable<in out C extends Contract.Contract<PS>, PS, out E = never, out R = never>
  extends Pipeable {
  readonly compiledContract: CompiledContract<C, PS>;

  /**
   * Creates and initializes a new instance of the contract.
   *
   * @param initialPrivateState The initial private state to apply when initializing the new contract instance.
   * @param args The arguments to supply the contract constructor.
   * @returns A {@link ContractExecutable.DeployResult} describing the result of initializing a new contract
   * instance.
   */
  initialize(
    initialPrivateState: PS,
    ...args: Contract.Contract.InitializeParameters<C>
  ): Effect.Effect<ContractExecutable.DeployResult<PS>, E, R>;

  /**
   * Invokes a circuit on deployed instance of the contract.
   *
   * @param provableCircuitId The circuit to be invoked.
   * @param circuitContext Execution context for `provableCircuitId` including its current onchain and private
   * states.
   * @param args The arguments to supply the circuit.
   * @returns A {@link ContractExecutable.CallResult} describing the result of invoking `provableCircuitId`.
   */
  circuit<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    circuitContext: ContractExecutable.CircuitContext<PS>,
    ...args: Contract.Contract.CircuitParameters<C, K>
  ): Effect.Effect<ContractExecutable.CallResult<C, PS, K>, E, R>;

  /**
   * Retrieves the provable circuits available as part of the underlying contract.
   *
   * @returns An array of {@link Contract.ProvableCircuitId} describing the available provable circuits.
   */
  getProvableCircuitIds(): Contract.ProvableCircuitId<C>[];

  /**
   * Applies a new Contract Maintenance Authority (CMA) to a deployed instance of the contract.
   *
   * @param newSigningKey The signing key that will replace the current that is associated with the
   * deployed contract. If `Option.none` then a new singing key is sampled and used instead.
   * @param contractContext Execution context for the maintenance operation.
   * @returns A {@link ContractExecutable.MaintenanceResult} describing the result of the maintenance update.
   *
   * @remarks
   * The current signing key will be taken from the {@link Configuration.Keys} that is part of the executable
   * context, and used to sign the maintenance operation.
   */
  replaceContractMaintenanceAuthority(
    newSigningKey: Option.Option<SigningKey.SigningKey>,
    contractContext: ContractExecutable.ContractContext
  ): Effect.Effect<ContractExecutable.MaintenanceResult, E, R>;

  /**
   * Removes the current verifier key for an operation on a deployed instance of the contract.
   *
   * @param provableCircuitId The circuit to be removed from the deployed contract.
   * @param contractContext Execution context for the maintenance operation.
   * @returns A {@link ContractExecutable.MaintenanceResult} describing the result of the maintenance update.
   */
  removeContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    contractContext: ContractExecutable.ContractContext
  ): Effect.Effect<ContractExecutable.MaintenanceResult, E, R>;

  /**
   * Adds or replaces a verifier key associated with a circuit on a deployed contract.
   *
   * @param provableCircuitId The circuit to add or replace on the deployed contract.
   * @param verifierKey The verifier key to apply to `provableCircuitId`.
   * @param contractContext Execution context for the maintenance operation.
   * @returns A {@link ContractExecutable.MaintenanceResult} describing the result of the maintenance update.
   */
  addOrReplaceContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    verifierKey: Contract.VerifierKey,
    contractContext: ContractExecutable.ContractContext
  ): Effect.Effect<ContractExecutable.MaintenanceResult, E, R>;
}

export declare namespace ContractExecutable {
  /**
   * The services required as context for executing contracts.
   */
  export type Context = ZKConfiguration | Configuration.Keys;

  export type ContractContext = {
    readonly address: ContractAddress.ContractAddress;
    readonly contractState: ContractState;
  };

  export type CircuitContext<PS> = ContractContext & {
    readonly privateState: PS;
    readonly zswapLocalState?: ZswapLocalState;
    readonly ledgerParameters?: LedgerParameters;
  } & (
      | { readonly stateProvider?: undefined; readonly parentBlockHash?: undefined }
      | { readonly stateProvider: ContractStateProvider; readonly parentBlockHash: string }
    );

  export type DeployResultPublic = {
    readonly contractState: ContractState;
  };
  export type DeployResultPrivate<PS> = {
    readonly signingKey: SigningKey.SigningKey;
    readonly privateState: PS;
    readonly zswapLocalState: ZswapLocalState;
  };
  export type DeployResult<PS> = {
    readonly public: DeployResultPublic;
    readonly private: DeployResultPrivate<PS>;
  };

  export type PartitionedTranscript = [Transcript<AlignedValue> | undefined, Transcript<AlignedValue> | undefined];
  export type ContractCallPublic = {
    readonly contractState: StateValue;
    readonly publicTranscript: Op<AlignedValue>[];
    readonly partitionedTranscript: PartitionedTranscript;
  };
  export type ContractCallPrivate = {
    readonly input: AlignedValue;
    readonly output: AlignedValue;
    readonly privateTranscriptOutputs: AlignedValue[];
  };

  /**
   * Proof data for a single contract call. One {@link ContractCall} is produced for every call
   * made while executing a circuit — the root call plus one per cross-contract call —
   * corresponding to the entries of the runtime's `callProofDataTrace`.
   */
  export type ContractCall = {
    readonly contractAddress: ContractAddress.ContractAddress;
    readonly circuitId: string;
    readonly public: ContractCallPublic;
    readonly private: ContractCallPrivate;
    /**
     * The communication commitment binding this call to its caller. Present (`Option.some`) for
     * cross-contract sub-calls (callees); `Option.none` for the root call, which is no one's
     * callee.
     */
    readonly communicationCommitment: Option.Option<CommunicationCommitmentData>;
  };

  /**
   * The result of invoking a circuit.
   *
   * `calls` holds the proof data for every contract call made during execution, in
   * `callProofDataTrace` order — callees first, the root call last. The application-facing
   * `result`, `privateState`, and `zswapLocalState` belong to the root contract and are
   * statically typed for it; sub-calls expose only proof data (other contracts' types are not
   * known here, and only the root holds private/zswap state).
   *
   * `events` is the single execution-wide log-event list across the whole call tree, in emission
   * order; each event is tagged with its emitting contract's address, so a per-contract view is a
   * filter over that tag. Events are NOT consensus state and are handled by the indexer; size and
   * well-formedness are enforced on-chain by the ledger/VM (degraded, not failed) per MIP-0002.
   *
   * The events are kept **raw** here to avoid paying decode cost when unused. To obtain typed,
   * per-event payloads, decode on demand with `ContractLog.decodeAll(result.events)` (which
   * degrades gracefully and never throws); feed them to a `ContractEventStore` to query/subscribe.
   */
  export type CallResult<C extends Contract.Contract<PS>, PS, K extends Contract.ProvableCircuitId<C>> = {
    readonly result: Contract.Contract.CircuitReturnType<C, K>;
    readonly privateState: PS | undefined;
    readonly zswapLocalState: ZswapLocalState;
    readonly events: LogEvent[];
    readonly calls: readonly ContractCall[];
  };

  export type MaintenanceResultPublic = {
    readonly maintenanceUpdate: MaintenanceUpdate;
  };
  export type MaintenanceResultPrivate = {
    readonly signingKey: SigningKey.SigningKey;
  };
  export type MaintenanceResult = {
    readonly public: MaintenanceResultPublic;
    readonly private: MaintenanceResultPrivate;
  };
}

/**
 * An error occurred while executing a constructor, or a circuit, of an executable contract.
 *`
 * @category errors
 */
export type ContractExecutionError =
  | ContractRuntimeError.ContractRuntimeError
  | ContractConfigurationError.ContractConfigurationError
  | ZKConfigurationReadError;

// A function that receives an `Effect`, and captures it within another `Effect` that is bound to some
// specified error and context type.
type Transform<E, R> = <A>(effect: Effect.Effect<A, any, any>) => Effect.Effect<A, E, R>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DEFAULT_CMA_THRESHOLD = 1;
const DEFAULT_SIGNATURE_INDEX = 0n;

// The signature schemes verified to work through the ledger CMA path (`signData` and
// `signatureVerifyingKey`), so the caller-supplied scheme is threaded through unchanged. Any other
// scheme is rejected loudly rather than silently coerced.
//
// This is deliberately an explicit allowlist, NOT `SigningKey.SignatureKinds`: the constraint is
// what the ledger primitives support, not what platform-js's type union happens to include. A new
// scheme must be added here only once it is verified end-to-end against the ledger CMA path.
const SUPPORTED_CMA_SIGNATURE_KINDS: ReadonlySet<SigningKey.SignatureKind> = new Set(['schnorr', 'ecdsa']);

// Adapts a platform-js `SigningKey` to a ledger `SigningKey`. As of platform-js@3.0.0 both are
// `{ tag: SignatureKind, value }` and structurally compatible; the onchain-runtime `SigningKey`
// is identical too, so this serves both `signData` (ledger) and `signatureVerifyingKey`
// (compact-runtime). The caller-supplied `tag` is preserved so ECDSA-tagged keys are not silently
// treated as Schnorr; an unsupported scheme fails with a `ContractConfigurationError`.
const asTaggedSigningKey = (
  signingKey: SigningKey.SigningKey,
  contractState?: ContractState
): Either.Either<LedgerSigningKey, ContractConfigurationError.ContractConfigurationError> =>
  SUPPORTED_CMA_SIGNATURE_KINDS.has(signingKey.tag)
    ? Either.right({ tag: signingKey.tag, value: signingKey.value })
    : Either.left(
        ContractConfigurationError.make(
          `Unsupported signature scheme '${signingKey.tag}' for a contract maintenance authority; ` +
            `supported schemes are: ${[...SUPPORTED_CMA_SIGNATURE_KINDS].join(', ')}`,
          contractState
        )
      );

const asLedgerQueryContext = (queryContext: QueryContext): LedgerQueryContext => {
  const stateValue = LedgerStateValue.decode(queryContext.state.state.encode());
  const ledgerQueryContext = new LedgerQueryContext(new LedgerChargedState(stateValue), queryContext.address);
  // The above method of converting to ledger query context only retains the state. So, we have to set the settable properties manually
  ledgerQueryContext.block = queryContext.block;
  ledgerQueryContext.effects = queryContext.effects;
  return ledgerQueryContext;
};

// Partition the public transcripts of every call in the trace in a single batch.
//
// `partitionTranscripts` builds a caller->callee call graph across the whole batch by matching
// each callee's communication commitment against the commitments its caller claimed, so it must
// see every call at once (see midnight-ledger `construct.rs::partition_transcripts`). The
// commitment rides on the *callee's* pre-transcript (`commCommData.commComm`); the root call has
// no commitment and becomes the graph root. The returned array is in the same order as `trace`.
const partitionAllTranscripts = (
  trace: readonly CallProofData[],
  ledgerParameters: LedgerParameters | undefined
): Either.Either<ContractExecutable.PartitionedTranscript[], Error> => {
  const preTranscripts = trace.map(
    (entry) =>
      new PreTranscript(
        Array.from(entry.finalQueryContext.comIndices).reduce(
          (queryContext, comEntry) => queryContext.insertCommitment(...comEntry),
          asLedgerQueryContext(entry.initialQueryContext)
        ),
        entry.publicTranscript,
        entry.commCommData?.commComm
      )
  );
  const partitioned = partitionTranscripts(preTranscripts, ledgerParameters ?? LedgerParameters.initialParameters());
  return partitioned.length === trace.length
    ? Either.right(partitioned)
    : Either.left(new Error(`Expected ${trace.length} transcript partition pairs, received: ${partitioned.length}`));
};

class ContractExecutableImpl<C extends Contract.Contract<PS>, PS, E, R> implements ContractExecutable<C, PS, E, R> {
  compiledContract: CompiledContract<C, PS>;
  transform: Transform<E, R>;

  constructor(compiledContract: CompiledContract<C, PS, never>, transform: Transform<E, R> = identity) {
    this.compiledContract = compiledContract;
    this.transform = transform;
  }

  pipe() {
    return pipeArguments(this, arguments); // eslint-disable-line prefer-rest-params
  }

  initialize(
    initialPrivateState: PS,
    ...args: Contract.Contract.InitializeParameters<C>
  ): Effect.Effect<ContractExecutable.DeployResult<PS>, E, R> {
    return Effect.all({
      zkConfigReader: ZKConfiguration.pipe(
        Effect.andThen((zkConfig) => zkConfig.createReader<C, PS>(this.compiledContract))
      ),
      keyConfig: Configuration.Keys,
      contract: this.createContract()
    }).pipe(
      Effect.flatMap(({ zkConfigReader, keyConfig, contract }) =>
        Effect.tryPromise({
          try: async () => {
            const { currentContractState, currentPrivateState, currentZswapLocalState } = await contract.initialState(
              createConstructorContext(initialPrivateState, CoinPublicKey.asHex(keyConfig.coinPublicKey)),
              ...args
            );
            return {
              contractState: currentContractState,
              privateState: currentPrivateState,
              zswapLocalState: decodeZswapLocalState(currentZswapLocalState)
            };
          },
          catch: (err: unknown) =>
            err instanceof CompactError
              ? ContractRuntimeError.make('Failed to initialize contract', err)
              : ContractConfigurationError.make(
                  'Failed to configure constructor context with coin public key',
                  undefined,
                  err
                )
        }).pipe(
          Effect.flatMap(({ contractState, privateState, zswapLocalState }) =>
            Effect.gen(this, function* () {
              // Add the verifier keys.
              const verifierKeys = yield* zkConfigReader.getVerifierKeys(Contract.getProvableCircuitIds(contract));

              for (const [provableCircuitId, verifierKey] of verifierKeys) {
                // If there is no verifier key for this circuit, raise an error.
                if (Option.isNone(verifierKey)) {
                  return yield* ContractConfigurationError.make(
                    `Failed to find a verifier key for circuit '${provableCircuitId}'`,
                    contractState
                  );
                }

                const operation = contractState.operation(provableCircuitId);

                if (!operation) {
                  return yield* ContractConfigurationError.make(
                    `Circuit '${provableCircuitId}' is undefined for the given contract state`,
                    contractState
                  );
                }

                try {
                  operation.verifierKey = verifierKey.value;
                  contractState.setOperation(provableCircuitId, operation);
                } catch (err: unknown) {
                  return yield* ContractConfigurationError.make(
                    `Failed to configure verifier key for circuit '${provableCircuitId}' for the given contract state`,
                    contractState,
                    err
                  );
                }
              }

              const [cma, signingKey] = yield* this.createMaintenanceAuthority(keyConfig.getSigningKey());
              contractState.maintenanceAuthority = cma;

              return {
                public: {
                  contractState
                },
                private: {
                  signingKey,
                  privateState,
                  zswapLocalState
                }
              };
            })
          )
        )
      ),
      this.transform
    );
  }

  circuit<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    circuitContext: ContractExecutable.CircuitContext<PS>,
    ...args: Contract.Contract.CircuitParameters<C, K>
  ): Effect.Effect<ContractExecutable.CallResult<C, PS, K>, E, R> {
    return Effect.all({
      keyConfig: Configuration.Keys,
      contract: this.createContract()
    }).pipe(
      Effect.flatMap(({ keyConfig, contract }) =>
        Effect.tryPromise({
          try: async () => {
            const circuit = contract.provableCircuits[provableCircuitId] as Contract.ProvableCircuit<
              PS,
              Contract.Contract.CircuitReturnType<C, K>
            >;
            if (!circuit) {
              throw new Error(`Circuit ${this.compiledContract.tag}#${provableCircuitId} could not be found.`);
            }
            const zswapLocalState = circuitContext.zswapLocalState
              ? encodeZswapLocalState(circuitContext.zswapLocalState)
              : emptyZswapLocalState(CoinPublicKey.asHex(keyConfig.coinPublicKey));
            const runtimeContext = createCircuitContext(
              provableCircuitId,
              circuitContext.address,
              zswapLocalState,
              circuitContext.contractState,
              circuitContext.privateState,
              circuitContext.stateProvider,
              undefined,
              undefined,
              undefined,
              circuitContext.parentBlockHash
            );
            return await circuit(runtimeContext, ...args);
          },
          catch: identity
        }).pipe(
          Effect.flatMap(({ result, context }) =>
            Effect.gen(function* () {
              // Every call made while executing the circuit, in trace order (callees first, the
              // root call last). For a circuit with no cross-contract calls this has length 1.
              const trace = context.callProofDataTrace;
              const zswapLocalState = context.callContext.currentZswapLocalState;
              if (zswapLocalState === undefined) {
                return yield* ContractRuntimeError.make(`Circuit '${provableCircuitId}' returned no zswap local state`);
              }
              // Validate the log events emitted by the VM before surfacing them: they are untrusted
              // VM output and are serialized verbatim for external (indexer/DApp) consumption. A
              // structural failure is funnelled through the `ContractRuntimeError` mapping below.
              // Events are a single execution-wide list, each tagged with the emitting contract's
              // address; a per-call view is a filter over that address (see compact-runtime).
              yield* validateEvents(context.events);
              // Partition all calls' transcripts together (the partitioner needs the whole batch
              // to reconstruct the caller/callee graph).
              const partitioned = yield* partitionAllTranscripts(trace, circuitContext.ledgerParameters);
              const calls: ContractExecutable.ContractCall[] = yield* Effect.forEach(trace, (entry, i) =>
                Effect.gen(function* () {
                  const partitionedTranscript = partitioned[i];
                  if (partitionedTranscript === undefined) {
                    // Unreachable: `partitionAllTranscripts` guarantees one partition pair per
                    // trace entry. Guarded so the mapping is sound under `noUncheckedIndexedAccess`.
                    return yield* ContractRuntimeError.make(
                      `Missing partitioned transcript for call ${i} ('${entry.circuitId}')`
                    );
                  }
                  return {
                    contractAddress: ContractAddress.ContractAddress(entry.contractAddress),
                    circuitId: entry.circuitId,
                    public: {
                      contractState: entry.finalQueryContext.state.state,
                      publicTranscript: entry.publicTranscript,
                      partitionedTranscript
                    },
                    private: {
                      input: entry.input,
                      output: entry.output,
                      privateTranscriptOutputs: entry.privateTranscriptOutputs
                    },
                    communicationCommitment: Option.fromNullable(entry.commCommData)
                  };
                })
              );
              // `result`, `privateState`, and `zswapLocalState` belong to the root contract;
              // `events` is the whole execution's log-event list (each tagged with its emitter).
              return {
                result,
                privateState: context.callContext.currentPrivateState,
                zswapLocalState: decodeZswapLocalState(zswapLocalState),
                events: context.events,
                calls
              };
            })
          ),
          Effect.mapError((err) => ContractRuntimeError.make(`Error executing circuit '${provableCircuitId}'`, err))
        )
      ),
      this.transform
    );
  }

  getProvableCircuitIds(): Contract.ProvableCircuitId<C>[] {
    return Contract.getProvableCircuitIds(Effect.runSync(this.createContract()));
  }

  replaceContractMaintenanceAuthority(
    this: ContractExecutableImpl<C, PS, E, R>,
    newSigningKey: Option.Option<SigningKey.SigningKey>,
    contractContext: ContractExecutable.ContractContext
  ): Effect.Effect<ContractExecutable.MaintenanceResult, E, R> {
    return Effect.all({
      keyConfig: Configuration.Keys
    }).pipe(
      Effect.flatMap(({ keyConfig }) =>
        Effect.gen(this, function* () {
          const { contractState } = contractContext;
          const [cma, signingKey] = yield* this.createMaintenanceAuthority(newSigningKey, contractState);
          const ledger_cma = LedgerContractMaintenanceAuthority.deserialize(
            cma.serialize()
          ) as unknown as LedgerContractMaintenanceAuthority;
          const update = yield* this.createSignedMaintenanceUpdate(
            () => {
              return Either.right([new ReplaceAuthority(ledger_cma)]);
            },
            keyConfig,
            contractContext
          );
          return {
            ...update,
            private: {
              ...update.private,
              signingKey // We need to include the new signing key in the result (rather than the current).
            }
          };
        })
      ),
      this.transform
    );
  }

  removeContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    this: ContractExecutableImpl<C, PS, E, R>,
    provableCircuitId: K,
    contractContext: ContractExecutable.ContractContext
  ): Effect.Effect<ContractExecutable.MaintenanceResult, E, R> {
    return Effect.all({
      keyConfig: Configuration.Keys
    }).pipe(
      Effect.flatMap(({ keyConfig }) =>
        Effect.gen(this, function* () {
          return yield* this.createSignedMaintenanceUpdate(
            () => {
              return Either.right([new VerifierKeyRemove(provableCircuitId, new ContractOperationVersion('v3'))]);
            },
            keyConfig,
            contractContext
          );
        })
      ),
      this.transform
    );
  }

  addOrReplaceContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    verifierKey: Contract.VerifierKey,
    contractContext: ContractExecutable.ContractContext
  ): Effect.Effect<ContractExecutable.MaintenanceResult, E, R> {
    return Effect.all({
      keyConfig: Configuration.Keys
    }).pipe(
      Effect.flatMap(({ keyConfig }) =>
        Effect.gen(this, function* () {
          return yield* this.createSignedMaintenanceUpdate(
            () => {
              return Either.right([
                new VerifierKeyInsert(provableCircuitId, new ContractOperationVersionedVerifierKey('v3', verifierKey))
              ]);
            },
            keyConfig,
            contractContext
          );
        })
      ),
      this.transform
    );
  }

  protected createSignedMaintenanceUpdate(
    createUpdateFn: () => Either.Either<SingleUpdate[], ContractConfigurationError.ContractConfigurationError>,
    keyConfig: Configuration.Configuration.Keys,
    contractContext: ContractExecutable.ContractContext
  ): Either.Either<ContractExecutable.MaintenanceResult, ContractConfigurationError.ContractConfigurationError> {
    const { address, contractState } = contractContext;
    const currentSigningKey = keyConfig.getSigningKey();
    if (Option.isNone(currentSigningKey)) {
      return Either.left(
        ContractConfigurationError.make('Signing key required to authorize contract maintenance update', contractState)
      );
    }
    const signingKey = currentSigningKey.value;
    const ledgerSigningKey = asTaggedSigningKey(signingKey, contractState);
    if (Either.isLeft(ledgerSigningKey)) return Either.left(ledgerSigningKey.left);
    const update = createUpdateFn();
    if (Either.isLeft(update)) return Either.left(update.left);
    const maintenanceUpdate = new MaintenanceUpdate(address, update.right, contractState.maintenanceAuthority.counter);
    let signature: ReturnType<typeof signData>;
    try {
      signature = signData(ledgerSigningKey.right, maintenanceUpdate.dataToSign);
    } catch (err: unknown) {
      return Either.left(
        ContractConfigurationError.make(
          `Failed to sign contract maintenance update with a '${signingKey.tag}' signing key`,
          contractState,
          err
        )
      );
    }
    return Either.right({
      public: {
        maintenanceUpdate: maintenanceUpdate.addSignature(DEFAULT_SIGNATURE_INDEX, signature)
      },
      private: {
        signingKey
      }
    });
  }

  protected createMaintenanceAuthority(
    key: Option.Option<SigningKey.SigningKey>,
    contractState?: ContractState
  ): Either.Either<
    [ContractMaintenanceAuthority, SigningKey.SigningKey],
    ContractConfigurationError.ContractConfigurationError
  > {
    const signingKey = Option.match(key, {
      onSome: identity,
      onNone: () => SigningKey.make(sampleSigningKey('schnorr').value)
    });
    const ledgerSigningKey = asTaggedSigningKey(signingKey, contractState);
    if (Either.isLeft(ledgerSigningKey)) return Either.left(ledgerSigningKey.left);
    try {
      return Either.right([
        new ContractMaintenanceAuthority(
          [signatureVerifyingKey(ledgerSigningKey.right)],
          DEFAULT_CMA_THRESHOLD,
          contractState ? contractState.maintenanceAuthority.counter + 1n : 0n
        ),
        signingKey
      ]);
    } catch (err: unknown) {
      return Either.left(
        ContractConfigurationError.make(
          `Failed to create a signature verifying key for signing key '${signingKey}'`,
          contractState,
          err
        )
      );
    }
  }

  protected createContract(): Effect.Effect<C, ContractRuntimeError.ContractRuntimeError> {
    return (this.contract ??= CompactContextInternal.createContract(this.compiledContract).pipe(
      Effect.mapError((err: unknown) => ContractRuntimeError.make(String(err), err)),
      Effect.cached,
      Effect.runSync
    ));
  }
  private contract?: Effect.Effect<C, ContractRuntimeError.ContractRuntimeError>; // Backing property for `createContract`.
}

/**
 * Takes a Compact compiled contract, and makes it executable.
 *
 * @param compiledContract A {@link CompiledContract}
 * @returns A {@link ContractExecutable} for `compiledContract`.
 *
 * @category constructors
 */
export const make: <C extends Contract.Contract<PS>, PS>(
  compiledContract: CompiledContract<C, PS, never>
) => ContractExecutable<C, PS, ContractExecutionError, ContractExecutable.Context> = <
  C extends Contract.Contract<PS>,
  PS
>(
  compiledContract: CompiledContract<C, PS, never>
) => new ContractExecutableImpl<C, PS, ContractExecutionError, ContractExecutable.Context>(compiledContract);

/**
 * Provides a layer to the executable contract.
 *
 * @category combinators
 */
export const provide: {
  /**
   * @param layer The layer to provide.
   * @returns A function that receives the {@link ContractExecutable} that `layer` should be provided to.
   */
  <LA, LE, LR>(layer: Layer.Layer<LA, LE, LR>): <C extends Contract.Contract<PS>, PS, E, R>(
    self: ContractExecutable<C, PS, E, R>
  ) => ContractExecutable<C, PS, E | LE, LR | Exclude<R, LA>>;
  /**
   * @param self The {@link ContractExecutable} that `layer` should be provided with.
   * @param layer The layer to provide.
   */
  <C extends Contract.Contract<PS>, PS, E, R, LA, LE, LR>(
    self: ContractExecutable<C, PS, E, R>,
    layer: Layer.Layer<LA, LE, LR>
  ): ContractExecutable<C, PS, E | LE, LR | Exclude<R, LA>>;
} = dual(
  2,
  <C extends Contract.Contract<PS>, PS, E, R, LA, LE, LR>(
    self: ContractExecutable<C, PS, E, R>,
    layer: Layer.Layer<LA, LE, LR>
  ) =>
    new ContractExecutableImpl<C, PS, E | LE, LR | Exclude<R, LA>>(self.compiledContract, (e) =>
      Effect.provide(e, layer)
    )
);
