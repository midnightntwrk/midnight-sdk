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
 * The **ledger 9** era-pinned entry (midnight-sdk#387/#388). The `v9` suffix names the ledger
 * era this entry targets — ledger 9 — not this package's own version. Consumers that must speak
 * a specific ledger era (e.g. across a hardfork window) bind to this path; the unsuffixed root
 * export remains an alias for the package's current era.
 */
export * from '../index.js';
