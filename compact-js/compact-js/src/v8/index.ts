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
 * The **ledger 8** era-pinned entry (midnight-sdk#387/#388). The `v8` suffix names the ledger era
 * this entry targets — ledger 8 — not this package's own version.
 *
 * @remarks
 * Same surface as `@midnight-ntwrk/compact-js/v8/effect`; see that module for what this era can
 * and cannot do, and why `ContractExecutable` is not among it yet.
 */
export * from './effect.js';
