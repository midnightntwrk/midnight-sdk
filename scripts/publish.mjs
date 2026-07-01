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

// Publishes non-private workspace packages to npmjs under TWO scopes during the
// migration from `@midnight-ntwrk` to `@midnightntwrk`, both via npm Trusted
// Publishing (OIDC) + `--provenance` (no tokens):
//
//   1. Primary `@midnightntwrk/*` — published as-is from the build output.
//   2. Alias `@midnight-ntwrk/*` — transitional, so dashed-scope consumers keep
//      resolving; staged in a temp dir with the scope rewritten, then published.
//
// These packages build with `@effect/build-utils pack-v3`, which emits a
// publish-ready package directory at `<workspace>/dist`. We publish FROM there
// (not the workspace root). Internal sibling deps use the `workspace:` protocol,
// which `npm publish` does not understand, so we resolve them to concrete caret
// ranges in the dist package.json before publishing.
//
// Versions already on the registry are skipped so re-runs are idempotent.
//
// Usage:
//   node scripts/publish.mjs              # dist-tag from changesets pre mode, else `latest`
//   node scripts/publish.mjs --tag canary # force the `canary` dist-tag

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

// Only OUR packages are aliased to the dashed scope. Upstream deps that already
// live under @midnightntwrk (e.g. @midnightntwrk/ledger-v9) must NOT be dashed.
// Both prefixes below cover all four packages (compact-js* share a prefix) and
// neither matches an upstream dep name.
const ALIAS_PREFIXES = [
  ['@midnightntwrk/platform-js', '@midnight-ntwrk/platform-js'],
  ['@midnightntwrk/compact-js', '@midnight-ntwrk/compact-js'],
];

const toAlias = (s) => ALIAS_PREFIXES.reduce((acc, [from, to]) => acc.split(from).join(to), s);

// Migration banner prepended to the alias (dashed) package README so the
// notice is visible on npmjs. `primaryName` is the @midnightntwrk target.
const migrationBanner = (primaryName) =>
  [
    '> [!IMPORTANT]',
    `> **This package has moved.** The \`@midnight-ntwrk\` scope is published only`,
    `> during the migration window and will stop receiving updates. Please migrate to`,
    `> [\`${primaryName}\`](https://www.npmjs.com/package/${primaryName}).`,
    '',
    '---',
    '',
    '',
  ].join('\n');

const { values } = parseArgs({
  options: { tag: { type: 'string' } },
  strict: true,
});

// Resolve the dist-tag once: an explicit --tag wins (the canary flow passes
// --tag canary), otherwise honor changesets pre mode (.changeset/pre.json with
// `mode: "pre"` → its tag, e.g. rc), otherwise undefined so npm publishes under
// `latest`. Reading pre.json directly mirrors scripts/write-canary-changeset.mjs.
const readPreState = () => {
  try {
    return JSON.parse(readFileSync('.changeset/pre.json', 'utf8'));
  } catch {
    return undefined; // No .changeset/pre.json (or unreadable) → not in pre mode.
  }
};

const resolveDistTag = (explicitTag, preState) => {
  if (explicitTag) return explicitTag;
  if (preState?.mode === 'pre' && typeof preState.tag === 'string' && preState.tag.length > 0) {
    return preState.tag;
  }
  return undefined;
};

const distTag = resolveDistTag(values.tag, readPreState());
const tagArgs = distTag ? ['--tag', distTag] : [];

// ─── MIGRATION SAFETY: DRY RUN (TEMPORARY) ──────────────────────────────────
// While the changesets migration (issue #222) is being validated, we force
// `npm publish --dry-run` so NOTHING is ever uploaded to the npm registry. npm
// still performs every step (pack, name/version checks, provenance wiring)
// EXCEPT the final publish, so the pipeline is exercised end-to-end safely.
//
// TO GO LIVE (publish for real): set DRY_RUN to false, or delete this block and
// the `...dryRunArgs` usages below. See MIGRATION_TEMP.md for the full checklist.
const DRY_RUN = true;
const dryRunArgs = DRY_RUN ? ['--dry-run'] : [];
// ────────────────────────────────────────────────────────────────────────────

const allWorkspaces = execFileSync('yarn', ['workspaces', 'list', '--json'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter((ws) => ws.location !== '.');

// name -> version, for resolving `workspace:` ranges to concrete caret ranges.
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

if (publishable.length === 0) {
  console.log('No publishable packages found.');
  process.exit(0);
}

// Rewrite any `workspace:` dependency ranges in a dist package.json to concrete
// caret ranges (npm cannot publish the workspace: protocol). Mutates the file.
const resolveWorkspaceRanges = (pkgJsonPath) => {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  let changed = false;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        const v = versions[name];
        if (!v) throw new Error(`Cannot resolve workspace range for ${name} in ${pkgJsonPath}`);
        deps[name] = `^${v}`;
        changed = true;
      }
    }
  }
  if (changed) writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
};

