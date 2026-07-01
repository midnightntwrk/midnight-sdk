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

// Creates a GitHub Release for each publishable package at its current version
// (issue #222). Runs in the stable publish job AFTER `changeset tag` has created
// and pushed the `<name>@<version>` git tags. Release notes are taken from the
// package's CHANGELOG.md entry for that version (so they derive from changesets,
// not hand-written). Idempotent: skips a tag that already has a Release.
//
// Requires the `gh` CLI authenticated via GITHUB_TOKEN.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaces = execFileSync('yarn', ['workspaces', 'list', '--json'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter((ws) => ws.location !== '.');

const publishable = workspaces.flatMap((ws) => {
  const pkg = JSON.parse(readFileSync(resolve(ws.location, 'package.json'), 'utf8'));
  return pkg.private ? [] : [{ ...ws, pkg }];
});

// Extract the CHANGELOG.md section for `version`: everything between the
// `## <version>` heading and the next `## ` heading.
const extractNotes = (location, version) => {
  const path = resolve(location, 'CHANGELOG.md');
  if (!existsSync(path)) return '';
  const lines = readFileSync(path, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
};

const releaseExists = (tag) => {
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
};

let created = 0;
let skipped = 0;
for (const ws of publishable) {
  const { name, version } = ws.pkg;
  const tag = `${name}@${version}`;
  if (releaseExists(tag)) {
    console.log(`Skip ${tag}: Release already exists.`);
    skipped += 1;
    continue;
  }
  const notes = extractNotes(ws.location, version) || `Release ${name} v${version}.`;
  console.log(`Creating GitHub Release for ${tag}...`);
  execFileSync('gh', ['release', 'create', tag, '--title', `${name} v${version}`, '--notes', notes], {
    stdio: 'inherit',
  });
  created += 1;
}

console.log(`\n--- GitHub Releases ---\nCreated: ${created}, Skipped: ${skipped}`);
