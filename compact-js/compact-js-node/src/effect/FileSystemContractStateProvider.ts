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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ContractState, type ContractStateProvider } from '@midnight-ntwrk/compact-runtime';
import { ContractState as LedgerContractState } from '@midnight-ntwrk/ledger-v8';

/**
 * A {@link ContractStateProvider} that resolves contract states lazily from the file system.
 *
 * Each contract's state is read from `<baseFolderPath>/<address>`, serialized in the same
 * ledger format the `circuit` command consumes for its `--input` option (and that the
 * `midnight-node` toolkit's `contract-state` command produces). States are resolved **on
 * demand**: the Compact runtime invokes `getContractState` exactly once per cross-contract
 * callee — for the specific address it needs, at the moment it makes the call — and caches the
 * result for the remainder of the execution. Consequently the caller does not need to know
 * which contracts will be called in advance (no pre-fetching), and the circuit does not need
 * to be executed twice (no two-pass resolution).
 *
 * A missing state file resolves to `undefined`, which the runtime surfaces as an unresolved
 * cross-contract call.
 *
 * @param baseFolderPath The folder containing per-address contract-state files.
 * @param fileNameForAddress Maps a contract address to its file name within `baseFolderPath`.
 * Defaults to the address itself. Override this if the on-disk naming differs from the address
 * string the runtime uses.
 * @returns A {@link ContractStateProvider} backed by `baseFolderPath`.
 *
 * @category constructors
 */
export const make = (
  baseFolderPath: string,
  fileNameForAddress: (address: string) => string = (address) => address
): ContractStateProvider => ({
  getContractState: async (_blockHash: string, address: string): Promise<ContractState | undefined> => {
    const filePath = join(baseFolderPath, fileNameForAddress(address));

    let bytes: Uint8Array;
    try {
      bytes = await readFile(filePath);
    } catch (err) {
      // An absent state file means we have no state for this contract; the runtime treats that
      // as an unresolved cross-contract call. Any other error is unexpected and propagated.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }

    // Mirror the `circuit` command's `--input` deserialization: ledger-serialized bytes ->
    // ledger `ContractState` -> runtime `ContractState`.
    const ledgerContractState = LedgerContractState.deserialize(bytes);
    return ContractState.deserialize(ledgerContractState.serialize());
  }
});
