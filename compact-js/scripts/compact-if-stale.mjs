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

/**
 * Runs a package script that compiles test contracts, unless each contract it compiles is already
 * built by the compiler the script would use. The contracts and versions are read off the script's
 * own `run-compactc` steps, therefore adding a contract needs no second list.
 *
 * Usage: `node ../scripts/compact-if-stale.mjs <script-name>`
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [script] = process.argv.slice(2);

if (script === undefined) {
  console.error('compact-if-stale: expected a package script name');
  process.exit(2);
}

const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {};

// `run-compactc` ignores `COMPACTC_VERSION` when `COMPACT_HOME` names a compiler, so that
// compiler's own version is the one to compare with.
const compactHomeVersion =
  process.env.COMPACT_HOME === undefined
    ? undefined
    : spawnSync(join(process.env.COMPACT_HOME, 'compactc'), ['--version'], { encoding: 'utf8' }).stdout?.split(' ')[0];

/** The `run-compactc` steps `name` reaches through `yarn <script>` steps, with their leading `VAR=` settings. */
const compileSteps = (name, env, seen = new Set()) => {
  if (seen.has(name) || scripts[name] === undefined) {
    return [];
  }
  seen.add(name);
  return scripts[name].split('&&').flatMap((step) => {
    const words = step.trim().split(/\s+/);
    const stepEnv = { ...env };
    while (/^[A-Z_]+=/.test(words[0] ?? '')) {
      const [key, ...value] = words.shift().split('=');
      stepEnv[key] = value.join('=');
    }
    const called = words[0] === 'yarn' ? words.slice(words[1] === 'run' ? 2 : 1) : [];
    if (called.length === 1) {
      return compileSteps(called[0], stepEnv, seen);
    }
    if (words[0] === 'run-compactc') {
      return [{ output: words[words.length - 1], version: compactHomeVersion ?? stepEnv.COMPACTC_VERSION }];
    }
    return [];
  });
};

/** Why the step's contract has to be compiled again, or `undefined` if it does not. */
const staleness = ({ output, version }) => {
  // `compactc` writes `contract-info.json` first and `index.js` last, so both are needed to show
  // that a compile finished.
  if (!existsSync(join(output, 'contract', 'index.js'))) {
    return `${output} is missing or incomplete`;
  }
  let builtBy;
  try {
    builtBy = JSON.parse(readFileSync(join(output, 'compiler', 'contract-info.json'), 'utf8'))['compiler-version'];
  } catch {
    return `${output} has no readable contract-info.json`;
  }
  // With no version to compare, presence is all that can be checked; the compile itself would fail.
  return version === undefined || builtBy === version ? undefined : `${output} was built by ${builtBy}, not ${version}`;
};

const steps = compileSteps(script, { COMPACTC_VERSION: process.env.COMPACTC_VERSION });

if (steps.length === 0) {
  console.error(`compact-if-stale: \`${script}\` compiles no contracts from ${process.cwd()}`);
  process.exit(2);
}

const reason = steps.map(staleness).find((why) => why !== undefined);

if (reason === undefined) {
  process.exit(0);
}

console.log(`compact-if-stale: ${reason}, so running \`yarn ${script}\``);
// No `shell: true`, for the reason `run-all.mjs` gives.
process.exit(spawnSync('yarn', ['run', script], { stdio: 'inherit' }).status ?? 1);
