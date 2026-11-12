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
import { dirname, join, relative, resolve, sep } from 'node:path';

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

// The mirror of the check above: a subpath the source blocks with `null` (e.g. `./effect/internal/*`,
// which keeps the ledger era binding private) must stay blocked. pack-v3 expands wildcards into one
// entry per emitted module, so a change in how it decides which modules to emit could publish
// `./effect/internal/ledger/current` as importable API with the build still green.
const blockedSubpaths = Object.entries(sourceExports)
  .filter(([, target]) => target === null)
  .map(([subpath]) => subpath);

const isBlockedBy = (subpath, blocked) =>
  blocked.includes('*') ? subpath.startsWith(blocked.slice(0, blocked.indexOf('*'))) : subpath === blocked;

for (const [subpath, target] of Object.entries(distExports)) {
  if (target === null) continue; // Carried through as a blocker, not as a reachable subpath.
  const blockedBy = blockedSubpaths.find((blocked) => isBlockedBy(subpath, blocked));
  if (blockedBy !== undefined) {
    problems.push(`packed exports expose "${subpath}", blocked by "${blockedBy}" in ${sourceManifestPath}`);
  }
}

// Every packed target must exist: a stale or misgenerated entry resolves to nothing at install
// time. Conditions nest arbitrarily (`{"import": {"types": …, "default": …}}`), so walk the tree
// rather than only its first level.
const checkTargets = (subpath, condition, target) => {
  if (target === null) return;
  if (typeof target === 'string') {
    if (!existsSync(join(distDir, target))) {
      // A top-level string target has no condition to name (e.g. `"./package.json"`).
      const via = condition ? ` (${condition})` : '';
      problems.push(`packed export "${subpath}"${via} points at missing file: ${target}`);
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

// Every value the ESM emit exports must also be declared in the sibling `.d.ts`. The two are
// produced by separate `tsc` invocations with different options, so they can disagree — and one
// option makes them disagree silently: `stripInternal` deletes any declaration whose *leading
// comment* carries the internal marker tag. That includes a module docblock sitting on the file's
// first `export` statement, a plain `//` comment that merely mentions the tag, and declarations a
// public type still references. The JS keeps the export either way, so the package runs correctly
// and fails to typecheck — which no test in the repo can see, because tests compile from `src/`,
// where `stripInternal` does not apply.
const exportedValues = (source) => {
  const names = new Set();
  for (const match of source.matchAll(/^export \* as (\w+) from/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export (?:declare )?(?:const|let|var|function|class) (\w+)/gm))
    names.add(match[1]);
  for (const match of source.matchAll(/^export \{([^}]*)\}/gm)) {
    for (const specifier of match[1].split(',')) {
      const parts = specifier.trim().split(/\s+as\s+/);
      const name = (parts[1] ?? parts[0]).trim();
      // `export { type Era }` re-exports a type; it has no value to compare against.
      if (name && !specifier.trim().startsWith('type ')) names.add(name);
    }
  }
  return names;
};

// Declared in the typings but absent from the JS is legitimate — an interface or type alias has no
// runtime counterpart — so this compares in one direction only. Type declarations are deliberately
// *not* collected: a stripped `export const Foo` next to a surviving `export type Foo` (the
// declaration-merged brand pattern this codebase uses) would otherwise look declared.
const declaredValues = (source) => {
  const names = exportedValues(source);
  for (const match of source.matchAll(/^export (?:declare )?(?:namespace|enum) (\w+)/gm)) names.add(match[1]);
  return names;
};

// Only typings a consumer can reach are compared: start from each packed entry's `types` target and
// follow relative imports. A module outside that graph is free to be stripped — nothing names it —
// while one inside it is, by construction, referenced by something a consumer compiles against.
const typesTargets = (target, found = []) => {
  if (typeof target === 'string') return found;
  for (const [condition, nested] of Object.entries(target ?? {})) {
    if (condition === 'types' && typeof nested === 'string') found.push(nested);
    else typesTargets(nested, found);
  }
  return found;
};

const entryTypings = Object.values(distExports)
  .flatMap((target) => typesTargets(target))
  .map((target) => resolve(distDir, target))
  .filter((path) => existsSync(path));

const queue = [...entryTypings];
const visited = new Set();
while (queue.length > 0) {
  const dtsPath = queue.shift();
  if (visited.has(dtsPath) || !existsSync(dtsPath)) continue;
  visited.add(dtsPath);

  const dtsSource = readFileSync(dtsPath, 'utf8');
  for (const match of dtsSource.matchAll(/from '(\.[^']*)'/g)) {
    queue.push(resolve(dirname(dtsPath), match[1].replace(/\.js$/, '.d.ts')));
  }

  // `pack-v3` emits `dist/esm` and `dist/dts` as parallel trees, so the counterpart is positional.
  const jsPath = dtsPath.replace(`${sep}dts${sep}`, `${sep}esm${sep}`).replace(/\.d\.ts$/, '.js');
  if (!existsSync(jsPath)) continue; // A type-only module has no runtime counterpart to compare.

  const declared = declaredValues(dtsSource);
  const missing = [...exportedValues(readFileSync(jsPath, 'utf8'))].filter((name) => !declared.has(name));
  if (missing.length > 0) {
    problems.push(
      `typings for ${relative(distDir, jsPath)} are missing ${missing.map((name) => `"${name}"`).join(', ')} ` +
        `(present in the ESM emit, and this module is reachable from a packed entry's typings; an ` +
        `internal-marker JSDoc tag on the declaration — or on a module docblock sitting above the ` +
        `first export — removes it under stripInternal)`
    );
  }
}

// Then typecheck those same typings as a consumer would.
//
// The value comparison above catches a stripped `export const`, because the ESM emit still has it
// to compare against. It cannot see type-only damage — and that is where this bug class actually
// lands, because `stripInternal` honours an internal-marker JSDoc tag on *any* leading comment,
// including a module docblock, which attaches to whatever the file's first statement happens to be.
// Four modules shipped typings that named `CallProofDataView`, `ConversionLedger` and the `Effect`
// namespace after the marker had deleted them, and `CompiledContract` extended a variance witness
// the same marker removed from its own namespace. None of it has an ESM counterpart, so all five
// passed the check above while failing for any consumer not building with `skipLibCheck`.
//
// Compiling the reachable graph is strictly stronger than extending the name comparison: it does
// not care *how* a declaration went missing, only that what a consumer compiles against resolves.
// Diagnostics are filtered to files under `dist/` — the program necessarily pulls in third-party
// typings, and those are not this package's problem.
if (visited.size > 0) {
  const { default: ts } = await import('typescript');
  const program = ts.createProgram([...visited], {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler
  });

  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const fileName = diagnostic.file?.fileName;
    if (!fileName || !resolve(fileName).startsWith(distDir + sep)) continue;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    problems.push(
      `typings for ${relative(distDir, fileName)}:${line + 1} do not compile: ${message} ` +
        `(a consumer building without skipLibCheck sees this; an internal-marker JSDoc tag on the ` +
        `declaration — or on a module docblock sitting above the first statement — removes it under ` +
        `stripInternal)`
    );
  }
}

if (problems.length > 0) {
  console.error(`verify-exports: ${packageDir} packed exports are not consumable:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `verify-exports: ${expectedSubpaths.length} declared subpaths present in packed exports, ` +
    `${blockedSubpaths.length} blocked, all targets exist.`
);
