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

import { type CompactRuntime, ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import { Cause, Effect, Exit } from 'effect';

/**
 * The ledger conversions this provider needs to turn on-disk bytes into a runtime contract state.
 *
 * @remarks
 * Structural, so that **any** era entry's `Ledger` satisfies it — `@midnight-ntwrk/compact-js/effect`
 * (the bound era) or an era-pinned one such as `/v9/effect`. The provider used to reach the bound
 * facade directly, which reads as harmless while one era exists and is not: a cross-contract state
 * provider is handed to a *circuit context*, and that context belongs to whichever era the caller
 * built it from. The first time `current.ts` advances, a consumer holding the retained era through
 * its pinned entry would pass this provider into that era's execution and be handed states decoded
 * by the new one — a mismatch that surfaces inside WASM, far from the decision that caused it
 * (midnight-sdk#387/#388).
 *
 * `S` is the era's runtime contract state, inferred from `toRuntimeContractState`, so the provider
 * this module returns is typed for the era it was given rather than for the bound one.
 */
export interface ProviderLedger<S> {
  readonly era: { readonly ledger: number };
  readonly contractStateFromBytes: (
    bytes: Uint8Array
  ) => Effect.Effect<never, ContractRuntimeError.ContractRuntimeError>;
  readonly toRuntimeContractState: (contractState: never) => Effect.Effect<S, ContractRuntimeError.ContractRuntimeError>;
}

/** Options for {@link make}. */
export interface Options<S> {
  /**
   * Maps a contract address to its file name within the base folder. Defaults to the address
   * itself; override this if the on-disk naming differs from the address string the runtime uses.
   */
  readonly fileNameForAddress?: (address: string) => string;
  /**
   * The era whose conversions decode the files. Defaults to the era this build binds.
   */
  readonly ledger?: ProviderLedger<S>;
}

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
 * @param options Optional file naming and the era whose conversions decode the files; see
 * {@link Options}. A bare function is also accepted for `options`, which is the pre-era
 * `fileNameForAddress` argument.
 * @returns A {@link ContractStateProvider} backed by `baseFolderPath`.
 *
 * @category constructors
 */
export const make = <S = CompactRuntime.ContractState>(
  baseFolderPath: string,
  options: Options<S> | ((address: string) => string) = {}
): { getContractState: (blockHash: string, address: string) => Promise<S | undefined> } => {
  const { fileNameForAddress = (address: string) => address, ledger = Ledger as unknown as ProviderLedger<S> } =
    typeof options === 'function' ? { fileNameForAddress: options } : options;

  return {
    getContractState: async (_blockHash: string, address: string): Promise<S | undefined> => {
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

      // Mirror the `circuit` command's `--input` deserialization via the era's Ledger facade:
      // ledger-serialized bytes -> ledger `ContractState` -> runtime `ContractState`. The
      // conversion effect is fully synchronous, so it is run with `runSyncExit` at this Promise
      // boundary; the exit is unwrapped so an unreadable state file rejects with the facade's
      // `ContractRuntimeError` itself — naming the contract, the file, and the expected era —
      // rather than a `FiberFailure` wrapper.
      const exit = Effect.runSyncExit(
        ledger.contractStateFromBytes(bytes).pipe(
          Effect.flatMap(ledger.toRuntimeContractState),
          Effect.mapError((err) =>
            ContractRuntimeError.make(
              `Failed to read contract state for '${address}' from '${filePath}' ` +
                `(expected ledger era ${ledger.era.ledger} encoding)`,
              err
            )
          )
        )
      );
      if (Exit.isFailure(exit)) {
        throw Cause.squash(exit.cause);
      }
      return exit.value;
    }
  };
};
