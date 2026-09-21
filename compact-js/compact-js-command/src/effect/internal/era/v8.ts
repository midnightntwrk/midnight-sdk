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
 * The command handlers applied to the **ledger 8 / compact-runtime 0.16** era pair.
 *
 * @remarks
 * The twin of `v9.ts`, and the reason `--ledger-era` is now a selection rather than a check: the
 * same four handler factories, the same four option sets, a different era passed in. Both era
 * command sets are live in one process, so `--ledger-era 8` and `--ledger-era 9` are two branches
 * of one binary rather than two builds.
 *
 * ## Capabilities
 *
 * Ledger 8 has neither of the two the commands gate on. `makeContractStateProvider` is **absent**
 * rather than a function that fails, mirroring how `/v8/effect` omits the contract-event modules
 * rather than exporting ones that throw (midnight-sdk#388): the `circuit` handler reads the absence
 * and rejects `--contract-states-dir` by name, before reading a single file.
 *
 * ## What a ledger 8 invocation still needs from its caller
 *
 * Selecting this era makes the *CLI* speak ledger 8 — its intents, its state decoding, its
 * conversions. It cannot make the contract speak it: a `contract.config.ts` targeting this era must
 * import `@midnight-ntwrk/compact-js/v8/effect` (which `invocationHandler` checks, by comparing the
 * executable's own era against the selected one), and the compiled artifact it loads resolves
 * `@midnight-ntwrk/compact-runtime` itself — by bare specifier, asserting
 * `checkRuntimeVersion('0.16.0')` on import — so that package must resolve to the 0.16 line where
 * the artifact lives. No CLI option can influence that; it is a resolution-level fact about the
 * caller's project.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first statement, so under `stripInternal` the marker deletes it — here the imports every
 * declaration below is written in terms of, leaving typings that name namespaces they no longer
 * import. Privacy comes from `package.json` `exports` blocking `./effect/internal/*` instead. See
 * `compact-js`'s `internal/boundary.ts` for why this note does not spell the tag out.
 */
import { CompactRuntime, type Contract, type ContractExecutable, Ledger } from '@midnight-ntwrk/compact-js/v8/effect';

import * as CircuitCommand from '../circuitCommand.js';
import * as DeployCommand from '../deployCommand.js';
import * as MaintainCircuitCommand from '../maintainCircuitCommand.js';
import * as MaintainContractCommand from '../maintainContractCommand.js';
import type * as EraBinding from './binding.js';
import { type EraCommands } from './registry.js';

/**
 * Ledger 8 has neither capability.
 *
 * @remarks
 * Not an omission awaiting a later fix. onchain-runtime-v3 has no `crossContractCall` and no
 * `ContractStateProvider` at all, and its `log` gather op carries a bare `EncodedStateValue` with
 * no emitting-contract address and nothing accumulating it on the circuit context — so events here
 * would be a rebuild against a different payload, not a binding. `compact-runtime` 0.16's
 * `createExecutionContext` rejects a state provider outright, which is the second gate behind this
 * one.
 */
const capabilities = {
  contractEvents: false
} satisfies EraBinding.EraCapabilities;

/**
 * Build-time conformance: the executable a `/v8/effect` configuration builds really does satisfy
 * the era-agnostic view `ConfigCompiler.ModuleExport` promises. See
 * {@link EraBinding.AssertIsCommandExecutable} for why this cannot be left to the import.
 */
type _NoZswapKeyDrift = EraBinding.AssertNoZswapKeyDrift<
  EraBinding.ZswapKeyDrift<CompactRuntime.EncodedZswapLocalState>
>;

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