const isAlreadyPublished = (name, version) => {
  try {
    const out = execFileSync('npm', ['view', name, 'versions', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed.includes(version) : parsed === version;
  } catch {
    return false; // not on the registry yet — first publish
  }
};

// Recursively rewrite our scope to the dashed alias scope in every text file
// under `dir` that references it (built dist/** is all JS/d.ts/map text).
const rewriteScopeInTree = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteScopeInTree(full);
      continue;
    }
    const content = readFileSync(full, 'utf8');
    const aliased = toAlias(content);
    if (aliased !== content) writeFileSync(full, aliased);
  }
};

const publishPrimary = (ws) => {
  const { name, version } = ws.pkg;
  if (!existsSync(ws.distDir)) {
    return { name, version, status: 'failed', error: `missing build output at ${ws.distDir} (run yarn dist)` };
  }
  resolveWorkspaceRanges(join(ws.distDir, 'package.json'));

  if (isAlreadyPublished(name, version)) {
    console.log(`\nSkip ${name}@${version}: already published.`);
    return { name, version, status: 'skipped' };
  }
  console.log(`\nPublishing ${name}@${version} (OIDC + provenance)...`);
  try {
    execFileSync('npm', ['publish', '--provenance', '--access', 'public', ...tagArgs, ...dryRunArgs], {
      cwd: ws.distDir,
      stdio: 'inherit',
    });
    return { name, version, status: 'published' };
  } catch (err) {
    return { name, version, status: 'failed', error: err.message };
  }
};

const publishAlias = (ws) => {
  const aliasName = toAlias(ws.pkg.name);
  const { version } = ws.pkg;
  if (isAlreadyPublished(aliasName, version)) {
    console.log(`Skip ${aliasName}@${version}: already published.`);
    return { name: aliasName, version, status: 'skipped' };
  }

  const stage = mkdtempSync(join(tmpdir(), 'publish-alias-'));
  try {
    cpSync(ws.distDir, stage, { recursive: true, filter: (src) => !src.split('/').includes('node_modules') });
    const pkgPath = join(stage, 'package.json');
    writeFileSync(pkgPath, toAlias(readFileSync(pkgPath, 'utf8')));
    rewriteScopeInTree(stage);

    const readmePath = join(stage, 'README.md');
    const readmeBody = existsSync(readmePath) ? toAlias(readFileSync(readmePath, 'utf8')) : '';
    writeFileSync(readmePath, migrationBanner(ws.pkg.name) + readmeBody);

    console.log(`\nPublishing ${aliasName}@${version} (alias, OIDC + provenance)...`);
    execFileSync('npm', ['publish', '--provenance', '--access', 'public', ...tagArgs, ...dryRunArgs], {
      cwd: stage,
      stdio: 'inherit',
    });
    return { name: aliasName, version, status: 'published' };
  } catch (err) {
    return { name: aliasName, version, status: 'failed', error: err.message };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
};

if (DRY_RUN) {
  console.log('⚠️  DRY RUN ENABLED (MIGRATION_TEMP.md): --dry-run is set, NOTHING will be published.');
}
console.log(`Publishing ${publishable.length} package(s)${distTag ? ` (dist-tag: ${distTag})` : ''}:`);
publishable.forEach((ws) => console.log(`  - ${ws.pkg.name}@${ws.pkg.version} (+ alias ${toAlias(ws.pkg.name)})`));

const results = publishable.flatMap((ws) => {
  // Under any non-`latest` dist-tag (a canary snapshot or a changesets pre/rc
  // release), only publish prerelease-versioned packages. A prerelease version
  // always carries a semver "-"; a canonical version (no "-") must never sit
  // under a prerelease dist-tag. Plain `latest` releases resolve no dist-tag
  // (distTag undefined), so this never affects them.
  if (distTag && !ws.pkg.version.includes('-')) {
    console.log(`Skip ${ws.pkg.name}@${ws.pkg.version}: not a prerelease version for --tag ${distTag}.`);
    return [];
  }
  const primary = publishPrimary(ws);
  if (primary.status === 'failed') {
    console.error(`Skip alias ${toAlias(ws.pkg.name)}@${ws.pkg.version}: primary publish failed.`);
    return [primary];
  }
  return [primary, publishAlias(ws)];
});

const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log('\n--- Publish summary ---');
console.log(`Published: ${counts.published ?? 0}, Skipped: ${counts.skipped ?? 0}, Failed: ${counts.failed ?? 0}`);

const failures = results.filter((r) => r.status === 'failed');
if (failures.length > 0) {
  failures.forEach((f) => console.error(`  ! ${f.name}@${f.version}: ${f.error}`));
  process.exit(1);
}
