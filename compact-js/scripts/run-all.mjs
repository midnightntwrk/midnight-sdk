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
 * Runs each named package script in order, **continuing past a failure**, and exits non-zero if any
 * of them failed.
 *
 * `a && b` in a package script hides b's state behind a's: one flaky runtime test would skip the
 * whole type-test suite and report nothing about it. Every suite named here reports on every run.
 *
 * Usage: `node ../scripts/run-all.mjs <script-name>...`
 */

import { spawnSync } from 'node:child_process';

const scripts = process.argv.slice(2);

if (scripts.length === 0) {
  console.error('run-all: expected at least one package script name');
  process.exit(2);
}

// No `shell: true`: it propagates the ambient shell's settings and turns the arguments into a
// command string. Nothing here needs it — `yarn` is executable directly, and the script names
// arrive as separate argv entries.
const failed = scripts.filter((script) => spawnSync('yarn', ['run', script], { stdio: 'inherit' }).status !== 0);

if (failed.length > 0) {
  console.error(`\nrun-all: ${failed.length} of ${scripts.length} failed: ${failed.join(', ')}`);
  process.exit(1);
}
