#!/usr/bin/env node
// Verify that the packed dist/package.json exposes every subpath the source package.json
// declares, and that each packed target actually exists on disk.
//
// Why this exists: `@effect/build-utils pack-v3` regenerates the `exports` map for `dist/` rather
// than copying the source one. A subpath that fails to make it into the generated map — or that
// points at a file the build never emitted — is invisible in-repo, because the workspace resolves
// subpaths through the *source* exports map. The failure only appears once a consumer installs
// the published tarball and gets ERR_PACKAGE_PATH_NOT_EXPORTED or a missing module. Running this
// as the last build step turns that into a build failure in the package that caused it.
//
// Usage: node scripts/verify-exports.mjs <package-dir>

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageDir = resolve(process.argv[2] ?? '.');
const sourceManifestPath = join(packageDir, 'package.json');
const distDir = join(packageDir, 'dist');
const distManifestPath = join(distDir, 'package.json');

const readManifest = (path) => {
  if (!existsSync(path)) {
    console.error(`verify-exports: no manifest at ${path}; run the build first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
};

const sourceExports = readManifest(sourceManifestPath).exports ?? {};
const distExports = readManifest(distManifestPath).exports ?? {};

const problems = [];

// Subpaths the source declares and a consumer may therefore import. `null` entries are
// deliberately blocked (e.g. `./effect/internal/*`), and wildcard patterns are expanded by
// pack-v3 into one entry per emitted module, so neither can be compared key-for-key.
const expectedSubpaths = Object.entries(sourceExports)
  .filter(([subpath, target]) => target !== null && !subpath.includes('*') && subpath !== './package.json')
  .map(([subpath]) => subpath);

for (const subpath of expectedSubpaths) {
  if (!(subpath in distExports)) {
    problems.push(`missing from packed exports: "${subpath}" (declared in ${sourceManifestPath})`);
  }
}

// Every packed target must exist: a stale or misgenerated entry resolves to nothing at install
// time. Conditions nest arbitrarily (`{"import": {"types": …, "default": …}}`), so walk the tree
// rather than only its first level.
const checkTargets = (subpath, condition, target) => {
  if (target === null) return;
  if (typeof target === 'string') {
    if (!existsSync(join(distDir, target))) {
      problems.push(`packed export "${subpath}" (${condition}) points at missing file: ${target}`);
    }
    return;
  }
  for (const [nested, nestedTarget] of Object.entries(target)) {
    checkTargets(subpath, condition ? `${condition}.${nested}` : nested, nestedTarget);
  }
};

for (const [subpath, target] of Object.entries(distExports)) {
  checkTargets(subpath, '', target);
}

if (problems.length > 0) {
  console.error(`verify-exports: ${packageDir} packed exports are not consumable:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`verify-exports: ${expectedSubpaths.length} declared subpaths present in packed exports, all targets exist.`);
