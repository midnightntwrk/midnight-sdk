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
 * Renders the compact-js release note for a tag, in the shape of the network-ops component
 * release-note template (v8), from facts that are already in the repository: the manifests and
 * lockfile at the tag, the compiler pin in `global.env`, and the pull requests merged since the
 * previous compact-js tag.
 *
 * Everything it prints is derived — there is no hand-written source file to keep in step. Pull
 * requests are classified by their conventional-commit prefix, so the quality of the note tracks
 * the quality of pull-request titles; `feat:` becomes a feature, `fix:` a fixed defect, a `!`
 * prefix or a `BREAKING CHANGE:` footer a breaking change.
 *
 * Only commits touching `compact-js/` count, so the sibling workspace in this monorepo cannot
 * leak into the note. Run it with the tag checked out and full history available.
 *
 * Usage: `node compact-js/scripts/release-notes.mjs --version 3.0.0-rc.3 [--repo owner/name]
 *        [--out FILE] [--no-prs]`
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(WORKSPACE, '..');
const TAG_PREFIX = 'compact-js-v';
const COMPONENT_LABEL = 'component:compact-js';

const usage = (message) => {
  console.error(`release-notes: ${message}`);
  console.error('usage: node compact-js/scripts/release-notes.mjs --version <v> [--repo owner/name] [--out FILE] [--no-prs]');
  process.exit(2);
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const version = flag('--version');
if (version === undefined) usage('expected --version');
const outFile = flag('--out');
const withPrs = !args.includes('--no-prs');

/** Runs a command, reporting whether it succeeded and, when it did not, what it said. */
const attempt = (cmd, argv) => {
  try {
    const out = execFileSync(cmd, argv, { encoding: 'utf8', cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim(), stderr: '' };
  } catch (error) {
    return { ok: false, out: '', stderr: String(error.stderr || error.message).trim() };
  }
};

const run = (cmd, argv, allowFailure = false) => {
  const result = attempt(cmd, argv);
  if (result.ok) return result.out;
  if (allowFailure) return '';
  throw new Error(`${cmd} ${argv.join(' ')} failed: ${result.stderr}`);
};

const readIfPresent = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

/** Orders two semver strings, counting a pre-release as older than its own release. */
const compareVersions = (a, b) => {
  const parts = (v) => {
    const [core, pre] = v.split('-');
    return [...core.split('.').map(Number), pre ?? '￿'];
  };
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const [x, y] = [pa[i] ?? 0, pb[i] ?? 0];
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

// ---------------------------------------------------------------- repository facts

const repo = flag('--repo') ?? process.env.GITHUB_REPOSITORY ?? (() => {
  const url = run('git', ['remote', 'get-url', 'origin'], true);
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return m ? m[1] : 'midnightntwrk/midnight-sdk';
})();

const tag = `${TAG_PREFIX}${version}`;
const isPrerelease = version.includes('-');

const allTags = run('git', ['tag', '-l', `${TAG_PREFIX}*`, '--sort=-creatordate']).split('\n').filter(Boolean);
if (!allTags.includes(tag)) usage(`no such tag ${tag} — fetch tags, or check the version`);

// Newest first, so the entry after the target is the release this one is a delta against. Taken by
// position rather than by "first that is not the target", which only holds for the newest tag.
const previousTag = allTags[allTags.indexOf(tag) + 1];
const previousVersion = previousTag?.slice(TAG_PREFIX.length);

const tagDate = (run('git', ['log', '-1', '--format=%aI', tag], true) || new Date().toISOString()).slice(0, 10);

// Read at the tag rather than from the checkout: the pins a release was built with are a fact
// about that commit, and a note can be regenerated for an older release at any time.
const atTag = (path) => run('git', ['show', `${tag}:${path}`], true) || readIfPresent(join(REPO_ROOT, path));
const jsonAtTag = (path) => JSON.parse(atTag(path));

const rootManifest = jsonAtTag('compact-js/package.json');
const pkgManifest = jsonAtTag('compact-js/compact-js/package.json');
const commandManifest = jsonAtTag('compact-js/compact-js-command/package.json');
const lockfile = atTag('compact-js/yarn.lock');
const globalEnv = atTag('compact-js/.github/env/global.env');

/**
 * Resolved versions per package name, read from the Yarn Berry lockfile at the tag. A descriptor
 * may carry a URL rather than a range, whose own `@` must not be mistaken for the name separator.
 */
const lockResolutions = () => {
  const resolved = new Map();
  for (const block of lockfile.split(/\n(?=\S)/)) {
    const version = block.match(/^ {2}version:\s*(\S+)/m)?.[1];
    if (version === undefined) continue;
    for (const spec of block.split('\n')[0].replace(/:$/, '').split(', ')) {
      const name = spec.replace(/^"|"$/g, '').match(/^(@[^/@]+\/[^@]+|[^@][^@]*)@/)?.[1];
      if (name === undefined) continue;
      if (!resolved.has(name)) resolved.set(name, new Set());
      resolved.get(name).add(version);
    }
  }
  return resolved;
};
const resolutions = lockResolutions();

/**
 * The version a dependency actually resolves to. An exact manifest pin is already the answer; a
 * range is resolved against the lockfile, taking the highest match, because a transitive copy of
 * an older line can sit in the same lockfile and must not be reported as a build pin.
 */
const resolvedOf = (name, declared) => {
  if (declared !== undefined && /^\d/.test(declared)) return declared;
  const candidates = [...(resolutions.get(name) ?? [])];
  if (candidates.length === 0) return declared;
  return candidates.sort(compareVersions).at(-1);
};

const compactcVersion = globalEnv.match(/^COMPACTC_VERSION=(\S+)/m)?.[1];
// Era-scoped fixtures pin their own compiler inline in the build scripts, so a new era is picked
// up here the day its script is added rather than when someone remembers this list.
const eraCompilers = [...new Set(
  Object.values(pkgManifest.scripts ?? {})
    .flatMap((s) => [...s.matchAll(/COMPACTC_VERSION=(\S+)/g)].map((m) => m[1])),
)].filter((v) => v !== compactcVersion);

// ---------------------------------------------------------------- pull requests in range

const BOT_TITLE = /^chore(\(deps\))?:\s*(bump|update)\b/i;
const VERSION_BUMP = /^(chore:\s*)?(bump (for )?version|version[- ]bump|update (the )?version for release)/i;
const CONVENTIONAL = /^(\w+)(\(([^)]*)\))?(!)?:\s*(.+)$/;

// First-parent only: the mainline sees one commit per merged pull request, whether the repository
// squashes or merges. A path filter cannot be used here — history simplification drops the very
// merge commits that carry the pull-request number — so the workspace scoping happens below,
// against the files each pull request actually touched.
// Subjects only: both merge and squash commits carry the number there, while a body can quote a
// pull request belonging to some upstream project.
const prNumbersInRange = () => {
  if (previousTag === undefined) return [];
  const log = run('git', ['log', `${previousTag}..${tag}`, '--first-parent', '--format=%s']);
  const numbers = new Set();
  for (const m of log.matchAll(/(?:Merge pull request #|\(#)(\d{1,6})\b/g)) numbers.add(Number(m[1]));
  return [...numbers].sort((a, b) => a - b);
};

// A number scraped from a subject need not name a pull request here, so a genuine miss is skipped.
// Anything else — denied permissions, rate limiting, no network — has to stop the run: a note that
// silently loses its changes would replace a real release body with "no consumer-visible changes".
const PR_NOT_FOUND = /could not resolve to a pullrequest|no pull requests found|not found/i;

const fetchPr = (number) => {
  const result = attempt('gh', ['pr', 'view', String(number), '--repo', repo, '--json',
    'number,title,labels,mergedAt,url,files,body']);
  if (!result.ok) {
    if (PR_NOT_FOUND.test(result.stderr)) return undefined;
    throw new Error(`gh pr view ${number} failed: ${result.stderr}`);
  }
  const pr = JSON.parse(result.out);
  if (pr.mergedAt === null) return undefined;
  if (!(pr.files ?? []).some((f) => f.path.startsWith('compact-js/'))) return undefined;
  return { ...pr, labels: (pr.labels ?? []).map((l) => l.name) };
};

// Release notes are public and carry no emoji, no author handles and no agent trailers, so body
// text is scrubbed before any of it is quoted.
const EMOJI = /\p{Extended_Pictographic}|️/gu;
const bodyLines = (pr) => (pr.body ?? '')
  .replace(/<details>[\s\S]*?<\/details>/g, '')
  .replace(/<[^>]+>/g, '')
  .replace(/^(Co-Authored-By|Signed-off-by):.*$/gim, '')
  .replace(/(Generated with|Co-Authored-By).*Claude.*$/gim, '')
  .replace(/@[\w-]+/g, '')
  .replace(EMOJI, '')
  .split('\n');

const BOILERPLATE_HEADING = /^(summary|overview|what changed|changes|background|context|motivation)$/i;

/**
 * A human-readable name: the body's own title beats a branch-shaped pull-request title. Only the
 * *first* heading counts — anything later is a section of the body, not a name for the change.
 */
const headline = (pr, fallback) => {
  for (const line of bodyLines(pr)) {
    const heading = line.match(/^#{1,2}\s+(.+?)\s*$/)?.[1];
    if (heading === undefined) continue;
    return BOILERPLATE_HEADING.test(heading) ? fallback : heading.replace(/[`*]/g, '').trim();
  }
  return fallback;
};

/** The first real paragraph of the body, for a description the pull-request title cannot give. */
const description = (pr) => {
  const paragraphs = bodyLines(pr).join('\n').split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.trim().replace(/\s+/g, ' ');
    if (text === '' || /^[#>|*\-+[\]`]/.test(text) || text.length < 40) continue;
    return text.length > 420 ? `${text.slice(0, 417).replace(/\s\S*$/, '')}…` : text;
  }
  return undefined;
};

const classify = (pr) => {
  const isBot = pr.labels.includes('dependencies') || BOT_TITLE.test(pr.title);
  if (VERSION_BUMP.test(pr.title)) return { kind: 'skip' };
  if (isBot) return { kind: 'dependency' };

  const m = pr.title.match(CONVENTIONAL);
  const type = m?.[1]?.toLowerCase();
  const breaking = m?.[4] === '!';
  // A branch-shaped title ("Feat/phase2") carries the same intent as a prefix, minus the colon.
  const summary = (m?.[5] ?? pr.title.replace(/^(feat|fix|chore|perf|refactor)\/\s*/i, '')).trim();
  const scope = m?.[3];

  if (breaking) return { kind: 'breaking', summary, scope };
  switch (type) {
    case 'feat':
      return { kind: 'feature', summary, scope };
    case 'fix':
      return { kind: 'fix', summary, scope };
    case 'perf':
    case 'refactor':
      return { kind: 'improvement', summary, scope };
    case 'chore':
    case 'ci':
    case 'test':
    case 'docs':
    case 'build':
    case 'style':
      // This repository has shipped era migrations under `chore:`. The component label is the
      // maintainer saying the change is component-relevant, and it outranks the prefix.
      return pr.labels.includes(COMPONENT_LABEL)
        ? { kind: 'improvement', summary, scope }
        : { kind: 'housekeeping', summary, scope };
    default:
      // No recognisable prefix: surface it rather than dropping a possibly real change.
      return { kind: 'feature', summary, scope };
  }
};

const prs = [];
if (withPrs) {
  for (const number of prNumbersInRange()) {
    const pr = fetchPr(number);
    if (pr === undefined) continue;
    const classified = { ...pr, ...classify(pr) };
    prs.push({
      ...classified,
      name: headline(pr, classified.summary ?? pr.title),
      detail: description(pr),
    });
  }
}

const of = (kind) => prs.filter((p) => p.kind === kind);
const features = of('feature');
const fixes = of('fix');
const improvements = of('improvement');
const breaking = of('breaking');
const dependencies = of('dependency');
const housekeeping = of('housekeeping');

// ---------------------------------------------------------------- derived metadata

// Measured against the last stable release, not the previous tag: every tag on a pre-release line
// shares one base version, so comparing with the tag before would call a major release a patch.
const releaseType = (() => {
  const lastStable = allTags.map((t) => t.slice(TAG_PREFIX.length)).find((v) => !v.includes('-'));
  if (lastStable === undefined) return 'major';
  const [maj, min] = version.split('-')[0].split('.').map(Number);
  const [sMaj, sMin] = lastStable.split('.').map(Number);
  if (maj !== sMaj) return 'major';
  if (min !== sMin) return 'minor';
  return 'patch';
})();

const publishedPackages = [
  [pkgManifest.name, 'execution environment for contracts compiled by compactc'],
  ['@midnight-ntwrk/compact-js-node', 'node platform implementations of the Compact.js service types'],
  [commandManifest.name, 'command line interface for executing compiled contracts'],
];

const knownIssues = (() => {
  const json = run('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--label', COMPONENT_LABEL,
    '--label', 'known-issue', '--json', 'number,title,url'], true);
  if (json === '') return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
})();

// ---------------------------------------------------------------- rendering

const cite = (pr) => `PR #${pr.number}`;
const sentence = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const scoped = (pr) => (pr.scope ? `**${pr.scope}**: ` : '');
const blobLink = (path) => `https://github.com/${repo}/blob/${tag}/${path}`;

const out = [];
const section = (heading, body) => out.push(`## ${heading}`, '', body.trim(), '');

out.push(`# compact-js ${version}`, '');

section('Metadata', [
  `- **Release type**: ${releaseType}`,
  `- **Date**: ${tagDate}`,
  isPrerelease && previousVersion
    ? `- **Sister-line note**: This release is on the \`${version.slice(version.indexOf('-') + 1).split('.')[0]}\` pre-release line. Consumers tracking the stable line should stay on the latest non-pre-release tag.`
    : undefined,
  `- **Environment**: Mainnet`,
  `- **Released artifact(s)**: see **Artifacts** below.`,
  `- **Component class**: \`library/SDK\``,
  `- **Upgrade scope**: \`N/A — library\` (see **Deployment information** below)`,
  `- **Reset required**: \`N/A — library\``,
  `- **Governance action required**: \`N/A — library\``,
].filter(Boolean).join('\n'));

section('High-level summary', (() => {
  const parts = [];
  if (features.length) parts.push(`${features.length} new ${features.length === 1 ? 'feature' : 'features'}`);
  if (improvements.length) parts.push(`${improvements.length} ${improvements.length === 1 ? 'improvement' : 'improvements'}`);
  if (fixes.length) parts.push(`${fixes.length} ${fixes.length === 1 ? 'fix' : 'fixes'}`);
  if (dependencies.length) parts.push(`${dependencies.length} dependency ${dependencies.length === 1 ? 'update' : 'updates'}`);
  const body = parts.length ? parts.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'no consumer-visible changes';
  const range = previousVersion ? ` since ${previousVersion}` : '';
  const warn = breaking.length
    ? ` ${breaking.length} change${breaking.length === 1 ? '' : 's'} in this release ${breaking.length === 1 ? 'is' : 'are'} breaking — see **Breaking changes**.`
    : '';
  return `compact-js ${version} contains ${body}${range}.${warn}`;
})());

section('Audience', [
  'This release is written for:',
  '',
  '- Developers building Compact smart contracts against `@midnight-ntwrk/compact-js` and the `compact-js-command` CLI.',
  '- Framework integrators consuming compact-js from an application layer.',
  '- Teams whose tooling has to target a specific ledger era.',
].join('\n'));

section('Dependencies', [
  `- Requires node \`${rootManifest.engines?.node ?? '>=22'}\` (\`package.json\`).`,
  `- Requires \`@midnight-ntwrk/compact-runtime\` \`${pkgManifest.dependencies?.['@midnight-ntwrk/compact-runtime'] ?? '—'}\` (\`package.json\`).`,
  compactcVersion ? `- Contracts are compiled with \`compactc\` ${compactcVersion} (\`global.env\`).` : undefined,
  '',
  '**Downstream impact (cascading effects).** ' + (breaking.length
    ? 'This release carries breaking changes; see that section for the required actions.'
    : 'No cascading action is required of consuming components.'),
].filter((line) => line !== undefined).join('\n'));

section('Tested-with versions', (() => {
  // An era-scoped dependency may be installed under an alias, so the npm target decides whether a
  // row belongs here, not the key it is installed as.
  const midnightDeps = Object.entries(pkgManifest.dependencies ?? {})
    .map(([key, declared]) => {
      const alias = declared.match(/^npm:(@?[^@]+(?:\/[^@]+)?)@(.+)$/);
      return { label: key, name: alias?.[1] ?? key, declared: alias?.[2] ?? declared };
    })
    .filter(({ label, name }) => `${label} ${name}`.includes('midnight'));

  const rows = [
    compactcVersion ? ['`compactc`', compactcVersion, '`global.env`'] : undefined,
    ...eraCompilers.map((v) => ['`compactc` (era-scoped fixtures)', v, '`package.json`']),
    ...midnightDeps.map(({ label, name, declared }) => [
      label === name ? `\`${name}\`` : `\`${name}\` (as \`${label}\`)`,
      resolvedOf(name, declared),
      /^\d/.test(declared) ? '`package.json`' : '`yarn.lock`',
    ]),
    ...['@midnightntwrk/onchain-runtime-v4', '@midnight-ntwrk/onchain-runtime-v3']
      .map((name) => [`\`${name}\``, resolvedOf(name), '`yarn.lock`']),
    ['node', rootManifest.engines?.node, '`package.json`'],
  ].filter((row) => row !== undefined && row[1] !== undefined);

  return [
    'Build pins — not QA-verified. These are the versions this tag resolves and builds against, read from the manifests and lockfile at the tag. They are not an interop matrix.',
    '',
    '| Component | Tested-with version | Source |',
    '| --- | --- | --- |',
    ...rows.map(([a, b, c]) => `| ${a} | \`${b}\` | ${c} |`),
  ].join('\n');
})());

section('Deployment information', [
  '- **Upgrade scope**: `N/A — library`',
  '- **Reset required**: `N/A — library`',
  '- **Governance action required**: `N/A — library`',
  '- **Downtime / coordination**: `N/A — library`',
].join('\n'));

section('Artifacts', publishedPackages
  .map(([name, purpose]) => `- \`${name}:${version}\` — ${purpose}.`)
  .join('\n'));

section('What changed', (() => {
  const lines = [
    ...breaking.map((p) => `- ${scoped(p)}${sentence(p.name)} (${cite(p)}) — breaking.`),
    ...features.map((p) => `- ${scoped(p)}${sentence(p.name)} (${cite(p)}).`),
    ...improvements.map((p) => `- ${scoped(p)}${sentence(p.name)} (${cite(p)}).`),
    ...fixes.map((p) => `- ${scoped(p)}${sentence(p.summary)} (${cite(p)}).`),
  ];
  if (dependencies.length) {
    lines.push(`- Updated ${dependencies.length} dependencies (${dependencies.map(cite).join(', ')}).`);
  }
  if (housekeeping.length) {
    lines.push(`- Repository and CI housekeeping (${housekeeping.map(cite).join(', ')}).`);
  }
  return lines.length ? lines.join('\n') : 'No consumer-visible changes in this release.';
})());

section('New features', features.length
  ? features.map((p) => [
      `### Feature \`${p.name}\``,
      '',
      `**Description**: ${p.detail ?? `${sentence(p.summary)}${p.scope ? ` in \`${p.scope}\`` : ''}.`} (${cite(p)})`,
    ].join('\n')).join('\n\n')
  : 'None.');

section('New features requiring configuration updates', 'None.');

section('Improvements', improvements.length
  ? improvements.map((p) => [
      `**Improvement**: \`${p.name}\``,
      '',
      `**Description**: ${p.detail ?? `${sentence(p.summary)}.`} (${cite(p)})`,
    ].join('\n')).join('\n\n')
  : 'None.');

section('Deprecations', 'None.');

section('Breaking changes', breaking.length
  ? breaking.map((p) => [
      `### Breaking change \`${p.name}\``,
      '',
      `**What changed**: ${p.detail ?? `${sentence(p.summary)}.`} (${cite(p)})`,
      '',
      `**What breaks**: see ${p.url} for the affected call sites.`,
      '',
      '**Required actions**:',
      '',
      `- Review ${cite(p)} before upgrading.`,
    ].join('\n')).join('\n\n')
  : 'None.');

section('Known issues', knownIssues.length
  ? knownIssues.map((i) => [
      `### Issue \`${i.title}\``,
      '',
      `**Description**: ${i.title} (${i.url})`,
    ].join('\n')).join('\n\n')
  : 'None.');

section('Links and references', [
  previousTag ? `- **PRs**: https://github.com/${repo}/compare/${previousTag}...${tag}` : undefined,
  `- **Engineering docs**: ${blobLink('compact-js/CLAUDE.md')}`,
  `- **SDK docs**: ${blobLink('compact-js/README.md')}`,
  `- **API documentation**: ${blobLink('compact-js/compact-js/README.md')}`,
  `- **Known issues board**: https://github.com/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A${encodeURIComponent(COMPONENT_LABEL)}`,
].filter(Boolean).join('\n'));

section('Fixed defect list', fixes.length
  ? [
      `The following defects were fixed in \`${version}\`.`,
      '',
      '| Defect number | Description |',
      '| --- | --- |',
      ...fixes.map((p) => `| ${cite(p)} | ${scoped(p)}${sentence(p.summary)}. |`),
    ].join('\n')
  : `No defects were fixed in \`${version}\`.`);

if (prs.length) {
  section('Full changelog', [
    '<details>',
    '<summary>Full changelog</summary>',
    '',
    ...prs.map((p) => `- ${p.title} (${cite(p)})`),
    '',
    '</details>',
  ].join('\n'));
}

const markdown = `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;

if (outFile === undefined) process.stdout.write(markdown);
else writeFileSync(outFile, markdown);

console.error(
  `release-notes: ${tag}${previousTag ? ` (since ${previousTag})` : ''} — ` +
  `${features.length} features, ${improvements.length} improvements, ${fixes.length} fixes, ` +
  `${breaking.length} breaking, ${dependencies.length} dependency updates, ${housekeeping.length} housekeeping`,
);
