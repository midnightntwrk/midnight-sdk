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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContractState as RuntimeContractState } from '@midnight-ntwrk/compact-runtime';
import { FileSystemContractStateProvider } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractOperation, ContractState as LedgerContractState } from '@midnight-ntwrk/ledger-v8';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ADDRESS = '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a';
const ZERO_BLOCK_HASH = '0'.repeat(64);

/**
 * A ledger-serialized `ContractState` — the exact on-disk format the `circuit` command writes via
 * `--output-oc` / `--output-contract-states-dir`, and the format this provider consumes. Built
 * directly with the ledger API (no contract execution needed) and tagged with recognizable
 * operations so reads can be checked for content, not just presence.
 */
const stateBytesWith = (...circuitIds: readonly string[]): Uint8Array => {
  const state = new LedgerContractState();
  for (const circuitId of circuitIds) {
    state.setOperation(circuitId, new ContractOperation());
  }
  return state.serialize();
};

const serializedEqual = (a: Uint8Array, b: Uint8Array): boolean => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

let baseDir: string;

beforeAll(() => {
  // A base folder unique to this process, in the OS temp area, so parallel test files never collide.
  baseDir = mkdtempSync(join(tmpdir(), 'fs-contract-state-provider-'));
});

afterAll(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe('FileSystemContractStateProvider', () => {
  it('reads and deserializes a contract state file at <base>/<address>', async () => {
    const bytes = stateBytesWith('getV');
    writeFileSync(join(baseDir, ADDRESS), bytes);

    const state = await FileSystemContractStateProvider.make(baseDir).getContractState(ZERO_BLOCK_HASH, ADDRESS);

    expect(state).toBeDefined();
    // Returned as a runtime ContractState whose content round-trips byte-for-byte to what was written.
    expect(state).toBeInstanceOf(RuntimeContractState);
    expect(serializedEqual(state!.serialize(), bytes)).toBe(true);
    expect(state!.operations()).toContain('getV');
  });

  it('returns undefined when the contract state file is missing', async () => {
    const missing = 'f'.repeat(64);
    const state = await FileSystemContractStateProvider.make(baseDir).getContractState(ZERO_BLOCK_HASH, missing);
    expect(state).toBeUndefined();
  });

  it('propagates a non-ENOENT file system error (path is a directory)', async () => {
    const address = 'a'.repeat(64);
    mkdirSync(join(baseDir, address));
    // Reading a directory fails with EISDIR (not ENOENT), which the provider must surface rather than
    // swallow as "no state".
    await expect(FileSystemContractStateProvider.make(baseDir).getContractState(ZERO_BLOCK_HASH, address))
      .rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('uses fileNameForAddress to resolve the contract state file path', async () => {
    const address = 'b'.repeat(64);
    const fileName = 'aliased-state.bin';
    writeFileSync(join(baseDir, fileName), stateBytesWith('getV'));

    // Default naming looks for <base>/<address>, which was never written → undefined.
    expect(await FileSystemContractStateProvider.make(baseDir).getContractState(ZERO_BLOCK_HASH, address))
      .toBeUndefined();

    // The override maps the address to the actual file name → resolves.
    const state = await FileSystemContractStateProvider.make(baseDir, () => fileName)
      .getContractState(ZERO_BLOCK_HASH, address);
    expect(state).toBeDefined();
    expect(state!.operations()).toContain('getV');
  });

  it('returns the same state regardless of the block hash', async () => {
    const address = 'c'.repeat(64);
    const bytes = stateBytesWith('getV');
    writeFileSync(join(baseDir, address), bytes);

    const provider = FileSystemContractStateProvider.make(baseDir);
    const fromHashA = await provider.getContractState('00'.repeat(32), address);
    const fromHashB = await provider.getContractState('ff'.repeat(32), address);

    expect(serializedEqual(fromHashA!.serialize(), fromHashB!.serialize())).toBe(true);
    expect(serializedEqual(fromHashA!.serialize(), bytes)).toBe(true);
  });

  it('rejects when the state file exists but contains invalid bytes', async () => {
    const address = 'd'.repeat(64);
    // A present-but-corrupt file must fail loudly: only a *missing* file means "no state". The
    // provider catches solely ENOENT, so deserializing garbage rejects rather than resolving
    // undefined — distinguishing "no state" from "unreadable state".
    writeFileSync(join(baseDir, address), Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));

    await expect(FileSystemContractStateProvider.make(baseDir).getContractState(ZERO_BLOCK_HASH, address))
      .rejects.toThrow();
  });
});