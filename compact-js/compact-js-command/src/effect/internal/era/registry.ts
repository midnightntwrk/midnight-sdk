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
 * What `--ledger-era` selects.
 *
 * @remarks
 * One {@link EraCommands} per era-pinned entry `@midnight-ntwrk/compact-js` publishes, each holding
 * that era's application of the four handler factories. Imported only from `effect/index.ts`, where
 * each `Command` is wired to the handler it wants out of the selected era — so the era is resolved
 * once, at the top of an invocation, and every ledger and compact-runtime call the handler makes
 * belongs to it.
 *
 * This docblock carries no internal-marker JSDoc tag. A module docblock attaches to the file's
 * first statement, so under `stripInternal` the marker deletes it — here the imports every
 * declaration below is written in terms of, leaving typings that name namespaces they no longer
 * import. Privacy comes from `package.json` `exports` blocking `./effect/internal/*` instead. See
 * `compact-js`'s `internal/boundary.ts` for why this note does not spell the tag out.
 */
import { type Ledger } from '@midnight-ntwrk/compact-js/effect';

import type * as CircuitCommand from '../circuitCommand.js';
import { type CommandHandler } from '../command.js';
import type * as DeployCommand from '../deployCommand.js';
import type * as MaintainCircuitCommand from '../maintainCircuitCommand.js';
import type * as MaintainContractCommand from '../maintainContractCommand.js';
import { isSelectableLedgerEra, SELECTABLE_LEDGER_ERAS,type SelectableLedgerEra } from './eras.js';
import * as V8 from './v8.js';
import * as V9 from './v9.js';

/** Every command handler, bound to one era. @internal */
export interface EraCommands {
  /** This era's descriptor, as its `Ledger` facade reports it. */
  readonly era: Ledger.Era;
  readonly circuit: CommandHandler<CircuitCommand.Args & CircuitCommand.Options>;
  readonly deploy: CommandHandler<DeployCommand.Args & DeployCommand.Options>;
  readonly maintainCircuit: CommandHandler<MaintainCircuitCommand.Args & MaintainCircuitCommand.Options>;
  readonly maintainContract: CommandHandler<MaintainContractCommand.Args & MaintainContractCommand.Options>;
}

/**
 * The era command sets, keyed by ledger major.
 *
 * `satisfies Record<SelectableLedgerEra, EraCommands>` is what ties this to `eras.ts`: a listed era
 * with no entry here fails the build, and an entry here for an unlisted era is an excess property,
 * which `satisfies` rejects on an object literal.
 */
const commandsByEra = {
  8: V8.commands,
  9: V9.commands
} as const satisfies Record<SelectableLedgerEra, EraCommands>;

/**
 * Resolves the command set for a ledger era.
 *
 * @param ledgerEra The era `--ledger-era` yielded. Option parsing has already rejected anything
 * outside {@link SELECTABLE_LEDGER_ERAS}, so the guard below is a total-function formality rather
 * than a reachable user error — but it fails loudly rather than returning a silently wrong era if
 * the option and this registry ever disagree.
 *
 * @internal
 */
export const forLedgerEra = (ledgerEra: number): EraCommands => {
  if (!isSelectableLedgerEra(ledgerEra)) {
    throw new Error(
      `No command set for ledger era ${ledgerEra}; this build selects between ` +
        `${SELECTABLE_LEDGER_ERAS.join(', ')}.`
    );
  }
  return commandsByEra[ledgerEra];
};
