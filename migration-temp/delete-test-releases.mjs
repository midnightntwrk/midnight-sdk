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

// TEMPORARY migration tool (issue #222). See ../MIGRATION_TEMP.md §6.
//
// Deletes GitHub Releases (and their git tags) that were created while TESTING the
// release flow. Our release tags are `<pkgname>@<version>` (e.g.
// `@midnightntwrk/platform-js@3.0.1`). Reverting commits does NOT remove Releases or
// tags, so this cleans them up.
//
// SAFE BY DESIGN: it lists the candidate Releases (scoped to THIS repo's SDK
// packages), makes you pick which to delete, prints the exact set, and asks for
// confirmation before deleting anything. Deletion uses `gh release delete
// --cleanup-tag`, which removes the Release AND its git tag.
//
// ⚠️ DESTRUCTIVE + outward-facing. Requires the `gh` CLI authenticated with a token
// that can delete releases/tags (GITHUB_TOKEN or `gh auth login`) — e.g. run by SRE.
//
// Usage:
//   node migration-temp/delete-test-releases.mjs                 # interactive: pick from a list
//   node migration-temp/delete-test-releases.mjs --dry-run       # list candidates, delete nothing
//   node migration-temp/delete-test-releases.mjs --tag "@midnightntwrk/platform-js@3.0.1"
//   node migration-temp/delete-test-releases.mjs --tag A --tag B # multiple exact tags
//   node migration-temp/delete-test-releases.mjs --all           # every SDK-scoped release (asks first)
//   node migration-temp/delete-test-releases.mjs --all --yes     # non-interactive (automation/SRE)

import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const shOut = (cmd, args) => sh(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const prompt = async (question) => {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await new Promise((resolve) => rl.question(question, resolve))).trim();
  } finally {
    rl.close();
  }
};

const { values } = parseArgs({
  options: {
    tag: { type: 'string', multiple: true },
    all: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    yes: { type: 'boolean' },
  },
  strict: true,
});

const main = async () => {
  // Fail early if gh isn't authenticated — deletion needs a token with repo write.
  try {
    sh('gh', ['auth', 'status'], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    throw new Error("gh is not authenticated. Run `gh auth login` or set GITHUB_TOKEN (needs release/tag delete rights).");
  }

  // Our SDK package tag prefixes (canonical + transitional dashed alias), so we only
  // ever offer to delete releases that belong to this repo's packages.
  const workspaces = JSON.parse(`[${shOut('yarn', ['workspaces', 'list', '--json']).split('\n').join(',')}]`).filter(
    (ws) => ws.location !== '.',
  );
  const names = workspaces.map((ws) => ws.name);
  const prefixes = names.flatMap((n) => [`${n}@`, `${n.replace('@midnightntwrk/', '@midnight-ntwrk/')}@`]);
  const isOurs = (tag) => prefixes.some((p) => tag.startsWith(p));

  // All releases in the repo.
  const releases = JSON.parse(shOut('gh', ['release', 'list', '--limit', '200', '--json', 'tagName,name,createdAt']));

  // Decide the target set.
  let targets;
  if (values.tag && values.tag.length) {
    // Explicit tags win — validate they exist as releases.
    const existing = new Set(releases.map((r) => r.tagName));
    targets = values.tag.filter((t) => {
      if (!existing.has(t)) console.warn(`! No Release found for tag: ${t} (skipping)`);
      return existing.has(t);
    });
  } else {
    const candidates = releases.filter((r) => isOurs(r.tagName));
    if (!candidates.length) {
      console.log('No SDK-scoped Releases found. Nothing to delete.');
      return;
    }
    if (values.all) {
      targets = candidates.map((r) => r.tagName);
    } else {
      if (!process.stdin.isTTY) throw new Error('No TTY: pass --tag <tag> (repeatable) or --all.');
      console.log('SDK Releases in this repo:\n');
      candidates.forEach((r, i) => console.log(`  [${i + 1}] ${r.tagName}   (${r.createdAt})`));
      const ans = await prompt('\nDelete which? (comma numbers, or "all"): ');
      if (!ans) {
        console.log('Nothing selected.');
        return;
      }
      targets =
        ans.toLowerCase() === 'all'
          ? candidates.map((r) => r.tagName)
          : ans
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .map((t) => {
                const idx = Number(t);
                if (!Number.isInteger(idx) || idx < 1 || idx > candidates.length) {
                  throw new Error(`Invalid selection: ${t}`);
                }
                return candidates[idx - 1].tagName;
              });
    }
  }

  if (!targets.length) {
    console.log('Nothing to delete.');
    return;
  }

  console.log(`\nThe following ${targets.length} Release(s) + their git tags will be DELETED:`);
  targets.forEach((t) => console.log(`  - ${t}`));

  if (values['dry-run']) {
    console.log('\n(dry-run) Nothing deleted.');
    return;
  }

  if (!values.yes) {
    const ok = (await prompt('\nType "delete" to confirm: ')).toLowerCase();
    if (ok !== 'delete') {
      console.log('Aborted.');
      return;
    }
  }

  const results = targets.map((tag) => {
    try {
      sh('gh', ['release', 'delete', tag, '--cleanup-tag', '--yes'], { stdio: ['ignore', 'ignore', 'pipe'] });
      console.log(`✓ deleted ${tag} (Release + tag)`);
      return { tag, ok: true };
    } catch (err) {
      console.error(`✗ failed ${tag}: ${String(err.stderr || err.message).trim()}`);
      return { tag, ok: false };
    }
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDeleted ${results.length - failed.length}/${results.length}.`);
  if (failed.length) process.exit(1);
};

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
