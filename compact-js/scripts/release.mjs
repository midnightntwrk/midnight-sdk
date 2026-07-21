#!/usr/bin/env node
// Publish the built package tarballs of this workspace root to the registry.
//
// Why this exists: packages here publish the `@effect/build-utils pack-v3`
// `dist/` folder as a tarball (produced by `yarn package`), not the workspace
// member directly. `changeset publish` publishes the member root, which would
// ship source (`exports` → `./src/*.ts`) instead of the built `dist/`. So we
// keep the proven pack-then-publish flow and use Changesets only for
// versioning + changelogs + tags/releases.
//
// This script is invoked as the `publish` command of `changesets/action`. For
// every publishable workspace package it:
//   1. locates the packed tarball in `<pkg>/dist/*.tgz` (run `yarn package` first),
//   2. publishes it with a dist-tag derived from the version
//      (stable → `latest`, `-rc.N` → `rc`, `-alpha.N` → `alpha`, …),
//   3. prints `New tag: <name>@<version>` so `changesets/action` creates the
//      matching git tag + GitHub Release (notes from the package CHANGELOG.md).
//
// Auth + registry come from the ambient `.npmrc` (written by actions/setup-node
// in CD). Set `RELEASE_DRY_RUN=1` to exercise everything without publishing.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dryRun = process.env.RELEASE_DRY_RUN === '1';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Derive the npm dist-tag from a semver string. */
const distTag = (version) => {
  const dash = version.indexOf('-');
  if (dash === -1) return 'latest';
  const id = version.slice(dash + 1).split('.')[0];
  return id || 'latest';
};

/** Is `name@version` already on the registry? */
const alreadyPublished = (name, version) => {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === version;
  } catch {
    // `npm view` exits non-zero when the version does not exist yet.
    return false;
  }
};

// Discover publishable packages: immediate subdirectories (workspaces glob is
// "*") whose manifest is not private and is not the `*-sources` root.
const packages = [];
for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(repoRoot, entry.name, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.private === true) continue;
  if (!manifest.name || manifest.name.endsWith('-sources')) continue;
  packages.push({ dir: join(repoRoot, entry.name), name: manifest.name, version: manifest.version });
}

if (packages.length === 0) {
  console.error('release: no publishable packages found');
  process.exit(1);
}

let publishedCount = 0;
for (const pkg of packages) {
  const tag = distTag(pkg.version);
  const distDir = join(pkg.dir, 'dist');
  const tarballs = existsSync(distDir)
    ? readdirSync(distDir).filter((f) => f.endsWith('.tgz'))
    : [];
  if (tarballs.length === 0) {
    console.error(`release: no tarball found in ${distDir} — did "yarn package" run?`);
    process.exit(1);
  }
  // Prefer a tarball whose name embeds the current version; fall back to the sole one.
  const tarball =
    tarballs.find((f) => f.includes(pkg.version)) ??
    (tarballs.length === 1 ? tarballs[0] : null);
  if (!tarball) {
    console.error(`release: could not disambiguate tarball for ${pkg.name}@${pkg.version} in ${distDir}: ${tarballs.join(', ')}`);
    process.exit(1);
  }

  if (!dryRun && alreadyPublished(pkg.name, pkg.version)) {
    console.log(`release: ${pkg.name}@${pkg.version} already published — skipping`);
    continue;
  }

  const args = ['publish', join(distDir, tarball), '--tag', tag, '--access', 'public'];
  if (dryRun) args.push('--dry-run');
  console.log(`release: publishing ${pkg.name}@${pkg.version} (tag: ${tag})${dryRun ? ' [dry-run]' : ''}`);
  execFileSync('npm', args, { stdio: 'inherit' });

  // Consumed by changesets/action to create the git tag + GitHub Release.
  if (!dryRun) console.log(`New tag: ${pkg.name}@${pkg.version}`);
  publishedCount += 1;
}

console.log(`release: ${publishedCount} package(s) published`);
