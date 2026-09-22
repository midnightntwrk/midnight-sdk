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
 * The unsuffixed `/effect` entry, which targets whichever era this build is bound to — ledger 9
 * today.
 *
 * @remarks
 * Composed from the two capability levels rather than listing modules directly, so that an
 * era-scoped entry can take only the levels its runtime line supports
 * (midnight-sdk#387/#388):
 *
 * - `eraNeutralSurface` — everything any bound era can provide.
 * - `contractEventsSurface` — contract events, which are era-impossible below ledger 9 (see that
 *   module for why) and so are absent from an older era's entry rather than present and failing
 *   at run time.
 *
 * The composed surface is identical to what this entry exported before the split;
 * `LedgerEra.test.ts` pins both that equivalence and the split itself. When the bound era
 * advances past a level, drop the corresponding line here — do not re-add modules individually,
 * or the levels stop describing the eras.
 */
export * from './internal/contractEventsSurface.js';
export * from './internal/eraNeutralSurface.js';
