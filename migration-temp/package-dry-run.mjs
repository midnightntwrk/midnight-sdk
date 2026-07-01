#!/usr/bin/env node
// This file is part of MIDNIGHT-SDK.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// TEMPORARY local-testing helper (issue #222). See ../MIGRATION_TEMP.md §4.
//
// Mirrors the `workspace:` -> real-version rewrite that scripts/publish.mjs performs
// at publish time (its `resolveWorkspaceRanges()`), but WITHOUT publishing anything.
// For each publishable package it copies the built `dist/` into
// migration-temp/packaged/<pkg>/ and rewrites every `workspace:` dependency range to
// the concrete caret version, so you can SEE that e.g. `workspace:^` becomes `^3.0.1`
// in the exact package.json that would ship.
//
// Run it AFTER `yarn dist`. To see BUMPED versions, first do a local
// `yarn changeset version` and then re-run `yarn dist` (so dist/package.json carries
// the new versions), then run this.
//
// Output lands in migration-temp/packaged/, which is self-git-ignored and MUST NEVER
// be committed. Remove it with --clean.
//
// Usage:
//   node migration-temp/package-dry-run.mjs
//   node migration-temp/package-dry-run.mjs --pack    # also `npm pack` each (tarball)
//   node migration-temp/package-dry-run.mjs --clean   # remove packaged/ output

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'packaged');

const { values } = parseArgs({
  options: { pack: { type: 'boolean' }, clean: { type: 'boolean' } },
  strict: true,
});

if (values.clean) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  console.log(`Removed ${OUT_DIR}`);
  process.exit(0);
}

// Discover publishable workspaces + a name -> version map (same as publish.mjs).
const allWorkspaces = execFileSync('yarn', ['workspaces', 'list', '--json'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter((ws) => ws.location !== '.');

const versions = Object.fromEntries(
  allWorkspaces.map((ws) => {
    const pkg = JSON.parse(readFileSync(resolve(ws.location, 'package.json'), 'utf8'));
    return [pkg.name, pkg.version];
  }),
);

const publishable = allWorkspaces.flatMap((ws) => {
  const pkg = JSON.parse(readFileSync(resolve(ws.location, 'package.json'), 'utf8'));
  return pkg.private ? [] : [{ ...ws, pkg, distDir: resolve(ws.location, 'dist') }];
});

if (!publishable.length) {
  console.log('No publishable packages.');
  process.exit(0);
}

// Recreate the output dir and self-ignore it so it can never be committed.
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, '.gitignore'), '# Local packaging test output — never commit.\n*\n');

// The same rewrite publish.mjs does: workspace:<x> -> ^<resolved version>.
// Returns the list of changes so we can print them.
const resolveWorkspaceRanges = (pkgJsonPath) => {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const changes = [];
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        const v = versions[name];
        if (!v) throw new Error(`Cannot resolve workspace range for ${name} in ${pkgJsonPath}`);
        deps[name] = `^${v}`;
        changes.push({ field, name, from: range, to: `^${v}` });
      }
    }
  }
  if (changes.length) writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  return changes;
};

const results = publishable.map((ws) => {
  const name = ws.pkg.name;
  const outPkgDir = join(OUT_DIR, basename(ws.location));
  if (!existsSync(ws.distDir)) {
    return { name, error: `missing build output at ${ws.distDir} — run 'yarn dist' first` };
  }
  rmSync(outPkgDir, { recursive: true, force: true });
  cpSync(ws.distDir, outPkgDir, { recursive: true, filter: (src) => !src.split('/').includes('node_modules') });
  const changes = resolveWorkspaceRanges(join(outPkgDir, 'package.json'));
  if (values.pack) {
    execFileSync('npm', ['pack', '--pack-destination', OUT_DIR], { cwd: outPkgDir, stdio: 'inherit' });
  }
  return { name, version: ws.pkg.version, outPkgDir, changes };
});

console.log(`\nStaged ${results.filter((r) => !r.error).length} package(s) into ${OUT_DIR}\n`);
for (const r of results) {
  if (r.error) {
    console.error(`✗ ${r.name}: ${r.error}`);
    continue;
  }
  console.log(`● ${r.name}@${r.version}  ->  ${r.outPkgDir}/package.json`);
  if (!r.changes.length) {
    console.log('    (no workspace: deps to resolve)');
  }
  for (const c of r.changes) {
    console.log(`    ${c.field}: ${c.name}   ${c.from}  ->  ${c.to}`);
  }
}
console.log('\n⚠️  migration-temp/packaged/ is git-ignored — never commit it. Remove with --clean.');

if (results.some((r) => r.error)) process.exit(1);
