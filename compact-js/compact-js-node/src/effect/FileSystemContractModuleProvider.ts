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

import { existsSync, lstatSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CompactRuntime } from '@midnight-ntwrk/compact-js/effect';

/**
 * What resolution reads off a callee's module. A copy of runtime 0.20's list, because the runtime
 * does not export it.
 */
const RESOLVED_MODULE_EXPORTS: readonly (keyof CompactRuntime.Module)[] = [
  'Contract',
  'circuitSignatures',
  'expectedVk'
];

/** The runtime's own test of a contract address. */
const CONTRACT_ADDRESS = /^[0-9A-Fa-f]{64}$/;

/**
 * The part of an era's `CompactRuntime` this provider is typed from, which `/v9/effect`'s satisfies as
 * well as the bound one. A module provider joins a state provider in one circuit context, therefore
 * it is told its era as `FileSystemContractStateProvider` is told its ledger.
 */
export interface ProviderRuntime {
  readonly line: string;
  readonly createExecutionContext: (params: never) => unknown;
}

/**
 * The module `R`'s cross-contract calls resolve to, as the executable reads it. On a line without
 * them it is `unknown`, which no circuit context accepts.
 */
export type ModuleOf<R extends ProviderRuntime> = Parameters<R['createExecutionContext']>[0] extends {
  readonly moduleProvider?: infer P;
}
  ? NonNullable<P> extends { resolve(address: never): (() => PromiseLike<infer M>) | undefined }
    ? M
    : never
  : never;

/** Options for {@link make}. */
export interface Options<R extends ProviderRuntime> {
  /** Maps a contract address to its module's path within the base folder. Defaults to `compactc`'s layout. */
  readonly modulePathForAddress?: (address: string) => string;
  /** The era whose circuit contexts the provider is for. Defaults to the era this build binds. */
  readonly runtime?: R;
}

/**
 * Narrows an imported namespace to a {@link CompactRuntime.Module}, naming what is missing if it is
 * not one. A module compiled before dynamic resolution has a `Contract` and none of the tables. The
 * runtime rejects it too but names only the address, therefore this names the file.
 */
const asModule = <M>(namespace: unknown, modulePath: string, line: string): M => {
  const exports = namespace as Partial<Record<keyof CompactRuntime.Module, unknown>>;
  // Checked as the runtime checks: an inherited name is not an export, and one bound to `null` or
  // `undefined` gives resolution nothing to read.
  const missing = RESOLVED_MODULE_EXPORTS.filter(
    (name) => !Object.hasOwn(exports, name) || exports[name] === null || exports[name] === undefined
  );
  if (missing.length !== 0) {
    throw new Error(
      `'${modulePath}' does not export ${missing.join(', ')}, so compact-runtime ${line} cannot call it. ` +
        'Recompile it with a compactc that emits these exports.'
    );
  }
  if (typeof exports.Contract !== 'function') {
    throw new Error(`'${modulePath}' exports a ${typeof exports.Contract} as \`Contract\`, not a class.`);
  }
  return namespace as M;
};

/** Why `modulePath` cannot be imported: `'absent'` if nothing is on disk for the address, `undefined` if it can be. */
const unloadable = (modulePath: string, address: string): Error | 'absent' | undefined => {
  let error: unknown;
  try {
    return statSync(modulePath).isFile()
      ? undefined
      : new Error(`Cannot load the module at '${modulePath}': not a file.`);
  } catch (cause) {
    error = cause;
  }
  // `stat` follows links, so a link whose target was removed fails like a path that was never there.
  // Anything from the address's own entry down to the module tells them apart; above it, a layout
  // may share folders between addresses.
  for (let path = modulePath; ; path = dirname(path)) {
    try {
      const dangling = lstatSync(path).isSymbolicLink() && !existsSync(path);
      return new Error(
        `Cannot load the module at '${modulePath}'` + (dangling ? `: '${path}' links to nothing.` : '.'),
        { cause: error }
      );
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
        return new Error(`Cannot load the module at '${modulePath}'.`, { cause });
      }
    }
    if (basename(path).toLowerCase().includes(address.toLowerCase()) || dirname(path) === path) {
      return 'absent';
    }
  }
};

/**
 * A {@link CompactRuntime.ContractModuleProvider} that resolves generated contract modules lazily
 * from the file system.
 *
 * Each callee's module is imported from `<baseFolderPath>/<address>/contract/index.js` — the layout
 * `compactc` writes, with the managed output directory named by the address it is deployed at.
 * Modules are imported **on demand**: a module is loaded only once a call actually resolves to its
 * address, so a directory may hold more contracts than any one execution reaches, and none is paid
 * for until it is called.
 *
 * An address with nothing on disk resolves to `undefined`, which the runtime reports as an
 * unsupported implementation. A module that is there but cannot be loaded, such as a link whose
 * target was removed, fails the load instead, naming the path.
 *
 * A generated module imports `@midnight-ntwrk/compact-runtime` by bare specifier, and Node resolves
 * that from the module's real path. A module copied outside the project therefore cannot load, and
 * one inside another project loads a second copy of the runtime. Keep `baseFolderPath` inside the
 * project, or fill it with symlinks to compiled directories there.
 *
 * @param baseFolderPath The folder holding one managed contract directory per address.
 * @param options The on-disk layout and the era; see {@link Options}.
 * @returns A {@link CompactRuntime.ContractModuleProvider} for `options.runtime`'s era, backed by `baseFolderPath`.
 *
 * @category constructors
 */
export const make = <R extends ProviderRuntime = typeof CompactRuntime>(
  baseFolderPath: string,
  options: Options<R> = {}
): { resolve: (address: string) => (() => Promise<ModuleOf<R>>) | undefined } => {
  const {
    modulePathForAddress = (address: string) => join(address, 'contract', 'index.js'),
    runtime = CompactRuntime as unknown as R
  } = options;
  return {
    resolve: (address) => {
      // The runtime checks this before it calls `resolve`, but `resolve` is public and what it
      // returns is run, therefore a string that is not an address reaches no path.
      if (!CONTRACT_ADDRESS.test(address)) {
        return undefined;
      }
      const modulePath = join(baseFolderPath, modulePathForAddress(address));
      const problem = unloadable(modulePath, address);
      if (problem === 'absent') {
        return undefined;
      }
      if (problem !== undefined) {
        return () => Promise.reject(problem);
      }
      // By URL, not path: a Windows path is not a valid specifier, and a bare relative path would be
      // resolved against this file rather than the caller's directory.
      return () =>
        import(pathToFileURL(modulePath).href).then((namespace) =>
          asModule<ModuleOf<R>>(namespace, modulePath, runtime.line)
        );
    }
  };
};
