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

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { FileSystemContractModuleProvider } from '@midnight-ntwrk/compact-js-node/effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// One address per test: an imported module is cached by URL, so reusing a path would hand a later
// test the module an earlier one wrote.
const address = (n: number): string => n.toString(16).padStart(64, '0');

// None of these modules imports anything, so they load from the temp area without a
// `node_modules` above them.
const COMPLETE = [
  'export class Contract {}',
  'export const circuitSignatures = {};',
  'export const expectedVk = {};'
].join('\n');

let baseDir: string;

beforeAll(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'fs-contract-module-provider-'));
  // Without this the `.js` files below would be read as CommonJS.
  writeFileSync(join(baseDir, 'package.json'), JSON.stringify({ type: 'module' }));
});

afterAll(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

/** Writes `source` where the provider looks for `address`'s module, and returns that path. */
const writeModule = (addr: string, source: string): string => {
  const dir = join(baseDir, addr, 'contract');
  mkdirSync(dir, { recursive: true });
  const modulePath = join(dir, 'index.js');
  writeFileSync(modulePath, source);
  return modulePath;
};

const thunkFor = (addr: string) => {
  const thunk = FileSystemContractModuleProvider.make(baseDir).resolve(addr);
  expect(thunk).toBeTypeOf('function');
  return thunk!;
};

describe('FileSystemContractModuleProvider', () => {
  it('resolves an address with no module on disk to undefined', () => {
    expect(FileSystemContractModuleProvider.make(baseDir).resolve(address(1))).toBeUndefined();
  });

  it('loads a module that has every export resolution reads', async () => {
    writeModule(address(2), COMPLETE);

    const module = await thunkFor(address(2))();

    expect(module.Contract).toBeTypeOf('function');
    expect(module.circuitSignatures).toEqual({});
    expect(module.expectedVk).toEqual({});
  });

  it('rejects a module that lacks an export, naming the file', async () => {
    const modulePath = writeModule(address(3), 'export class Contract {}\nexport const circuitSignatures = {};');

    await expect(thunkFor(address(3))()).rejects.toThrow(`'${modulePath}' does not export expectedVk`);
  });

  it('rejects an export bound to undefined, as the runtime does', async () => {
    const modulePath = writeModule(
      address(4),
      'export class Contract {}\nexport const circuitSignatures = {};\nexport const expectedVk = undefined;'
    );

    await expect(thunkFor(address(4))()).rejects.toThrow(`'${modulePath}' does not export expectedVk`);
  });

  it('rejects an export bound to null, as the runtime does', async () => {
    const modulePath = writeModule(
      address(5),
      'export class Contract {}\nexport const circuitSignatures = null;\nexport const expectedVk = {};'
    );

    await expect(thunkFor(address(5))()).rejects.toThrow(`'${modulePath}' does not export circuitSignatures`);
  });

  it('rejects a Contract that is not a class', async () => {
    const modulePath = writeModule(
      address(6),
      'export const Contract = 42;\nexport const circuitSignatures = {};\nexport const expectedVk = {};'
    );

    await expect(thunkFor(address(6))()).rejects.toThrow(`'${modulePath}' exports a number as \`Contract\``);
  });

  it('finds the module through a caller-supplied layout', async () => {
    const dir = join(baseDir, 'flat');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${address(7)}.js`), COMPLETE);

    const provider = FileSystemContractModuleProvider.make(baseDir, {
      modulePathForAddress: (addr) => join('flat', `${addr}.js`)
    });
    const module = await provider.resolve(address(7))!();

    expect(module.Contract).toBeTypeOf('function');
  });

  it('resolves an address with nothing on disk to undefined when the layout shares a folder', () => {
    mkdirSync(join(baseDir, 'flat'), { recursive: true });
    const provider = FileSystemContractModuleProvider.make(baseDir, {
      modulePathForAddress: (addr) => join('flat', `${addr}.js`)
    });

    expect(provider.resolve(address(10))).toBeUndefined();
  });

  it('resolves a string that is not an address to undefined, even where it would reach a module', () => {
    const outside = mkdtempSync(join(tmpdir(), 'fs-contract-module-outside-'));
    try {
      mkdirSync(join(outside, 'contract'));
      writeFileSync(join(outside, 'contract', 'index.js'), COMPLETE);

      expect(FileSystemContractModuleProvider.make(baseDir).resolve(relative(baseDir, outside))).toBeUndefined();
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('fails the load, naming the link, when the address links to nothing', async () => {
    const link = join(baseDir, address(8));
    symlinkSync(join(baseDir, 'removed'), link);

    await expect(thunkFor(address(8))()).rejects.toThrow(
      `Cannot load the module at '${join(link, 'contract', 'index.js')}': '${link}' links to nothing.`
    );
  });

  it('fails the load, naming the file, when the address has a directory but no module', async () => {
    mkdirSync(join(baseDir, address(9)));

    await expect(thunkFor(address(9))()).rejects.toThrow(
      `Cannot load the module at '${join(baseDir, address(9), 'contract', 'index.js')}'.`
    );
  });
});
