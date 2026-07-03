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

import { Effect } from 'effect';
import { TreeFormatter } from 'effect/ParseResult';
import * as Schema from 'effect/Schema';

import * as ZKManifestError from './ZKManifestError.js';

/** The only manifest format version this parser understands. */
export const SUPPORTED_MANIFEST_VERSION = '1';

/** Reserved top-level keys carrying manifest metadata; every other top-level key is a directory. */
const MANIFEST_VERSION_KEY = 'manifest-version';
const COMPILER_VERSION_KEY = 'compiler-version';
const LANGUAGE_VERSION_KEY = 'language-version';
const RUNTIME_VERSION_KEY = 'runtime-version';

/** Integrity metadata for a single generated file. */
export interface ZKManifestFile {
  /** The size of the file, in bytes. */
  readonly size: number;
  /** The lower-case hex-encoded SHA-256 digest of the file's bytes. */
  readonly hash: string;
}

/**
 * A parsed ZK artifact manifest — the integrity manifest emitted by `compactc` alongside the
 * compiled contract assets.
 *
 * The on-disk format nests file entries under their directory (`keys`, `zkir`, `contract`,
 * `compiler`); this parsed form flattens them into {@link files}, keyed by their POSIX relative
 * path (e.g. `"keys/clear.verifier"`) so lookups line up with the paths assets are read from.
 *
 * @category models
 */
export interface ZKManifest {
  /** The manifest format version — always {@link SUPPORTED_MANIFEST_VERSION} for a successful parse. */
  readonly manifestVersion: typeof SUPPORTED_MANIFEST_VERSION;
  /** The version of `compactc` that produced the assets, if recorded. */
  readonly compilerVersion?: string;
  /** The Compact language version the source targeted, if recorded. */
  readonly languageVersion?: string;
  /** The `@midnight-ntwrk/compact-runtime` version the assets target, if recorded. */
  readonly runtimeVersion?: string;
  /** File integrity entries keyed by `"<dir>/<file>"` relative path. */
  readonly files: ReadonlyMap<string, ZKManifestFile>;
}

/** A non-negative byte count. */
const SizeSchema = Schema.Int.pipe(Schema.nonNegative());

/** A lower-case hex-encoded SHA-256 digest (32 bytes → 64 hex chars). */
const HashSchema = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{64}$/));

/** Leaf node: `{ "type": "file", "size": n, "hash": "…" }`. */
const ManifestFileSchema = Schema.Struct({
  type: Schema.Literal('file'),
  size: SizeSchema,
  hash: HashSchema
});
type ManifestFileNode = Schema.Schema.Type<typeof ManifestFileSchema>;

/**
 * Directory node: a `"type": "directory"` marker (a bare string) alongside file leaves. Modelling
 * every value as a union of the marker or a file leaf sidesteps the awkward typing of a struct
 * whose known key (`type`) differs from its index signature.
 *
 * Note: this intentionally supports only a single level of directory nesting (matching the layout
 * `compactc` emits). A nested sub-directory object matches neither the `'directory'` marker nor a
 * file leaf, so it is rejected by decode rather than silently ignored.
 */
const ManifestDirectorySchema = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.Literal('directory'), ManifestFileSchema)
});

/**
 * Whole document: reserved metadata keys carry strings (e.g. `manifest-version`); every other
 * top-level key is a directory node.
 *
 * This stays an open `string | directory` record because the distinction between reserved metadata
 * keys and directory keys is carried by the *key*, which a value schema cannot see — and a
 * `Struct` index signature in {@link Schema} is applied to the declared fields too, so it cannot
 * model "these keys are strings, all others are objects". The key-dependent invariants (metadata
 * must be strings; every other key must be a directory, not a bare string) are therefore enforced
 * as typed post-decode checks in {@link parse}.
 */
const ManifestDocumentSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.String, ManifestDirectorySchema)
});

/** Top-level keys carrying metadata strings; every other top-level key is a directory node. */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  MANIFEST_VERSION_KEY,
  COMPILER_VERSION_KEY,
  LANGUAGE_VERSION_KEY,
  RUNTIME_VERSION_KEY
]);

/**
 * Keys that JavaScript treats specially: a `__proto__` data property is silently swallowed when a
 * decoded object is rebuilt by assignment (its directory — and every asset under it — would vanish
 * from {@link ZKManifest.files} while the parse still "passes"), and `constructor`/`prototype` are
 * prototype-pollution vectors. `compactc` never emits these, so any manifest containing one is
 * rejected outright.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

// `onExcessProperty: 'error'` rejects unknown keys on the file-leaf struct, in keeping with the
// "reject what we cannot interpret" posture. (Records match every key via their index signature, so
// this only tightens `ManifestFileSchema`.)
const decodeManifestDocument = Schema.decodeUnknown(ManifestDocumentSchema, {
  errors: 'all',
  onExcessProperty: 'error'
});

const isFileNode = (value: string | ManifestFileNode): value is ManifestFileNode => typeof value !== 'string';

/**
 * Finds the first {@link FORBIDDEN_KEYS} entry in a freshly `JSON.parse`d value, before it is decoded
 * (decode drops a `__proto__` key rather than surfacing it). Returns `undefined` when the value is
 * clean.
 *
 * The traversal is iterative rather than recursive so that a pathologically deep manifest cannot
 * blow the call stack — a thrown `RangeError` here would escape as an untyped defect rather than the
 * {@link ZKManifestError.ZKManifestError} this boundary promises.
 */
