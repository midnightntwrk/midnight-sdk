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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ContractModuleProvider, Module, ModuleThunk } from '@midnight-ntwrk/compact-runtime';

/** What resolution reads off a callee's module — the same three the runtime checks for. */
const RESOLVED_MODULE_EXPORTS: readonly (keyof Module)[] = ['Contract', 'circuitSignatures', 'expectedVk'];

/**
 * Narrows an imported namespace to a {@link Module}, naming what is missing if it is not one. A
 * module compiled before dynamic resolution has a `Contract` and none of the tables; the runtime
 * rejects one too, but only this side knows which file it came from.
 */
const asModule = (namespace: unknown, modulePath: string): Module => {
  const exports = namespace as Partial<Record<keyof Module, unknown>>;
  // By own property, not by value, matching the runtime: an export bound to `undefined` is still an
  // export, and a name inherited from `Object.prototype` is not one.
  const missing = RESOLVED_MODULE_EXPORTS.filter((name) => !Object.hasOwn(exports, name));
  if (missing.length !== 0) {
    throw new Error(
      `'${modulePath}' does not export ${missing.join(', ')}, so it cannot be a cross-contract callee. ` +
        'Recompile it with a compactc that emits these exports.'
    );
  }
  if (typeof exports.Contract !== 'function') {
    throw new Error(`'${modulePath}' exports a ${typeof exports.Contract} as \`Contract\`, not a class.`);
  }
  return namespace as Module;
};

/**
 * A {@link ContractModuleProvider} that resolves generated contract modules lazily from the file
 * system.
 *
 * Each callee's module is imported from `<baseFolderPath>/<address>/contract/index.js` — the layout
 * `compactc` writes, with the managed output directory named by the address it is deployed at.
 * Modules are imported **on demand**: a module is loaded only once a call actually resolves to its
 * address, so a directory may hold more contracts than any one execution reaches, and none is paid
 * for until it is called.
 *
 * An address with no module resolves to `undefined`, which the runtime reports as an unsupported
 * implementation rather than a load failure.
 *
 * @param baseFolderPath The folder holding one managed contract directory per address.
 * @param modulePathForAddress Maps a contract address to its module's path within `baseFolderPath`.
 * Override this if the on-disk layout differs from `compactc`'s.
 * @returns A {@link ContractModuleProvider} backed by `baseFolderPath`.
 *
 * @category constructors
 */
export const make = (
  baseFolderPath: string,
  modulePathForAddress: (address: string) => string = (address) => join(address, 'contract', 'index.js')
): ContractModuleProvider => ({
  resolve: (address: string): ModuleThunk | undefined => {
    const modulePath = join(baseFolderPath, modulePathForAddress(address));
    // `resolve` is synchronous and total, so whether this address is bound at all has to be decided
    // here: a module that is not on disk is an address this provider does not serve, which reads
    // differently from one whose load failed.
    if (!existsSync(modulePath)) {
      return undefined;
    }
    // By URL, not path: a Windows path is not a valid specifier, and a bare relative path would be
    // resolved against this file rather than the caller's directory.
    return () => import(pathToFileURL(modulePath).href).then((namespace) => asModule(namespace, modulePath));
  }
});
