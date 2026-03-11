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

import { ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { LedgerParameters } from '@midnight-ntwrk/ledger-v8';
import { Effect } from 'effect';

/** @internal */
export const asLedgerParameters: (
  bytes: Uint8Array
) => Effect.Effect<LedgerParameters, ContractRuntimeError.ContractRuntimeError> =
  (bytes) => Effect.try({
    try: () => LedgerParameters.deserialize(bytes),
    catch: (err) => ContractRuntimeError.make('Unexpected error deserializing ledger parameters', err),
  });
