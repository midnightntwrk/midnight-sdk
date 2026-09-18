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
 * The command handlers applied to the **ledger 9 / compact-runtime 0.19** era pair.
 *
 * @remarks
 * Nothing here is era logic: the era arrives as an argument, exactly as it does in `compact-js`'s
 * `internal/era/v9Executable.ts`. The module is a curated application — the two facades, the two
 * capabilities ledger 9 has, and the four handler factories applied to them.
 *
 * Pinned to `@midnight-ntwrk/compact-js/v9/effect` rather than the unsuffixed entry. The
 * distinction is the one the library draws for itself: the unsuffixed entry means "whichever era
 * this build bound", so using it here would make a `--ledger-era 9` invocation silently follow the
 * next era swap while still calling itself 9 (midnight-sdk#387/#388).
 *
 * @internal
 */
import { CompactRuntime, type Contract, type ContractExecutable, Ledger } from '@midnight-ntwrk/compact-js/v9/effect';
import { FileSystemContractStateProvider } from '@midnight-ntwrk/compact-js-node/effect';

import * as CircuitCommand from '../circuitCommand.js';
import * as DeployCommand from '../deployCommand.js';
import * as MaintainCircuitCommand from '../maintainCircuitCommand.js';
import * as MaintainContractCommand from '../maintainContractCommand.js';
import type * as EraBinding from './binding.js';
import { type EraCommands } from './registry.js';

/**
 * Ledger 9 has both of the capabilities the commands gate on.
 *
 * @remarks
 * The state provider is built against **this** era's `Ledger`, not the bound one: it decodes the
 * files in `--contract-states-dir` with the same conversions the handler uses for `--input`, so a
 * cross-contract callee cannot be decoded by one era and executed by another.
 */
const capabilities = {
  makeContractStateProvider: (baseFolderPath: string) =>
    FileSystemContractStateProvider.make(baseFolderPath, { ledger: Ledger }),
  contractEvents: true
} satisfies EraBinding.EraCapabilities;

/**
 * Build-time conformance: the executable a `/v9/effect` configuration builds really does satisfy
 * the era-agnostic view `ConfigCompiler.ModuleExport` promises. See
 * {@link EraBinding.AssertIsCommandExecutable} for why this cannot be left to the import.
 */
type ProbePrivateState = { readonly count: number };
type _ExecutableIsCommandExecutable = EraBinding.AssertIsCommandExecutable<
  ContractExecutable.ContractExecutable<
    Contract.Contract<ProbePrivateState>,
    ProbePrivateState,
    ContractExecutable.ContractExecutionError,
    ContractExecutable.ContractExecutable.Context
  >,
  ProbePrivateState
>;

/** @internal */
export const commands: EraCommands = {
  era: Ledger.era,
  circuit: CircuitCommand.makeHandler(Ledger, CompactRuntime, capabilities),
  deploy: DeployCommand.makeHandler(Ledger, CompactRuntime),
  maintainCircuit: MaintainCircuitCommand.makeHandler(Ledger),
  maintainContract: MaintainContractCommand.makeHandler(Ledger)
};
