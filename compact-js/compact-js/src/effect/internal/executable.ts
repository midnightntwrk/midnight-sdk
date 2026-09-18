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

/**
 * Contract execution, parameterised on an era pair.
 *
 * @remarks
 * `ContractExecutable.ts` used to *be* this module, written directly against the `Ledger` and
 * `CompactRuntime` facades — which resolve each seam's `current.ts`. That made the executable a
 * singleton bound to whichever era the build happened to bind, and it is the reason `/v8/effect`
 * could offer every other module but not this one: exporting it there would have handed back
 * ledger-9-bound objects from a path named v8 (midnight-sdk#387/#388).
 *
 * The bodies now take both bindings as parameters, the way `internal/ledger/conversions.ts` does,
 * and every era-varying type in the public API is **derived** from those two arguments rather than
 * declared alongside them — see {@link ExecutableTypes}. Deriving matters: a hand-written type
 * surface is a second place to state the era, and the two drift silently. Here, passing
 * `(V8, V0_16)` makes `CallResult.zswapLocalState` the 0.16 zswap state as a consequence of the
 * argument, with nothing to keep in step.
 *
 * Deliberately **above both seams**: this module imports neither facade, so it has no era of its
 * own. The instantiations live in `effect/ContractExecutable.ts` (the bound era) and
 * `internal/era/v{8,9}Executable.ts` (the era-pinned entries).
 */
import * as CoinPublicKey from '@midnight-ntwrk/platform-js/effect/CoinPublicKey';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { Effect, Either, type Layer, Option } from 'effect';
import { dual, identity } from 'effect/Function';
import { type Pipeable, pipeArguments } from 'effect/Pipeable';

import { type CompiledContract } from '../CompiledContract.js';
import * as Contract from '../Contract.js';
import * as ContractConfigurationError from '../ContractConfigurationError.js';
import { validateEvents } from '../ContractEventValidator.js';
import * as ContractRuntimeError from '../ContractRuntimeError.js';
import { ZKConfiguration,type ZKConfiguration as ZKConfigurationService } from '../ZKConfiguration.js';
import { type ZKConfigurationReadError } from '../ZKConfigurationReadError.js';
import { tryBoundary } from './boundary.js';
import * as CompactContextInternal from './compactContext.js';
import { type Era, type RuntimeLine } from './era.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The ledger-binding members contract execution needs.
 *
 * @remarks
 * Narrow on purpose — this is not the whole `LedgerBinding`, only what the bodies below call. The
 * opaque handles (`PreTranscript` instances, `SingleUpdate`s, signing keys, signatures) are typed
 * as each binding's *own* types by inference at the instantiation site, so a chain that the two
 * eras spell differently still type-checks against itself. The relationships between those handles
 * — that `signData`'s output is what `MaintenanceUpdate.addSignature` accepts, and so on — are
 * asserted for every binding by `internal/ledger/conformance.ts`, which is why they can be left
 * open here.
 */
export interface ExecutableLedger {
  /**
   * The whole {@link Era} descriptor, not just the members the bodies below read.
   *
   * @remarks
   * `defaultCmaSignatureKind` is the only one this module *calls*, but the descriptor is also
   * republished on {@link ContractExecutable.era} so a host that selects an era independently — the
   * CLI, whose `--ledger-era` picks its own era pair — can compare the era it selected against the
   * era the executable it was handed was built for. Narrowing this to the one member used here
   * would make that comparison impossible without a second declaration of the same fact.
   */
  readonly era: Era;
  readonly LedgerParameters: { initialParameters(): unknown };
  readonly MaintenanceUpdate: new (address: never, updates: never, counter: never) => unknown;
  readonly PreTranscript: new (context: never, program: never, commComm?: never) => unknown;
  readonly ReplaceAuthority: new (authority: never) => unknown;
  readonly VerifierKeyInsert: new (circuitId: never, key: never) => unknown;
  readonly VerifierKeyRemove: new (circuitId: never, version: never) => unknown;
  readonly fromPlatformSigningKey: (
    signingKey: SigningKey.SigningKey,
    contractState?: any
  ) => Either.Either<unknown, ContractConfigurationError.ContractConfigurationError>;
  readonly fromRuntimeMaintenanceAuthority: (
    authority: never
  ) => Effect.Effect<unknown, ContractRuntimeError.ContractRuntimeError>;
  readonly fromRuntimeQueryContext: (
    queryContext: never
  ) => Effect.Effect<unknown, ContractRuntimeError.ContractRuntimeError>;
  readonly makeContractOperationVersion: () => unknown;
  readonly makeVersionedVerifierKey: (verifierKey: never) => unknown;
  readonly partitionTranscripts: (preTranscripts: never, parameters: never) => readonly unknown[];
  readonly signData: (signingKey: never, data: never) => unknown;
}

