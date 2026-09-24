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
 * Contract execution pinned to the **ledger 8 / compact-runtime 0.16** era pair.
 *
 * @remarks
 * `internal/executable.ts` applied to this era's two facades, exactly as `effect/ContractExecutable.ts`
 * applies it to the bound era's. Every era-varying type below therefore resolves to ledger 8's and
 * 0.16's shapes as a consequence of the two arguments — `CircuitContext.contractState` is the 0.16
 * contract state, `MaintenanceResult.maintenanceUpdate` is ledger 8's — with no second declaration
 * to keep in step (midnight-sdk#387/#388).
 *
 * The era's *capabilities* come from the same place. `createExecutionContext` on the 0.16 binding
 * rejects a cross-contract state provider rather than ignoring it, and its `readExecution`
 * instantiates the event list as `never[]`, so `CallResult.events` here is statically empty: a
 * ledger 8 consumer cannot ask for what this era cannot do, and does not have to know why.
 */
import type * as Contract from '../../Contract.js';
import * as Internal from '../executable.js';
import * as Ledger from './v8Ledger.js';
import * as Runtime from './v8Runtime.js';

type EraLedger = typeof Ledger;
type EraRuntime = typeof Runtime;

const executable = Internal.makeExecutable(Ledger, Runtime);

/** An executable form of a Compact compiled contract, bound to ledger 8. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContractExecutable<in out C extends Contract.Contract<PS>, PS, out E = never, out R = never>
  extends Internal.ContractExecutable<EraLedger, EraRuntime, C, PS, E, R> {}

export declare namespace ContractExecutable {
  export type Context = Internal.Context;

  export type ContractContext = Internal.ContractContext<EraLedger, EraRuntime>;
  export type CircuitContext<PS> = Internal.CircuitContext<EraLedger, EraRuntime, PS>;
  export type GasCost = Internal.GasCost;

  export type DeployResultPublic = Internal.DeployResultPublic<EraLedger, EraRuntime>;
  export type DeployResultPrivate<PS> = Internal.DeployResultPrivate<EraLedger, EraRuntime, PS>;
  export type DeployResult<PS> = Internal.DeployResult<EraLedger, EraRuntime, PS>;

  export type PartitionedTranscript = Internal.PartitionedTranscript<EraLedger, EraRuntime>;
  export type CallPartitionInputs = Internal.CallPartitionInputs<EraLedger, EraRuntime>;
  export type ContractCallPublic = Internal.ContractCallPublic<EraLedger, EraRuntime>;
  export type ContractCallPrivate = Internal.ContractCallPrivate<EraLedger, EraRuntime>;
  export type ContractCall = Internal.ContractCall<EraLedger, EraRuntime>;

  export type CallResult<
    C extends Contract.Contract<PS>,
    PS,
    K extends Contract.ProvableCircuitId<C>
  > = Internal.CallResult<EraLedger, EraRuntime, C, PS, K>;

  export type MaintenanceResultPublic = Internal.MaintenanceResultPublic<EraLedger, EraRuntime>;
  export type MaintenanceResultPrivate = Internal.MaintenanceResultPrivate;
  export type MaintenanceResult = Internal.MaintenanceResult<EraLedger, EraRuntime>;
}

/**
 * An error occurred while executing a constructor, or a circuit, of an executable contract.
 *
 * @category errors
 */
export type ContractExecutionError = Internal.ContractExecutionError;

/**
 * Takes a Compact compiled contract, and makes it executable against ledger 8.
 *
 * @category constructors
 */
export const make = executable.make;

/**
 * Provides a layer to the executable contract.
 *
 * @category combinators
 */
export const provide = executable.provide;
