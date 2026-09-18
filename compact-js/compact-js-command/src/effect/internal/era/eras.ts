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
 * Which ledger eras `--ledger-era` accepts, and which one it defaults to.
 *
 * @remarks
 * Deliberately a **leaf**: it names the eras without importing the era modules that implement them.
 * `options.ts` needs the accepted set while its options are being built, and the era modules import
 * the command modules, which import `options.ts` — so a list that lived in `registry.ts` would put
 * `options.ts` in a cycle and leave those bindings in the temporal dead zone at the moment the
 * option is constructed. Splitting the *names* from the *implementations* keeps the graph acyclic
 * with no lazy indirection anywhere.
 *
 * The two are still tied together: `registry.ts` builds its lookup with
 * `satisfies Record<SelectableLedgerEra, EraCommands>`, so adding an era here without an
 * `internal/era/v<N>.ts` — or adding one there that is not listed here — fails the build.
 *
 * @internal
 */
import { Ledger } from '@midnight-ntwrk/compact-js/effect';

/**
 * The ledger eras this CLI can select. One entry per `internal/era/v<N>.ts`, and per era-pinned
 * entry `@midnight-ntwrk/compact-js` publishes.
 */
export const SELECTABLE_LEDGER_ERAS = [8, 9] as const;

/** One of {@link SELECTABLE_LEDGER_ERAS}. */
export type SelectableLedgerEra = (typeof SELECTABLE_LEDGER_ERAS)[number];

/**
 * The era an invocation gets when `--ledger-era` is not given: the era this build *binds*, which is
 * also the era a `contract.config.ts` gets from the unsuffixed `@midnight-ntwrk/compact-js/effect`.
 * Defaulting to anything else would change the meaning of every existing configuration.
 */
export const DEFAULT_LEDGER_ERA: SelectableLedgerEra = Ledger.era.ledger;

/** Whether `ledgerEra` is an era this CLI can select. */
export const isSelectableLedgerEra = (ledgerEra: number): ledgerEra is SelectableLedgerEra =>
  (SELECTABLE_LEDGER_ERAS as readonly number[]).includes(ledgerEra);