/** The compact-runtime-binding members contract execution needs. See {@link ExecutableLedger}. */
export interface ExecutableRuntime {
  /**
   * The compact-runtime line this binding targets. Present so {@link makeExecutable} can require it
   * to be the line the *ledger* half's era pairs with — see its `R` constraint.
   */
  readonly line: RuntimeLine;
  readonly CompactError: abstract new (...args: never) => unknown;
  readonly ContractMaintenanceAuthority: new (committee: never, threshold: never, counter?: never) => unknown;
  readonly ContractState: abstract new (...args: never) => unknown;
  readonly createConstructorContext: (privateState: never, coinPublicKey: never) => unknown;
  readonly createExecutionContext: (params: never) => unknown;
  readonly decodeZswapLocalState: (state: never) => unknown;
  readonly emptyZswapLocalState: (coinPublicKey: never) => unknown;
  readonly encodeZswapLocalState: (state: never) => unknown;
  readonly makeSampleSigningKey: (kind: never) => unknown;
  readonly readExecution: (results: never) => {
    readonly result: unknown;
    readonly trace: readonly {
      readonly circuitId: string;
      readonly contractAddress: string;
      readonly initialQueryContext: unknown;
      readonly finalQueryContext: unknown;
      readonly publicTranscript: readonly unknown[];
      readonly input: unknown;
      readonly output: unknown;
      readonly privateTranscriptOutputs: readonly unknown[];
      readonly zswapLocalState: unknown;
      readonly commCommData?: unknown;
    }[];
    readonly privateState: unknown;
    readonly zswapLocalState: unknown;
    readonly events: readonly unknown[];
  };
  readonly signatureVerifyingKey: (signingKey: never) => unknown;
  readonly signingKeyHex: (signingKey: never) => string;
}

/**
 * Every era-varying type the executable's public API mentions, read off the two bindings.
 *
 * @remarks
 * There is no hand-written list of "the ledger 8 shapes" anywhere: each member below names the
 * binding member it comes from, so the era arrives with the arguments. The ones with no value to
 * derive from — a public transcript's `Op`, an `AlignedValue` — are reached through the execution
 * adapter's return type, which every binding must provide (`internal/runtime/execution.ts`).
 */
export interface ExecutableTypes<L extends ExecutableLedger, R extends ExecutableRuntime> {
  readonly ContractState: InstanceType<R['ContractState']>;
  readonly ZswapLocalState: ReturnType<R['decodeZswapLocalState']>;
  readonly EncodedZswapLocalState: ReturnType<R['encodeZswapLocalState']>;
  readonly ContractMaintenanceAuthority: InstanceType<R['ContractMaintenanceAuthority']>;
  readonly LedgerParameters: ReturnType<L['LedgerParameters']['initialParameters']>;
  readonly MaintenanceUpdate: InstanceType<L['MaintenanceUpdate']>;
  readonly PartitionedTranscript: ReturnType<L['partitionTranscripts']>[number];
  readonly ContractStateProvider: StateProviderOf<R>;
  readonly TraceEntry: ReturnType<R['readExecution']>['trace'][number];
  readonly AlignedValue: ExecutableTypes<L, R>['TraceEntry']['input'];
  readonly Op: ExecutableTypes<L, R>['TraceEntry']['publicTranscript'][number];
  readonly StateValue: QueryContextState<ExecutableTypes<L, R>['TraceEntry']['finalQueryContext']>;
  readonly CommunicationCommitmentData: NonNullable<ExecutableTypes<L, R>['TraceEntry']['commCommData']>;
  readonly LogEvent: ReturnType<R['readExecution']>['events'][number];
}

/**
 * The cross-contract state provider this line accepts, read off the parameter object its
 * `createExecutionContext` takes — `never` on a line that has no such concept, which is what makes
 * the provider branch of {@link CircuitContext} unconstructable on ledger 8.
 */
type StateProviderOf<R extends ExecutableRuntime> = Parameters<R['createExecutionContext']>[0] extends {
  stateProvider?: infer P;
}
  ? NonNullable<P>
  : never;

/** A query context's inner ledger state, as `ContractCallPublic.contractState` reports it. */
type QueryContextState<Q> = Q extends { state: { state: infer S } } ? S : never;

export type ContractContext<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly address: ContractAddress.ContractAddress;
  readonly contractState: ExecutableTypes<L, R>['ContractState'];
};

export type CircuitContext<L extends ExecutableLedger, R extends ExecutableRuntime, PS> = ContractContext<L, R> & {
  readonly privateState: PS;
  readonly zswapLocalState?: ExecutableTypes<L, R>['ZswapLocalState'];
  readonly ledgerParameters?: ExecutableTypes<L, R>['LedgerParameters'];
} & (
    | { readonly stateProvider?: undefined; readonly parentBlockHash?: undefined }
    | {
        readonly stateProvider: ExecutableTypes<L, R>['ContractStateProvider'];
        readonly parentBlockHash: string;
      }
  );