const findForbiddenKey = (root: unknown): string | undefined => {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || value === null) continue;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'string' && FORBIDDEN_KEYS.has(key)) return key;
    }
    for (const child of Object.values(value)) {
      stack.push(child);
    }
  }
  return undefined;
};

/**
 * Parses and validates the raw JSON contents of a ZK artifact manifest, flattening its
 * directory-nested entries into {@link ZKManifest.files}.
 *
 * The manifest reaches this boundary as untrusted input, so it is decoded with a {@link Schema} —
 * yielding structural validation and a typed failure rather than hand-rolled checks. An unknown or
 * missing {@link SUPPORTED_MANIFEST_VERSION | manifest-version} fails the parse, since a manifest we
 * cannot interpret must not be treated as a passing integrity check.
 *
 * @param rawJson The raw JSON text of the manifest file.
 * @returns An {@link Effect} that yields a {@link ZKManifest}, or fails with a
 * {@link ZKManifestError.ZKManifestError}.
 *
 * @category constructors
 */
export const parse = (rawJson: string): Effect.Effect<ZKManifest, ZKManifestError.ZKManifestError> =>
  Effect.try({
    try: () => JSON.parse(rawJson) as unknown,
    catch: (cause) => ZKManifestError.make(`Invalid ZK artifact manifest: ${String(cause)}`, cause)
  }).pipe(
    Effect.flatMap((raw) => {
      // Reject prototype-polluting keys on the raw value, before decode silently discards them.
      const forbidden = findForbiddenKey(raw);
      if (forbidden !== undefined) {
        return Effect.fail(ZKManifestError.make(`ZK artifact manifest contains a forbidden key '${forbidden}'.`));
      }
      return decodeManifestDocument(raw).pipe(
        Effect.mapError((parseError) =>
          ZKManifestError.make(`Invalid ZK artifact manifest: ${TreeFormatter.formatErrorSync(parseError)}`, parseError)
        )
      );
    }),
    Effect.flatMap((document) => {
      // Reserved keys must hold strings. Reject a present-but-malformed value (e.g. an object that
      // matched the directory arm of the union) rather than silently coercing it to "absent", which
      // would misreport a malformed `manifest-version` as missing.
      for (const key of RESERVED_KEYS) {
        const value = document[key];
        if (value !== undefined && typeof value !== 'string') {
          return Effect.fail(ZKManifestError.make(`ZK artifact manifest metadata '${key}' must be a string.`));
        }
      }
      // Safe now that the loop above has rejected any non-string reserved value.
      const readMetadata = (key: string): string | undefined => {
        const value = document[key];
        return typeof value === 'string' ? value : undefined;
      };

      // Guard the version up front, before any flattening work: a missing or unsupported version
      // means a manifest we cannot interpret, which must not be treated as a passing integrity check.
      const manifestVersion = readMetadata(MANIFEST_VERSION_KEY);
      if (manifestVersion === undefined) {
        return Effect.fail(ZKManifestError.make(`ZK artifact manifest is missing '${MANIFEST_VERSION_KEY}'.`));
      }
      if (manifestVersion !== SUPPORTED_MANIFEST_VERSION) {
        return Effect.fail(
          ZKManifestError.make(
            `Unsupported ZK artifact manifest version '${manifestVersion}'; expected '${SUPPORTED_MANIFEST_VERSION}'.`
          )
        );
      }

      const files = new Map<string, ZKManifestFile>();
      for (const [key, value] of Object.entries(document)) {
        if (RESERVED_KEYS.has(key)) continue;
        // Every non-reserved key must be a directory node. A bare string here (e.g. a directory
        // truncated to just its `'directory'` marker) would otherwise contribute no files and let
        // an entire directory's assets pass unverified.
        if (typeof value === 'string') {
          return Effect.fail(
            ZKManifestError.make(`ZK artifact manifest entry '${key}' must be a directory, not the string '${value}'.`)
          );
        }
        // A directory node: collect its file leaves, skipping the `type: 'directory'` marker.
        for (const [fileName, fileNode] of Object.entries(value)) {
          if (isFileNode(fileNode)) {
            const path = `${key}/${fileName}`;
            // The `<dir>/<file>` join is ambiguous if a key contains `/` (e.g. `"a/b"+"c"` and
            // `"a"+"b/c"` both yield `a/b/c`). Fail on collision rather than let one integrity
            // record silently overwrite another.
            if (files.has(path)) {
              return Effect.fail(
                ZKManifestError.make(`ZK artifact manifest has duplicate entries for path '${path}'.`)
              );
            }
            files.set(path, { size: fileNode.size, hash: fileNode.hash });
          }
        }
      }

      return Effect.succeed({
        manifestVersion: SUPPORTED_MANIFEST_VERSION,
        compilerVersion: readMetadata(COMPILER_VERSION_KEY),
        languageVersion: readMetadata(LANGUAGE_VERSION_KEY),
        runtimeVersion: readMetadata(RUNTIME_VERSION_KEY),
        files
      } satisfies ZKManifest);
    })
  );
