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

import { ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import { Effect } from 'effect';

/** @internal */
export const asLedgerContractState = Ledger.fromRuntimeContractState;

/** @internal */
export const asLedgerContractStateFromBytes = Ledger.contractStateFromBytes;

/** @internal */
export const asContractState = Ledger.toRuntimeContractState;

/**
 * Resolves the {@link Ledger.ContractOperation} for a circuit from a contract's ledger state, failing
 * with a {@link ContractRuntimeError.ContractRuntimeError} if absent. Used when assembling a
 * cross-contract call's prototype: a state with no operation for the called circuit (e.g. a
 * `--contract-states-dir` file for the wrong contract) would otherwise be cast from `undefined` and
 * surface as an opaque native fault.
 *
 * @internal
 */
export const operationForCircuit: (
  contractState: Ledger.ContractState,
  circuitId: string,
  contractAddress: string
) => Effect.Effect<Ledger.ContractOperation, ContractRuntimeError.ContractRuntimeError> = (
  state,
  circuitId,
  contractAddress
) => {
  const operation = state.operation(circuitId);
  return operation === undefined
    ? ContractRuntimeError.make(`Contract state for '${contractAddress}' has no operation for circuit '${circuitId}'.`)
    : Effect.succeed(operation);
};