export type DeployResultPublic<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly contractState: ExecutableTypes<L, R>['ContractState'];
};
export type DeployResultPrivate<L extends ExecutableLedger, R extends ExecutableRuntime, PS> = {
  readonly signingKey: SigningKey.SigningKey;
  readonly privateState: PS;
  readonly zswapLocalState: ExecutableTypes<L, R>['ZswapLocalState'];
};
export type DeployResult<L extends ExecutableLedger, R extends ExecutableRuntime, PS> = {
  readonly public: DeployResultPublic<L, R>;
  readonly private: DeployResultPrivate<L, R, PS>;
};

export type PartitionedTranscript<
  L extends ExecutableLedger,
  R extends ExecutableRuntime
> = ExecutableTypes<L, R>['PartitionedTranscript'];

export type ContractCallPublic<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly contractState: ExecutableTypes<L, R>['StateValue'];
  readonly publicTranscript: ExecutableTypes<L, R>['Op'][];
  readonly partitionedTranscript: PartitionedTranscript<L, R>;
};
export type ContractCallPrivate<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly input: ExecutableTypes<L, R>['AlignedValue'];
  readonly output: ExecutableTypes<L, R>['AlignedValue'];
  readonly privateTranscriptOutputs: ExecutableTypes<L, R>['AlignedValue'][];
};

export type ContractCall<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly contractAddress: ContractAddress.ContractAddress;
  readonly circuitId: string;
  readonly public: ContractCallPublic<L, R>;
  readonly private: ContractCallPrivate<L, R>;
  readonly communicationCommitment: Option.Option<ExecutableTypes<L, R>['CommunicationCommitmentData']>;
};

export type CallResult<
  L extends ExecutableLedger,
  R extends ExecutableRuntime,
  C extends Contract.Contract<PS>,
  PS,
  K extends Contract.ProvableCircuitId<C>
> = {
  readonly result: Contract.Contract.CircuitReturnType<C, K>;
  readonly privateState: PS | undefined;
  readonly zswapLocalState: ExecutableTypes<L, R>['ZswapLocalState'];
  readonly events: ExecutableTypes<L, R>['LogEvent'][];
  readonly calls: readonly ContractCall<L, R>[];
};

export type MaintenanceResultPublic<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly maintenanceUpdate: ExecutableTypes<L, R>['MaintenanceUpdate'];
};
export type MaintenanceResultPrivate = {
  readonly signingKey: SigningKey.SigningKey;
};
export type MaintenanceResult<L extends ExecutableLedger, R extends ExecutableRuntime> = {
  readonly public: MaintenanceResultPublic<L, R>;
  readonly private: MaintenanceResultPrivate;
};

/** The services required as context for executing contracts. */
export type Context = ZKConfigurationService | Configuration.Keys;

/** An error occurred while executing a constructor, or a circuit, of an executable contract. */
export type ContractExecutionError =
  | ContractRuntimeError.ContractRuntimeError
  | ContractConfigurationError.ContractConfigurationError
  | ZKConfigurationReadError;

/** An executable form of a Compact compiled contract, bound to one era pair. */
export interface ContractExecutable<
  L extends ExecutableLedger,
  R extends ExecutableRuntime,
  in out C extends Contract.Contract<PS>,
  PS,
  out E = never,
  out Rq = never
> extends Pipeable {
  readonly compiledContract: CompiledContract<C, PS>;

  /**
   * The era this executable executes against — the `era` descriptor of the ledger binding it was
   * built from.
   *
   * @remarks
   * An executable's era is fixed when {@link makeExecutable} is applied, which happens at an
   * *import*: a consumer picks it by importing `/v8/effect` or `/v9/effect`. A host that selects an
   * era by some other route — `compact-js-command`'s `--ledger-era`, which chooses the era of the
   * intents and state files it builds — therefore has two era choices to reconcile, and no way to
   * see the second one without this. Comparing them turns a mismatch into a named failure at the
   * start of the command, instead of a WASM rejection several conversions later whose message names
   * neither era.
   */
  readonly era: L['era'];

  initialize(
    initialPrivateState: PS,
    ...args: Contract.Contract.InitializeParameters<C>
  ): Effect.Effect<DeployResult<L, R, PS>, E, Rq>;

  circuit<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    circuitContext: CircuitContext<L, R, PS>,
    ...args: Contract.Contract.CircuitParameters<C, K>
  ): Effect.Effect<CallResult<L, R, C, PS, K>, E, Rq>;

  getProvableCircuitIds(): Contract.ProvableCircuitId<C>[];

  replaceContractMaintenanceAuthority(
    newSigningKey: Option.Option<SigningKey.SigningKey>,
    contractContext: ContractContext<L, R>
  ): Effect.Effect<MaintenanceResult<L, R>, E, Rq>;

  removeContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    contractContext: ContractContext<L, R>
  ): Effect.Effect<MaintenanceResult<L, R>, E, Rq>;

  addOrReplaceContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
    provableCircuitId: K,
    verifierKey: Contract.VerifierKey,
    contractContext: ContractContext<L, R>
  ): Effect.Effect<MaintenanceResult<L, R>, E, Rq>;
}

