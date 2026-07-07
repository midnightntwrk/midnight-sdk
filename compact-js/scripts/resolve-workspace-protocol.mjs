#!/usr/bin/env node
// Resolve the `workspace:` protocol in a built dist/package.json into concrete
// semver ranges, so the published tarball is installable by npm/pnpm/yarn.
//
// Why this exists: this repo packs with `npm pack` on the `@effect/build-utils`
// `dist/` folder and publishes the resulting tarball with `npm publish`. Neither
// npm step understands the `workspace:` protocol, so without this step the
// published manifest ships literal `workspace:^` and consumers hit
// EUNSUPPORTEDPROTOCOL. (yarn/pnpm only rewrite the protocol when publishing a
// workspace member directly, which this dist-based flow never does.)
//
// Usage: node scripts/resolve-workspace-protocol.mjs <path-to-dist/package.json>

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('usage: resolve-workspace-protocol.mjs <dist/package.json>');
  process.exit(1);
}

// Repo root is the parent of this script's `scripts/` directory.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Map workspace package name -> version by scanning top-level dirs
// (the root `workspaces` glob is "*").
const versions = new Map();
for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const pkgPath = join(repoRoot, entry.name, 'package.json');
  if (!existsSync(pkgPath)) continue;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name && pkg.version) versions.set(pkg.name, pkg.version);
  } catch {
    /* ignore non-JSON / unreadable */
  }
}

const resolveRange = (name, spec) => {
  // spec is e.g. "workspace:^", "workspace:~", "workspace:*", "workspace:^1.2.3"
  const rest = spec.slice('workspace:'.length);
  const version = versions.get(name);
  if (!version) {
    throw new Error(`cannot resolve workspace dependency "${name}": not found in workspace`);
  }
  if (rest === '' || rest === '*') return version; // exact
  if (rest === '^') return `^${version}`;
  if (rest === '~') return `~${version}`;
  return rest; // explicit range already, e.g. "^1.2.3"
};

const manifest = JSON.parse(readFileSync(target, 'utf8'));
let changed = false;
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
  const deps = manifest[field];
  if (!deps) continue;
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === 'string' && spec.startsWith('workspace:')) {
      deps[name] = resolveRange(name, spec);
      console.log(`  ${field}: ${name}  ${spec} -> ${deps[name]}`);
      changed = true;
    }
  }
}

if (changed) {
  writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`resolved workspace protocol in ${target}`);
} else {
  console.log(`no workspace protocol to resolve in ${target}`);
}
