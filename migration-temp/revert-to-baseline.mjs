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

// TEMPORARY migration tool (issue #222). See ../MIGRATION_TEMP.md.
//
// During changesets testing, real release PRs get merged into `main` (version
// bumps, changelogs, in-tree tags, etc.). When a test run is finished we need
// `main` back exactly as it was before. `main` is protected, so this tool CANNOT
// push to it directly — instead it opens a PR whose single commit restores the
// repo tree to a chosen BASELINE commit. You then MERGE that PR to complete the
// revert, and the repo is back to where it started.
//
// It never touches your working tree, index, or current branch: the revert commit
// is built with `git commit-tree` (plumbing) and pushed straight to a new branch.
//
// Baseline hash resolution (first match wins):
//   1. --hash <sha>
//   2. "baselineHash" in migration-temp/revert.config.json
//   3. interactive prompt (only when run in a TTY)
//
// Usage:
//   # Record the current origin/main as the baseline (do this BEFORE testing):
//   node migration-temp/revert-to-baseline.mjs --set-baseline
//   node migration-temp/revert-to-baseline.mjs --set-baseline --hash <sha>
//
//   # Open the revert PR (interactive, or from config):
//   node migration-temp/revert-to-baseline.mjs
//
//   # Non-interactive (e.g. when Claude runs it): explicit hash + skip prompt
//   node migration-temp/revert-to-baseline.mjs --hash <sha> --yes
//   node migration-temp/revert-to-baseline.mjs --yes            # uses config hash
//
// Requires the `gh` CLI authenticated (GITHUB_TOKEN or `gh auth login`).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, 'revert.config.json');

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });
const shOut = (cmd, args) => sh(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const readConfigSafe = () => {
  try {
    return existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};
  } catch {
    return {};
  }
};

const writeConfig = (cfg) => writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');

const prompt = async (question) => {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await new Promise((resolve) => rl.question(question, resolve))).trim();
  } finally {
    rl.close();
  }
};

const assertCommit = (ref) => {
  try {
    sh('git', ['cat-file', '-e', `${ref}^{commit}`], { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    throw new Error(`Not a valid commit: ${ref}`);
  }
};

const { values } = parseArgs({
  options: {
    hash: { type: 'string' },
    base: { type: 'string' },
    'set-baseline': { type: 'boolean' },
    yes: { type: 'boolean' },
  },
  strict: true,
});

const main = async () => {
  const baseBranch = values.base ?? readConfigSafe().baseBranch ?? 'main';

  // Always operate against the freshest remote main.
  console.log(`Fetching origin/${baseBranch} ...`);
  sh('git', ['fetch', 'origin', baseBranch], { stdio: 'inherit' });
  const baseRef = `origin/${baseBranch}`;
  const baseSha = shOut('git', ['rev-parse', baseRef]);

  // --- --set-baseline: just record the hash and exit ------------------------
  if (values['set-baseline']) {
    const hash = values.hash ? shOut('git', ['rev-parse', values.hash]) : baseSha;
    assertCommit(hash);
    const cfg = readConfigSafe();
    writeConfig({
      ...cfg,
      baselineHash: hash,
      baseBranch,
      capturedAt: new Date().toISOString(),
      note: cfg.note ?? 'Baseline commit to restore `main` to after changesets testing. See ../MIGRATION_TEMP.md.',
    });
    console.log(`Saved baseline ${hash.slice(0, 7)} (${baseBranch}) to ${CONFIG_PATH}`);
    return;
  }

  // --- resolve the baseline hash --------------------------------------------
  const cfg = readConfigSafe();
  let hash = values.hash ?? cfg.baselineHash ?? (await prompt('Baseline commit hash to restore to: '));
  if (!hash) throw new Error('No baseline hash (use --hash, set it in revert.config.json, or run in a TTY).');
  hash = shOut('git', ['rev-parse', hash]);
  assertCommit(hash);
  const baselineShort = hash.slice(0, 7);

  // Nothing to do if main already matches the baseline tree.
  const baseTree = shOut('git', ['rev-parse', `${baseRef}^{tree}`]);
  const baselineTree = shOut('git', ['rev-parse', `${hash}^{tree}`]);
  if (baseTree === baselineTree) {
    console.log(`origin/${baseBranch} already matches baseline ${baselineShort}. Nothing to revert.`);
    return;
  }

  console.log(`\nWill open a PR against '${baseBranch}' restoring the repo tree to ${baselineShort}.`);
  console.log(`Changes on ${baseBranch} since the baseline (these get reverted):`);
  console.log(sh('git', ['diff', '--stat', `${hash}..${baseRef}`]) || '  (none)');

  if (!values.yes) {
    const ok = (await prompt('Proceed and open the revert PR? (y/N) ')).toLowerCase();
    if (ok !== 'y' && ok !== 'yes') {
      console.log('Aborted.');
      return;
    }
  }

  // Build the revert commit without touching the working tree (plumbing): a
  // commit whose tree IS the baseline's, parented on the current main tip.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const branch = `revert/changeset-testing-to-${baselineShort}-${stamp}`;
  const message =
    `revert: restore repo to pre-changeset-testing baseline (${baselineShort})\n\n` +
    `Reverts everything merged into ${baseBranch} after ${hash} during changesets\n` +
    `testing. Generated by migration-temp/revert-to-baseline.mjs (issue #222).`;
  const revertCommit = shOut('git', ['commit-tree', baselineTree, '-p', baseSha, '-m', message]);

  console.log(`\nPushing revert commit ${revertCommit.slice(0, 7)} to ${branch} ...`);
  sh('git', ['push', 'origin', `${revertCommit}:refs/heads/${branch}`], { stdio: 'inherit' });

  console.log('Opening PR ...');
  const prUrl = shOut('gh', [
    'pr',
    'create',
    '--base',
    baseBranch,
    '--head',
    branch,
    '--title',
    `revert: changeset testing -> baseline ${baselineShort}`,
    '--body',
    `Automated revert generated by \`migration-temp/revert-to-baseline.mjs\` (issue #222).\n\n` +
      `Restores \`${baseBranch}\` to baseline commit \`${hash}\`, undoing everything merged during ` +
      `changesets testing (version bumps, changelogs, in-tree tags, etc.).\n\n` +
      `**Merge this PR to complete the revert** — then the repo is back to where it started.`,
  ]);

  console.log(`\n✅ PR created: ${prUrl}`);
  console.log('➡️  Review and MERGE it to finish the revert.');
};

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
