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

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **Two ledger eras under the yarn PnP linker** — the second half of #388's first acceptance
 * criterion, which asks for the co-installability guarantee to be verified on *both* linkers.
 *
 * @remarks
 * `DualEraResolution.test.ts` covers the `node_modules` linker, which is what this repo installs
 * with, and its recipe is a **nested `node_modules` directory**: Node resolves a bare specifier by
 * walking `node_modules` up from the importing file, so a directory is enough to redirect the
 * `@midnight-ntwrk/compact-runtime` import that every generated contract opens with.
 *
 * Under PnP that mechanism does not exist. There is no `node_modules` to walk; `.pnp.cjs` maps each
 * *package* to its own dependency table, and a bare specifier resolves against the table of the
 * package that owns the importing file. A directory full of symlinks is invisible. So the two
 * linkers need different recipes, and the guarantee has to be established separately on each —
 * which is presumably why the acceptance criterion names both.
 *
 * What this suite pins:
 *
 * 1. PnP keeps the two runtime lines as **distinct module instances**, because they are installed
 *    under different names (`compact-runtime-ledger8` is the 0.16 line's npm alias). This is
 *    AC-1's literal requirement — "without the resolver collapsing them into a single instance".
 * 2. The `node_modules` recipe **fails** under PnP, with PnP's own strict-resolution error. Pinned
 *    as a positive assertion so nobody "simplifies" the README by presenting one recipe as
 *    universal.
 *
 * The project is built from **this repo's own `yarn.lock` and `.yarn/cache`**, with
 * `enableNetwork: false`. Every descriptor it needs is already locked and every zip already
 * fetched, so the install is offline and reproducible; a fresh CI checkout populates the cache
 * during the root install, before this test runs. `compressionLevel: mixed` has to be copied from
 * the root `.yarnrc.yml` — it participates in the cache filename, and omitting it turns every
 * package into a cache miss and therefore a network fetch.
 *
 * Deliberately **not** covered here: executing a compiled era-8 *contract* under PnP. That needs
 * the artifact to live in a package whose dependency table supplies
 * `@midnight-ntwrk/compact-runtime` at 0.16 — verified by hand to work, but it requires a fixture
 * workspace declaring the 0.16 line under the canonical name, which would add a second
 * compact-runtime to this repo's own install graph and is the thing
 * `compact-js-node`/`compact-js-command`'s `RuntimeIdentity.test.ts` exist to forbid. Tracked on
 * #388 rather than worked around here.
 */
const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const MONOREPO_ROOT = resolve(PACKAGE_ROOT, '..');
const WORKSPACES = ['compact-js', 'compact-js-node', 'compact-js-command'];

/** The 0.16 line's npm alias, and the canonical 0.19 name, as this repo declares them. */
const ERA8_RUNTIME_PACKAGE = 'compact-runtime-ledger8';
const ERA9_RUNTIME_PACKAGE = '@midnight-ntwrk/compact-runtime';

/**
 * Builds a throwaway PnP project over this repo's resolved dependency graph.
 *
 * Only the manifests and the lockfile are copied — no sources — so the install resolves entirely
 * from the lockfile and fetches entirely from the shared cache.
 */
const makePnpProject = (): string => {
  const project = mkdtempSync(join(tmpdir(), 'compact-js-pnp-'));

  copyFileSync(join(MONOREPO_ROOT, 'yarn.lock'), join(project, 'yarn.lock'));
  copyFileSync(join(MONOREPO_ROOT, 'package.json'), join(project, 'package.json'));
  for (const workspace of WORKSPACES) {
    mkdirSync(join(project, workspace), { recursive: true });
    copyFileSync(join(MONOREPO_ROOT, workspace, 'package.json'), join(project, workspace, 'package.json'));
  }

  writeFileSync(
    join(project, '.yarnrc.yml'),
    [
      // Participates in the cache filename; a mismatch makes every package a miss.
      'compressionLevel: mixed',
      'nodeLinker: pnp',
      'enableGlobalCache: false',
      // The point of building from the committed lockfile: nothing here needs the network.
      'enableNetwork: false',
      // Yarn turns hardened mode on by itself for a pull request on a public repo, and hardened
      // mode means `--refresh-lockfile --check-resolutions` — re-resolving every descriptor against
      // the registry. That is flatly incompatible with the line above, so leaving it to default
      // makes this suite pass locally and fail in CI with `YN0080: Request to
      // 'https://registry.yarnpkg.com/…' has been blocked because of your configuration settings`.
      //
      // Off rather than networked, because hardened mode guards against a PR tampering with the
      // lockfile being installed, and this lockfile is a copy of the repo's own — already installed
      // under hardened mode by the same CI job, minutes earlier.
      'enableHardenedMode: false',
      `cacheFolder: ${join(MONOREPO_ROOT, '.yarn/cache')}`,
      `yarnPath: ${join(MONOREPO_ROOT, '.yarn/releases/yarn-4.10.3.cjs')}`,
      ''
    ].join('\n')
  );

  // `--mode=skip-build` because no postinstall output is needed: the assertions below read the WASM
  // packages' own `versionString`, which ships in the published artifact.
  //
  // `stdio: 'pipe'` keeps a successful install quiet, but it also means the thrown error says only
  // `Command failed: yarn install --mode=skip-build` — yarn's actual diagnosis goes in the error's
  // `stdout`/`stderr` and is dropped. Since the whole point of this suite is that a PnP project
  // which cannot be built is a *failure* rather than a skip, that failure has to arrive with
  // yarn's reason attached, or the next CI-only break costs a bisect to identify.
  try {
    execFileSync('yarn', ['install', '--mode=skip-build'], { cwd: project, stdio: 'pipe' });
  } catch (cause) {
    const { stdout, stderr } = cause as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `yarn install failed in the PnP project at ${project}\n${stdout?.toString() ?? ''}${stderr?.toString() ?? ''}`,
      { cause }
    );
  }
  return project;
};

