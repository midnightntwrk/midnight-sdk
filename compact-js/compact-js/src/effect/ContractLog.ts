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
 * Standard event types emitted from Compact contracts via the `emit` expression.
 *
 * Events flow from contract emission → ledger wrapping → indexer storage → DApp queries.
 *
 * @remarks
 * - **Event Version**: Phase 1 wire format (version 1). Bumped when on-chain
 *   VersionedLogItem layout or per-event payload format changes.
 * - **Max Event Size**: 512 KiB (524,288 bytes) per event. Must match
 *   MAX_EVENT_SIZE in midnight-ledger's onchain-vm.
 * - **Standard Events**: Fixed schemas for token operations and lifecycle events
 *   - `ShieldedSpend`, `ShieldedReceive`, `ShieldedMint`, `ShieldedBurn`
 *     (indexed fields: `nullifier`, `commitment`)
 *   - `UnshieldedSpend`, `UnshieldedReceive`, `UnshieldedMint`, `UnshieldedBurn`
 *     (indexed fields: `sender`, `domainSep`, `tokenType`)
 *   - `Paused`, `Unpaused` (lifecycle events, empty payload)
 * - **Custom Events**: Use `Misc` type for contract-specific data with
 *   `name` and `payload` fields
 * - **Non-Consensus**: Events are NOT consensus state; indexer controls retention
 */
export type { LogEvent } from '@midnight-ntwrk/compact-runtime';
