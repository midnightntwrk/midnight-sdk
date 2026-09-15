#!/usr/bin/env node
// Repoint the `default` export condition at the ESM build for packages that have no CommonJS build.
//
// Why this exists: `@effect/build-utils pack-v3` writes `{types, import, default}` for every
// subpath and hard-codes `default` to `./dist/cjs/<module>.js` — unconditionally, even though it
// checks `hasCjs` everywhere else (`main`, `sideEffects`, `files`, the per-entry proxies). A
// package built ESM-only therefore publishes a `default` condition pointing at a directory that
// was never emitted, so every consumer that does not resolve through `import` or `types` gets
// ERR_MODULE_NOT_FOUND. `compact-js-command` cannot have a CJS build at all (`src/index.ts` reads
// `import.meta.url`), so the fix is to make the map say what the package actually ships.
//
// Run after `pack-v3` and before `verify-exports.mjs`, which fails the build on exactly the
// dangling targets this removes.
//
// Usage: node scripts/fix-esm-only-exports.mjs <package-dir>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageDir = resolve(process.argv[2] ?? '.');
const distDir = join(packageDir, 'dist');
const distManifestPath = join(distDir, 'package.json');

if (!existsSync(distManifestPath)) {
  console.error(`fix-esm-only-exports: no manifest at ${distManifestPath}; run the build first.`);
  process.exit(1);
}

// `pack-v3` stages the build output under `dist/dist/<format>`; the absence of `cjs` is what makes
// this package ESM-only.
if (existsSync(join(distDir, 'dist', 'cjs'))) {
  console.log(`fix-esm-only-exports: ${packageDir} ships a CommonJS build; exports left untouched.`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(distManifestPath, 'utf8'));
let repointed = 0;

for (const target of Object.values(manifest.exports ?? {})) {
  // Conditions are one level deep here: `pack-v3` emits a flat `{types, import, default}`.
  if (target === null || typeof target !== 'object') continue;
  if (typeof target.default !== 'string' || !target.default.startsWith('./dist/cjs/')) continue;
  if (typeof target.import !== 'string') continue;

  // `import` and `default` intentionally resolve to the same module: a `require()` of an ESM-only
  // package is either served by Node's require(esm) support (>=22.12, and this repo requires >=22)
  // or fails with a clear ERR_REQUIRE_ESM, rather than a missing-file error naming a build that
  // does not exist.
  target.default = target.import;
  repointed += 1;
}

writeFileSync(distManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`fix-esm-only-exports: ${packageDir} is ESM-only; repointed ${repointed} 'default' conditions at ./dist/esm.`);
