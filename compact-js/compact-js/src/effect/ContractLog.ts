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
   * Standard event types emitted from Compact contracts via the `log` expression.
   *
   * Events flow from contract emission → ledger wrapping → indexer storage → DApp 
  queries.
   *
   * @remarks
   * - **Standard Events (Phase 1)**: Fixed schemas for token operations and lifecycle 
  events
   *   - `ShieldedSpend`, `ShieldedReceive`, `ShieldedMint`, `ShieldedBurn` (with indexed 
  fields: `nullifier`, `commitment`)
   *   - `UnshieldedSpend`, `UnshieldedReceive`, `UnshieldedMint`, `UnshieldedBurn` (with 
  indexed fields: `sender`, `domainSep`, `tokenType`)
   *   - `Paused`, `Unpaused` (lifecycle events, empty payload)
   *
   * - **Custom Events**: Use the `Misc` type for contract-specific event data with `name`
  and `payload` fields
   *
   * - **Event Size**: Single event max 1 KB serialized (soft limit; oversized events 
  silently dropped)
   *
   * - **Event Storage**: Events compete with state writes for per-block write budget (~50
  KB total)
   *
   * - **Non-Consensus**: Events are NOT consensus state; indexer controls retention 
  policy
   *
   * @category events
   */
  export type { LogEvent } from '@midnight-ntwrk/compact-runtime';