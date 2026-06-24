#!/usr/bin/env node
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-require-imports */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read version from version.json
const versionJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8'));
const version = versionJson.v_info.version;
const preRelease = versionJson.v_info.preRelease;
const releaseVersion = version + preRelease;

// Get commits since last release tag
const lastTag = `compact-js-v${version}`;
let commits;
try {
  commits = execSync(`git log ${lastTag}..HEAD --format=%B%n---COMMIT_END---`, { encoding: 'utf8' });
} catch {
  // Tag doesn't exist, get all commits
  commits = execSync('git log --all --format=%B%n---COMMIT_END---', { encoding: 'utf8' });
}

const commitMessages = commits.split('---COMMIT_END---').filter(Boolean);

const grouped = {
  Features: [],
  'Bug Fixes': [],
  Refactors: [],
  'Performance Improvements': [],
  Chores: [],
  Documentation: []
};

commitMessages.forEach((msg) => {
  const firstLine = msg.trim().split('\n')[0];
  const match = firstLine.match(/^([a-z]+)\/(.*)/i);

  if (match) {
    const [, type, subject] = match;
    const typeMap = {
      feat: 'Features',
      fix: 'Bug Fixes',
      refactor: 'Refactors',
      perf: 'Performance Improvements',
      chore: 'Chores',
      docs: 'Documentation'
    };

    const category = typeMap[type.toLowerCase()] || 'Chores';
    if (subject.trim()) {
      grouped[category].push(`* ${subject.trim()}`);
    }
  }
});

const changelog = Object.entries(grouped)
  .filter(([, items]) => items.length > 0)
  .map(([category, items]) => `### ${category}\n\n${items.join('\n')}`)
  .join('\n\n');

if (changelog) {
  const date = new Date().toISOString().split('T')[0];

  const entry = `## ${releaseVersion} (${date})\n\n${changelog}\n\n`;
  const changelogPath = path.join(__dirname, 'CHANGELOG.md');
  const existing = fs.readFileSync(changelogPath, 'utf8');

  fs.writeFileSync(changelogPath, entry + existing);
  console.log(`Generated changelog entry for ${releaseVersion}`);
} else {
  console.log('No new commits found');
}