// A function that receives an `Effect`, and captures it within another `Effect` that is bound to
// some specified error and context type.
type Transform<E, R> = <A>(effect: Effect.Effect<A, any, any>) => Effect.Effect<A, E, R>;

const DEFAULT_CMA_THRESHOLD = 1;
const DEFAULT_SIGNATURE_INDEX = 0n;

// The maintenance authority's counter, off whichever era's contract state. Every ledger era
// compact-js binds exposes it identically (a `bigint` on `contractState.maintenanceAuthority`), and
// `ExecutableRuntime` keeps the state itself opaque so that a binding's own class type reaches the
// public API unchanged — so the narrowing lives here, once, instead of at each of its two uses.
const authorityCounterOf = (contractState: unknown): bigint =>
  (contractState as { maintenanceAuthority: { counter: bigint } }).maintenanceAuthority.counter;

/**
 * Builds the contract-execution API for one era pair.
 *
 * @param ledger The era's ledger facade (`internal/era/v8Ledger.ts`, `effect/Ledger.ts`, …).
 * @param runtime The compact-runtime facade that era pairs with.
 */
export const makeExecutable = <
  L extends ExecutableLedger,
  // `R`'s line must be the one `L`'s era pairs with, so `makeExecutable(V8Ledger, V9Runtime)` does
  // not compile. `makeConversions` has carried the identical constraint since the conversions were
  // parameterised; this module — which builds circuit contexts, partitions transcripts and signs
  // maintenance updates — was left claiming the guarantee in prose while accepting any pair. The
  // two `current.ts` files are chosen independently, and `CompactRuntime.test.ts` compares only the
  // *bound* pair at run time, so a mispaired era-pinned entry was caught nowhere.
  R extends ExecutableRuntime & { readonly line: L['era']['runtime'] }
