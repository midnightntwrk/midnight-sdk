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

import { describe, expect, it } from '@effect/vitest';
import { ZKManifest, ZKManifestError } from '@midnight-ntwrk/compact-js/effect';
import { Effect } from 'effect';

/** A well-formed 64-char lower-case hex SHA-256 digest for use in fixtures. */
const HASH = 'a'.repeat(64);

/** A structurally valid manifest mirroring the layout `compactc` emits. */
const validManifest = {
  'manifest-version': '1',
  'compiler-version': '0.31.102',
  'language-version': '0.23.102',
  'runtime-version': '0.16.0',
  compiler: {
    type: 'directory',
    'contract-info.json': { type: 'file', size: 2242, hash: HASH }
  },
  contract: {
    type: 'directory',
    'index.js': { type: 'file', size: 30837, hash: HASH }
  },
  keys: {
    type: 'directory',
    'clear.prover': { type: 'file', size: 2820290, hash: HASH },
    'clear.verifier': { type: 'file', size: 2119, hash: HASH }
  }
};

const parseJson = (value: unknown) => ZKManifest.parse(JSON.stringify(value));

describe('ZKManifest.parse', () => {
  it.effect('parses metadata and flattens directory entries into "<dir>/<file>" keys', () =>
    Effect.gen(function* () {
      const manifest = yield* parseJson(validManifest);

      expect(manifest.manifestVersion).toBe('1');
      expect(manifest.compilerVersion).toBe('0.31.102');
      expect(manifest.languageVersion).toBe('0.23.102');
      expect(manifest.runtimeVersion).toBe('0.16.0');

      expect([...manifest.files.keys()].sort()).toEqual([
        'compiler/contract-info.json',
        'contract/index.js',
        'keys/clear.prover',
        'keys/clear.verifier'
      ]);
      expect(manifest.files.get('keys/clear.verifier')).toEqual({ size: 2119, hash: HASH });
    })
  );

  it.effect('leaves optional version metadata undefined when absent', () =>
    Effect.gen(function* () {
      const manifest = yield* parseJson({ 'manifest-version': '1', keys: { type: 'directory' } });

      expect(manifest.compilerVersion).toBeUndefined();
      expect(manifest.languageVersion).toBeUndefined();
      expect(manifest.runtimeVersion).toBeUndefined();
    })
  );

  it.effect('treats an empty directory as contributing no files', () =>
    Effect.gen(function* () {
      const manifest = yield* parseJson({ 'manifest-version': '1', keys: { type: 'directory' } });
      expect(manifest.files.size).toBe(0);
    })
  );

  it.effect('fails when manifest-version is missing', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({ keys: { type: 'directory' } }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('manifest-version');
    })
  );

  it.effect('fails on an unsupported manifest-version', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({ 'manifest-version': '2', keys: { type: 'directory' } }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('Unsupported');
    })
  );

  it.effect('fails on malformed JSON', () =>
    Effect.gen(function* () {
      const error = yield* ZKManifest.parse('{not json').pipe(Effect.flip);
      expect(error).toBeInstanceOf(ZKManifestError.ZKManifestError);
      expect(error.message).toContain('Invalid ZK artifact manifest');
    })
  );

  it.effect('rejects a file node with a non-hex hash', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', 'clear.verifier': { type: 'file', size: 10, hash: 'nothex' } }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
    })
  );

  it.effect('rejects a file node with a negative size', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', 'clear.verifier': { type: 'file', size: -1, hash: HASH } }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
    })
  );

  it.effect('rejects a non-reserved top-level key whose value is a bare string', () =>
    // A directory truncated to just its marker (`"keys": "directory"`) must not silently pass with
    // zero files — that would leave an entire directory's assets unverified.
    Effect.gen(function* () {
      const error = yield* parseJson({ 'manifest-version': '1', keys: 'directory' }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('keys');
      expect(error.message).toContain('directory');
    })
  );

  it.effect('reports a present-but-malformed manifest-version distinctly from a missing one', () =>
    // An object-valued `manifest-version` matches the directory arm of the union; it must be
    // reported as malformed, not coerced to "absent" and misreported as missing.
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': { type: 'directory' },
        keys: { type: 'directory' }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('manifest-version');
      expect(error.message).toContain('must be a string');
      expect(error.message).not.toContain('missing');
    })
  );

  it.effect('rejects an object-valued optional metadata key instead of silently dropping it', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        'compiler-version': { type: 'directory' },
        keys: { type: 'directory' }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('compiler-version');
      expect(error.message).toContain('must be a string');
    })
  );

  it.effect('safely drops a top-level `__proto__` key without polluting the prototype', () =>
    // `Schema.parseJson` never assigns a `__proto__` data property back onto the decoded object, so it
    // cannot rewrite the prototype. The bogus directory simply contributes no files — and since
    // `compactc` only ever emits real directories (`keys`, `zkir`, …), a dropped `__proto__` entry
    // can never hide a genuine asset from verification.
    Effect.gen(function* () {
      const manifest = yield* parseJson({
        'manifest-version': '1',
        ['__proto__']: { type: 'directory', 'x.verifier': { type: 'file', size: 1, hash: HASH } }
      });
      expect(manifest.files.size).toBe(0);
      expect(({} as Record<string, unknown>)['x.verifier']).toBeUndefined();
    })
  );

  it.effect('safely drops a `__proto__` key nested inside a directory', () =>
    Effect.gen(function* () {
      const manifest = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', ['__proto__']: { type: 'file', size: 1, hash: HASH } }
      });
      expect([...manifest.files.keys()]).not.toContain('keys/__proto__');
    })
  );

  it.effect('rejects a directory name that is not a safe path segment', () =>
    // A directory name becomes the first segment of every flattened path; a traversal component must
    // not be allowed to escape the assets directory once a consumer resolves these keys.
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        '../evil': { type: 'directory', 'x.verifier': { type: 'file', size: 1, hash: HASH } }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('../evil');
      expect(error.message).toContain('path segment');
    })
  );

  it.effect('rejects a file name that is not a safe path segment', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', '../../secret': { type: 'file', size: 1, hash: HASH } }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('path segment');
    })
  );

  it.effect('rejects a bare-string file leaf that is not the directory marker', () =>
    // A file entry truncated to just the `'directory'` marker (`"clear.prover": "directory"`) must not
    // be silently skipped — that would drop one asset's integrity record while the parse still passes.
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', 'clear.prover': 'directory' }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('keys/clear.prover');
      expect(error.message).toContain('must be a file');
    })
  );

  it.effect('rejects a file leaf carrying an unknown property', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', 'clear.verifier': { type: 'file', size: 1, hash: HASH, evil: true } }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
    })
  );

  it.effect('fails with a typed error (not a defect) on pathologically deep nesting', () =>
    // Formatting a decode failure with `TreeFormatter.formatErrorSync` walks the parse-error tree
    // recursively, so a pathologically deep manifest can overflow the call stack there; a thrown
    // `RangeError` would escape as an untyped defect rather than the `ZKManifestError` this boundary
    // promises. `Effect.flip` only yields a value for a typed failure, so this would crash rather
    // than pass if the formatting guard were removed.
    Effect.gen(function* () {
      const depth = 100_000;
      const deeplyNested = `{${'"a":{'.repeat(depth)}${'}'.repeat(depth)}}`;
      const error = yield* ZKManifest.parse(deeplyNested).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
    })
  );

  it.effect('rejects a directory nested more than one level deep', () =>
    Effect.gen(function* () {
      const error = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', nested: { type: 'directory', 'a.verifier': { type: 'file', size: 1, hash: HASH } } }
      }).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
    })
  );

  // ─── Duplicate-key detection ─────────────────────────────────────────────────

  it.effect('fails when a top-level duplicate key is present', () =>
    // A tampered manifest that repeats `"keys"` with a different value must not silently
    // drop the first occurrence — that would let a shadow file entry pass unverified.
    Effect.gen(function* () {
      const tamperedManifest = JSON.stringify({
        'manifest-version': '1',
        keys: { type: 'directory', 'clear.verifier': { type: 'file', size: 2119, hash: HASH } },
        keys: { type: 'directory', 'clear.verifier': { type: 'file', size: 9999, hash: 'b'.repeat(64) } }
      });
      const error = yield* ZKManifest.parse(tamperedManifest).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('keys');
      expect(error.message).toContain('Duplicate');
    })
  );

  it.effect('fails when a nested directory key is duplicated', () =>
    Effect.gen(function* () {
      // The second `"clear.verifier"` entry wins silently with stock JSON.parse; we must reject it.
      const tamperedManifest = JSON.stringify({
        'manifest-version': '1',
        keys: {
          type: 'directory',
          'clear.verifier': { type: 'file', size: 2119, hash: HASH },
          'clear.verifier': { type: 'file', size: 9999, hash: 'b'.repeat(64) }
        }
      });
      const error = yield* ZKManifest.parse(tamperedManifest).pipe(Effect.flip);
      expect(ZKManifestError.isManifestError(error)).toBe(true);
      expect(error.message).toContain('clear.verifier');
      expect(error.message).toContain('Duplicate');
    })
  );

  it.effect('accepts a well-formed manifest with no duplicate keys', () =>
    Effect.gen(function* () {
      // Sanity check: the fix must not break valid manifests.
      const manifest = yield* parseJson(validManifest);
      expect(manifest.files.size).toBe(4);
    })
  );

  it.effect('accepts a manifest with all optional metadata fields absent', () =>
    Effect.gen(function* () {
      const manifest = yield* parseJson({
        'manifest-version': '1',
        keys: { type: 'directory', 'clear.prover': { type: 'file', size: 2820290, hash: HASH } }
      });
      expect(manifest.manifestVersion).toBe('1');
      expect(manifest.compilerVersion).toBeUndefined();
      expect(manifest.languageVersion).toBeUndefined();
      expect(manifest.runtimeVersion).toBeUndefined();
      expect(manifest.files.size).toBe(1);
    })
  );
});