/** Runs `source` under the project's PnP loader, from inside a workspace that declares the runtime. */
const runUnderPnp = (project: string, source: string): string => {
  const script = join(project, 'compact-js', 'probe.mjs');
  writeFileSync(script, source);
  return execFileSync('yarn', ['node', script], { cwd: project, encoding: 'utf8' }).trim();
};

describe('two ledger eras under the yarn PnP linker', () => {
  let project: string;

  beforeAll(() => {
    // No `describe.skip` fallback on failure: a PnP project that cannot be built is the thing this
    // suite exists to detect, and a silent skip would report success for an unverified linker.
    project = makePnpProject();
  }, 180_000);

  afterAll(() => {
    if (project !== undefined) rmSync(project, { recursive: true, force: true });
  });

  it('resolves both runtime lines as distinct instances', () => {
    const output = runUnderPnp(
      project,
      `const era9 = await import(${JSON.stringify(ERA9_RUNTIME_PACKAGE)});
       const era8 = await import(${JSON.stringify(ERA8_RUNTIME_PACKAGE)});
       console.log(JSON.stringify({
         era9: era9.versionString,
         era8: era8.versionString,
         distinctNamespace: era9 !== era8,
         distinctContractState: era9.ContractState !== era8.ContractState
       }));`
    );
    const resolved = JSON.parse(output.slice(output.indexOf('{'))) as {
      era9: string;
      era8: string;
      distinctNamespace: boolean;
      distinctContractState: boolean;
    };

    expect(resolved.era9.startsWith('0.19')).toBe(true);
    expect(resolved.era8).toBe('0.16.0');
    // The criterion's wording: co-installed *without the resolver collapsing them into a single
    // instance*. Both the namespace object and a class off it, so this cannot pass on two live
    // bindings of one underlying WASM module.
    expect(resolved.distinctNamespace).toBe(true);
    expect(resolved.distinctContractState).toBe(true);
  }, 120_000);

  it("rejects the node_modules linker's nested-directory recipe", () => {
    // `DualEraResolution.test.ts`'s scope, reproduced verbatim inside the PnP project. Under the
    // `node_modules` linker this redirects the generated contract's bare specifier onto 0.16;
    // under PnP it is not consulted at all.
    const scope = join(project, 'scope');
    const scopedModules = join(scope, 'node_modules', '@midnight-ntwrk');
    mkdirSync(scopedModules, { recursive: true });
    symlinkSync(
      resolve(MONOREPO_ROOT, 'node_modules', ERA8_RUNTIME_PACKAGE),
      join(scopedModules, 'compact-runtime')
    );
    writeFileSync(join(scope, 'package.json'), JSON.stringify({ type: 'module' }));
    // Stands in for a generated contract, which opens with exactly this import.
    writeFileSync(join(scope, 'contract.mjs'), `import * as rt from '${ERA9_RUNTIME_PACKAGE}';\nexport default rt;\n`);

    const output = runUnderPnp(
      project,
      `try {
         await import(${JSON.stringify(join(scope, 'contract.mjs'))});
         console.log('LOADED');
       } catch (err) {
         console.log('REJECTED: ' + String(err.message).split('\\n')[0]);
       }`
    );

    // Asserted rather than merely observed: if a future yarn made PnP fall back to `node_modules`,
    // the two linkers would converge and the README could carry one recipe — but that is a change
    // worth noticing, not inheriting silently.
    expect(output).toContain('REJECTED');
    expect(output).toContain("isn't declared in your dependencies");
  }, 120_000);
});