>(
  ledger: L,
  runtime: R
) => {
  type Types = ExecutableTypes<L, R>;

  // Partition the public transcripts of every call in the trace in a single batch.
  //
  // `partitionTranscripts` builds a caller->callee call graph across the whole batch by matching
  // each callee's communication commitment against the commitments its caller claimed, so it must
  // see every call at once (see midnight-ledger `construct.rs::partition_transcripts`). The
  // commitment rides on the *callee's* pre-transcript (`commCommData.commComm`); the root call has
  // no commitment and becomes the graph root. The returned array is in the same order as `trace`.
  const partitionAllTranscripts = (
    // The era-neutral trace-entry type supplied by whichever runtime line is bound. On 0.19 it is
    // the runtime's own `CallProofData`; on 0.16 it is synthesised by that binding's
    // `readExecution` from the flat frame.
    trace: readonly Types['TraceEntry'][],
    ledgerParameters: Types['LedgerParameters'] | undefined
  ): Effect.Effect<PartitionedTranscript<L, R>[], ContractRuntimeError.ContractRuntimeError> =>
    Effect.gen(function* () {
      // Each pre-transcript is built from the *initial* context (whose own commitments arrive with
      // its `block`), then given the *final* context's commitments on top — the set the partitioner
      // matches callers to callees on.
      const preTranscripts = yield* Effect.forEach(trace, (entry) =>
        ledger.fromRuntimeQueryContext(entry.initialQueryContext as never).pipe(
          Effect.flatMap((initialContext) =>
            tryBoundary('Unexpected error building call pre-transcript', () => {
              const finalQueryContext = entry.finalQueryContext as { comIndices: Iterable<[never, never]> };
              return new ledger.PreTranscript(
                Array.from(finalQueryContext.comIndices).reduce(
                  (queryContext: unknown, comEntry) =>
                    (queryContext as { insertCommitment(...args: [never, never]): unknown }).insertCommitment(
                      ...comEntry
                    ),
                  initialContext
                ) as never,
                [...entry.publicTranscript] as never,
                // The commitment itself, not the pair it arrives in: `commCommData` also carries
                // the caller's randomness, which stays private. `undefined` for the root call,
                // which is no one's callee.
                (entry.commCommData as { commComm: unknown } | undefined)?.commComm as never
              );
            })
          )
        )
      );
      const partitioned = yield* tryBoundary('Unexpected error partitioning call transcripts', () =>
        ledger.partitionTranscripts(
          preTranscripts as never,
          (ledgerParameters ?? ledger.LedgerParameters.initialParameters()) as never
        )
      );
      return partitioned.length === trace.length
        ? (partitioned as PartitionedTranscript<L, R>[])
        : yield* ContractRuntimeError.make(
            `Expected ${trace.length} transcript partition pairs, received: ${partitioned.length}`
          );
    });

  class ContractExecutableImpl<C extends Contract.Contract<PS>, PS, E, Rq>
    implements ContractExecutable<L, R, C, PS, E, Rq>
  {
    compiledContract: CompiledContract<C, PS>;
    transform: Transform<E, Rq>;
    // Read off the binding this factory was applied to, so `provide`'s rebuilt instance carries the
    // same era without it having to be threaded through the constructor.
    readonly era: L['era'] = ledger.era;

    constructor(compiledContract: CompiledContract<C, PS, never>, transform: Transform<E, Rq> = identity) {
      this.compiledContract = compiledContract;
      this.transform = transform;
    }

    pipe() {
      return pipeArguments(this, arguments); // eslint-disable-line prefer-rest-params
    }

    initialize(
      initialPrivateState: PS,
      ...args: Contract.Contract.InitializeParameters<C>
    ): Effect.Effect<DeployResult<L, R, PS>, E, Rq> {
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
              // Read back as *this executable's* era. `Contract` describes a compiled contract
              // era-free — it has to, since one description must cover every era compact-js binds —
              // so it promises only `currentPrivateState`. The remaining members are era types, and
              // the era that applies is the one whose `createConstructorContext` built the argument
              // on the line below: a contract compiled for another line throws
              // `checkRuntimeVersion` when its module is imported, long before this call.
              const { currentContractState, currentPrivateState, currentZswapLocalState } =
                (await contract.initialState(
                  runtime.createConstructorContext(
                    initialPrivateState as never,
                    CoinPublicKey.asHex(keyConfig.coinPublicKey) as never
                  ),
                  ...args
                )) as {
                  currentContractState: Types['ContractState'];
                  currentPrivateState: PS;
                  currentZswapLocalState: Types['EncodedZswapLocalState'];
                };
              return {
                contractState: currentContractState,
                privateState: currentPrivateState,
                zswapLocalState: runtime.decodeZswapLocalState(currentZswapLocalState as never) as Types['ZswapLocalState']
              };
            },
            catch: (err: unknown) =>
              err instanceof runtime.CompactError
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
                // The era's contract state, as the members used below: every line compact-js binds
                // exposes the same three, and they are reached through one narrowing rather than
                // one per statement.
                const state = contractState as {
                  operation(circuitId: string): { verifierKey: unknown } | undefined;
                  setOperation(circuitId: string, operation: unknown): void;
                  maintenanceAuthority: unknown;
                };

                for (const [provableCircuitId, verifierKey] of verifierKeys) {
                  // If there is no verifier key for this circuit, raise an error.
                  if (Option.isNone(verifierKey)) {
                    return yield* ContractConfigurationError.make(
                      `Failed to find a verifier key for circuit '${provableCircuitId}'`,
                      contractState
                    );
                  }

                  // `operation()` crosses the runtime WASM boundary, so it throws on a state built
                  // against a second instantiation rather than returning `undefined`. Unguarded in
                  // this generator body that throw would be a defect, escaping the declared error
                  // channel — the `undefined` check below only covers the circuit-not-found case.
                  let operation: ReturnType<typeof state.operation>;
                  try {
                    operation = state.operation(provableCircuitId);
                  } catch (err: unknown) {
                    return yield* ContractConfigurationError.make(
                      `Failed to read the operation for circuit '${provableCircuitId}' from the given contract state`,
                      contractState,
                      err
                    );
                  }

                  if (!operation) {
                    return yield* ContractConfigurationError.make(
                      `Circuit '${provableCircuitId}' is undefined for the given contract state`,
                      contractState
                    );
                  }

                  try {
                    operation.verifierKey = verifierKey.value;
                    state.setOperation(provableCircuitId, operation);
                  } catch (err: unknown) {
                    return yield* ContractConfigurationError.make(
                      `Failed to configure verifier key for circuit '${provableCircuitId}' for the given contract state`,
                      contractState,
                      err
                    );
                  }
                }

                const [cma, signingKey] = yield* this.createMaintenanceAuthority(keyConfig.getSigningKey());

                // A runtime WASM setter, and the one that reports `expected instance of
                // ContractMaintenanceAuthority` when the state and the authority come from two
                // copies of the runtime. Guarded for the same reason as `setOperation` above.
                try {
                  state.maintenanceAuthority = cma;
                } catch (err: unknown) {
                  return yield* ContractConfigurationError.make(
                    'Failed to set the maintenance authority on the given contract state',
                    contractState,
                    err
                  );
                }

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
      circuitContext: CircuitContext<L, R, PS>,
      ...args: Contract.Contract.CircuitParameters<C, K>
    ): Effect.Effect<CallResult<L, R, C, PS, K>, E, Rq> {
      return Effect.all({
        keyConfig: Configuration.Keys,
        contract: this.createContract()
      }).pipe(
        Effect.flatMap(({ keyConfig, contract }) =>
          Effect.tryPromise({
            try: async () => {
              // Narrowed to *this executable's* era, for the same reason `initialize` narrows the
              // constructor result: `Contract` describes a circuit era-free (an opaque context in,
              // `{ result }` out), while `readExecution` below reads the line's own results object.
              const circuit = contract.provableCircuits[provableCircuitId] as
                | ((context: unknown, ...args: Contract.Contract.CircuitParameters<C, K>) => Promise<unknown>)
                | undefined;
              if (!circuit) {
                throw new Error(`Circuit ${this.compiledContract.tag}#${provableCircuitId} could not be found.`);
              }
              const zswapLocalState = circuitContext.zswapLocalState
                ? runtime.encodeZswapLocalState(circuitContext.zswapLocalState as never)
                : runtime.emptyZswapLocalState(CoinPublicKey.asHex(keyConfig.coinPublicKey) as never);
              // Both the context build and the result projection go through the runtime seam's
              // execution adapter rather than `createCircuitContext`/`context.callProofDataTrace`
              // directly. The two lines disagree on the argument order, on whether a circuit id is
              // even a parameter, and on where proof data lands; the adapter presents one view of
              // both. `readExecution` is called inside this `try` so an era that cannot honour the
              // request (0.16 given a cross-contract state provider) surfaces through the
              // `ContractRuntimeError` mapping below instead of escaping as a defect.
              const runtimeContext = runtime.createExecutionContext({
                circuitId: provableCircuitId,
                address: circuitContext.address,
                zswapLocalState,
                contractState: circuitContext.contractState,
                privateState: circuitContext.privateState,
                stateProvider: circuitContext.stateProvider,
                parentBlockHash: circuitContext.parentBlockHash
              } as never);
              return runtime.readExecution((await circuit(runtimeContext, ...args)) as never);
            },
            catch: identity
          }).pipe(
            Effect.flatMap((execution) =>
              Effect.gen(function* () {
                // Every call made while executing the circuit, in trace order (callees first, the
                // root call last). For a circuit with no cross-contract calls this has length 1 —
                // which is the only case a ledger 8 build can produce.
                const trace = execution.trace as readonly Types['TraceEntry'][];
                const zswapLocalState = execution.zswapLocalState as Types['EncodedZswapLocalState'] | undefined;
                if (zswapLocalState === undefined) {
                  return yield* ContractRuntimeError.make(
                    `Circuit '${provableCircuitId}' returned no zswap local state`
                  );
                }
                // Validate the log events emitted by the VM before surfacing them: they are
                // untrusted VM output and are serialized verbatim for external (indexer/DApp)
                // consumption. A structural failure is funnelled through the `ContractRuntimeError`
                // mapping below. Events are a single execution-wide list, each tagged with the
                // emitting contract's address; a per-call view is a filter over that address (see
                // compact-runtime). On a line that cannot emit events the list is statically empty,
                // so this is a no-op there rather than a capability this module assumes.
                yield* validateEvents(execution.events);
                // Partition all calls' transcripts together (the partitioner needs the whole batch
                // to reconstruct the caller/callee graph).
                const partitioned = yield* partitionAllTranscripts(trace, circuitContext.ledgerParameters);
                const calls: ContractCall<L, R>[] = yield* Effect.forEach(trace, (entry, i) =>
                  Effect.gen(function* () {
                    const partitionedTranscript = partitioned[i];
                    if (partitionedTranscript === undefined) {
                      // Unreachable: `partitionAllTranscripts` guarantees one partition pair per
                      // trace entry. Guarded so the mapping is sound under
                      // `noUncheckedIndexedAccess`.
                      return yield* ContractRuntimeError.make(
                        `Missing partitioned transcript for call ${i} ('${entry.circuitId}')`
                      );
                    }
                    return {
                      contractAddress: ContractAddress.ContractAddress(entry.contractAddress),
                      circuitId: entry.circuitId,
                      public: {
                        contractState: (entry.finalQueryContext as { state: { state: Types['StateValue'] } }).state
                          .state,
                        // Copied because the era-neutral trace exposes a readonly view while the
                        // public `ContractCall` field is mutable; narrowing that field would be a
                        // breaking type change for consumers.
                        publicTranscript: [...entry.publicTranscript],
                        partitionedTranscript
                      },
                      private: {
                        input: entry.input,
                        output: entry.output,
                        privateTranscriptOutputs: [...entry.privateTranscriptOutputs]
                      },
                      communicationCommitment: Option.fromNullable(entry.commCommData)
                    };
                  })
                );
                // Unlike the runtime calls that build the context above, this one runs in the
                // generator body rather than inside `Effect.tryPromise`'s callback, so it needs the
                // seam's wrapper: an unwrapped throw here would be a defect, and the terminating
                // `Effect.mapError` below maps the error channel only. That would make this
                // method's declared `ContractExecutionError` channel unsound for consumers.
                const decodedZswapLocalState = yield* tryBoundary(
                  `Failed to decode the zswap local state returned by circuit '${provableCircuitId}'`,
                  () => runtime.decodeZswapLocalState(zswapLocalState as never) as Types['ZswapLocalState']
                );
                // `result`, `privateState`, and `zswapLocalState` belong to the root contract;
                // `events` is the whole execution's log-event list (each tagged with its emitter).
                return {
                  result: execution.result as Contract.Contract.CircuitReturnType<C, K>,
                  privateState: execution.privateState as PS | undefined,
                  zswapLocalState: decodedZswapLocalState,
                  // Copied rather than narrowing `CallResult.events` to `readonly`: the adapter
                  // hands back a readonly view, and changing the public field's mutability would be
                  // a breaking type change for consumers. On a line that cannot emit events this is
                  // `never[]`, so the copy is of an empty array.
                  events: [...execution.events] as Types['LogEvent'][],
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
      this: ContractExecutableImpl<C, PS, E, Rq>,
      newSigningKey: Option.Option<SigningKey.SigningKey>,
      contractContext: ContractContext<L, R>
    ): Effect.Effect<MaintenanceResult<L, R>, E, Rq> {
      return Effect.all({
        keyConfig: Configuration.Keys
      }).pipe(
        Effect.flatMap(({ keyConfig }) =>
          Effect.gen(this, function* () {
            const { contractState } = contractContext;
            const [cma, signingKey] = yield* this.createMaintenanceAuthority(newSigningKey, contractState);
            const ledger_cma = yield* ledger.fromRuntimeMaintenanceAuthority(cma as never);
            const update = yield* this.createSignedMaintenanceUpdate(
              () => {
                return Either.right([new ledger.ReplaceAuthority(ledger_cma as never)]);
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
      this: ContractExecutableImpl<C, PS, E, Rq>,
      provableCircuitId: K,
      contractContext: ContractContext<L, R>
    ): Effect.Effect<MaintenanceResult<L, R>, E, Rq> {
      return Effect.all({
        keyConfig: Configuration.Keys
      }).pipe(
        Effect.flatMap(({ keyConfig }) =>
          Effect.gen(this, function* () {
            return yield* this.createSignedMaintenanceUpdate(
              () => {
                return Either.right([
                  new ledger.VerifierKeyRemove(provableCircuitId as never, ledger.makeContractOperationVersion() as never)
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

    addOrReplaceContractOperation<K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>>(
      provableCircuitId: K,
      verifierKey: Contract.VerifierKey,
      contractContext: ContractContext<L, R>
    ): Effect.Effect<MaintenanceResult<L, R>, E, Rq> {
      return Effect.all({
        keyConfig: Configuration.Keys
      }).pipe(
        Effect.flatMap(({ keyConfig }) =>
          Effect.gen(this, function* () {
            return yield* this.createSignedMaintenanceUpdate(
              () => {
                return Either.right([
                  new ledger.VerifierKeyInsert(
                    provableCircuitId as never,
                    ledger.makeVersionedVerifierKey(verifierKey as never) as never
                  )
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
      createUpdateFn: () => Either.Either<unknown[], ContractConfigurationError.ContractConfigurationError>,
      keyConfig: Configuration.Configuration.Keys,
      contractContext: ContractContext<L, R>
    ): Either.Either<MaintenanceResult<L, R>, ContractConfigurationError.ContractConfigurationError> {
      const { address, contractState } = contractContext;
      const currentSigningKey = keyConfig.getSigningKey();
      if (Option.isNone(currentSigningKey)) {
        return Either.left(
          ContractConfigurationError.make(
            'Signing key required to authorize contract maintenance update',
            contractState
          )
        );
      }
      const signingKey = currentSigningKey.value;
      const ledgerSigningKey = ledger.fromPlatformSigningKey(signingKey, contractState);
      if (Either.isLeft(ledgerSigningKey)) return Either.left(ledgerSigningKey.left);
      // `createUpdateFn` builds ledger `SingleUpdate`s, so it crosses the ledger boundary: a
      // `VerifierKeyInsert` over a key the era rejects throws here. `Contract.VerifierKey` is
      // `Brand.nominal` and validates nothing, so any file a caller reads reaches this line.
      let update: Either.Either<unknown[], ContractConfigurationError.ContractConfigurationError>;
      try {
        update = createUpdateFn();
      } catch (err: unknown) {
        return Either.left(
          ContractConfigurationError.make('Failed to build the contract maintenance update', contractState, err)
        );
      }
      if (Either.isLeft(update)) return Either.left(update.left);

      // The constructor validates `address` and the updates, and the counter read is a runtime WASM
      // getter — all three reject by throwing.
      let maintenanceUpdate: {
        dataToSign: unknown;
        addSignature(index: bigint, signature: unknown): Types['MaintenanceUpdate'];
      };
      try {
        maintenanceUpdate = new ledger.MaintenanceUpdate(
          address as never,
          update.right as never,
          authorityCounterOf(contractState) as never
        ) as typeof maintenanceUpdate;
      } catch (err: unknown) {
        return Either.left(
          ContractConfigurationError.make(
            `Failed to create a maintenance update for contract '${address}'`,
            contractState,
            err
          )
        );
      }

      // `addSignature` is inside this block with `signData`: it rejects a signature whose scheme the
      // era's authority does not accept, which is the same failure surfaced one call later.
      try {
        const signature = ledger.signData(ledgerSigningKey.right as never, maintenanceUpdate.dataToSign as never);
        return Either.right({
          public: {
            maintenanceUpdate: maintenanceUpdate.addSignature(DEFAULT_SIGNATURE_INDEX, signature)
          },
          private: {
            signingKey
          }
        });
      } catch (err: unknown) {
        return Either.left(
          ContractConfigurationError.make(
            `Failed to sign contract maintenance update with a '${signingKey.tag}' signing key`,
            contractState,
            err
          )
        );
      }
    }

    protected createMaintenanceAuthority(
      key: Option.Option<SigningKey.SigningKey>,
      contractState?: Types['ContractState']
    ): Either.Either<
      [Types['ContractMaintenanceAuthority'], SigningKey.SigningKey],
      ContractConfigurationError.ContractConfigurationError
    > {
      // `makeSampleSigningKey` crosses the runtime boundary and rejects a scheme the bound line
      // cannot sample. Guarded here rather than in the `try` below, which starts after the key is
      // already needed — an unguarded throw in this `Either`-returning helper is a defect at every
      // caller.
      let signingKey: SigningKey.SigningKey;
      try {
        signingKey = Option.match(key, {
          onSome: identity,
          // Tag the sampled key with the era's scheme too: `SigningKey.make` otherwise defaults the
          // tag to platform-js's own constant, which would label an era's non-schnorr sample as
          // schnorr and sign with the wrong scheme while still passing the allowlist check below.
          // Sampled through the seam's `makeSampleSigningKey`/`signingKeyHex` pair rather than the
          // runtime's own `sampleSigningKey`, because that function is era-varying on both sides:
          // onchain-runtime-v3 takes no argument and returns a bare hex string, v4 takes a scheme
          // and returns `{ tag, value }`. Reading `.value` here would compile against only one line.
          onNone: () =>
            SigningKey.make(
              runtime.signingKeyHex(runtime.makeSampleSigningKey(ledger.era.defaultCmaSignatureKind as never) as never),
              ledger.era.defaultCmaSignatureKind
            )
        });
      } catch (err: unknown) {
        return Either.left(
          ContractConfigurationError.make(
            `Failed to sample a '${ledger.era.defaultCmaSignatureKind}' contract maintenance authority signing key`,
            contractState,
            err
          )
        );
      }
      const ledgerSigningKey = ledger.fromPlatformSigningKey(signingKey, contractState);
      if (Either.isLeft(ledgerSigningKey)) return Either.left(ledgerSigningKey.left);
      try {
        return Either.right([
          new runtime.ContractMaintenanceAuthority(
            [runtime.signatureVerifyingKey(ledgerSigningKey.right as never)] as never,
            DEFAULT_CMA_THRESHOLD as never,
            (contractState
              ? authorityCounterOf(contractState) + 1n
              : 0n) as never
          ) as Types['ContractMaintenanceAuthority'],
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
   * Takes a Compact compiled contract, and makes it executable against this era pair.
   *
   * @param compiledContract A `CompiledContract`.
   * @returns A `ContractExecutable` for `compiledContract`.
   *
   * @category constructors
   */
  const make: <C extends Contract.Contract<PS>, PS>(
    compiledContract: CompiledContract<C, PS, never>
  ) => ContractExecutable<L, R, C, PS, ContractExecutionError, Context> = <C extends Contract.Contract<PS>, PS>(
    compiledContract: CompiledContract<C, PS, never>
  ) => new ContractExecutableImpl<C, PS, ContractExecutionError, Context>(compiledContract);

  /**
   * Provides a layer to the executable contract.
   *
   * @category combinators
   */
  const provide: {
    <LA, LE, LR>(layer: Layer.Layer<LA, LE, LR>): <C extends Contract.Contract<PS>, PS, E, Rq>(
      self: ContractExecutable<L, R, C, PS, E, Rq>
    ) => ContractExecutable<L, R, C, PS, E | LE, LR | Exclude<Rq, LA>>;
    <C extends Contract.Contract<PS>, PS, E, Rq, LA, LE, LR>(
      self: ContractExecutable<L, R, C, PS, E, Rq>,
      layer: Layer.Layer<LA, LE, LR>
    ): ContractExecutable<L, R, C, PS, E | LE, LR | Exclude<Rq, LA>>;
  } = dual(
    2,
    <C extends Contract.Contract<PS>, PS, E, Rq, LA, LE, LR>(
      self: ContractExecutable<L, R, C, PS, E, Rq>,
      layer: Layer.Layer<LA, LE, LR>
    ) =>
      new ContractExecutableImpl<C, PS, E | LE, LR | Exclude<Rq, LA>>(self.compiledContract, (e) =>
        Effect.provide(e, layer)
      )
  );

  return { make, provide } as const;
};
