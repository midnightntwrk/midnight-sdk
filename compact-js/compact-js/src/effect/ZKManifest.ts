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
import { type ParseError, TreeFormatter } from 'effect/ParseResult';
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

// The JSON parse happens inside the decode boundary via {@link Schema.parseJson}, rather than a
// hand-rolled `JSON.parse`: Effect's decoder is safe against prototype pollution (a `__proto__` key
// is dropped, never assigned, so it cannot rewrite the object's prototype), so no manual key scanning
// is needed. `onExcessProperty: 'error'` rejects unknown keys on the file-leaf struct, in keeping
// with the "reject what we cannot interpret" posture. (Records match every key via their index
// signature, so this only tightens `ManifestFileSchema`.)
const decodeManifestDocument = Schema.decodeUnknown(Schema.parseJson(ManifestDocumentSchema), {
  errors: 'all',
  onExcessProperty: 'error'
});

const isFileNode = (value: string | ManifestFileNode): value is ManifestFileNode => typeof value !== 'string';

/**
 * Whether a directory or file name is a single path segment safe to join into a relative asset path:
 * non-empty, not a `.`/`..` traversal component, and free of path separators or NUL. `compactc` only
 * ever emits plain names, so anything else is a malformed (or malicious) manifest. Enforcing this
 * keeps every flattened {@link ZKManifest.files} key a simple `"<dir>/<file>"` relative path that a
 * consumer cannot be tricked into resolving outside the assets directory.
 */
const isSafeSegment = (segment: string): boolean =>
  segment.length > 0 &&
  segment !== '.' &&
  segment !== '..' &&
  !segment.includes('/') &&
  !segment.includes('\\') &&
  !segment.includes('\0');

/**
 * Renders a decode failure for display. {@link TreeFormatter.formatErrorSync} walks the parse-error
 * tree recursively, so a pathologically deep manifest can overflow the call stack here — a thrown
 * `RangeError` would escape as an untyped defect rather than the {@link ZKManifestError.ZKManifestError}
 * this boundary promises. Catching it degrades to a generic message while keeping the failure typed.
 */
const formatParseError = (parseError: ParseError): string => {
  try {
    return TreeFormatter.formatErrorSync(parseError);
  } catch {
    return 'the manifest structure is invalid';
  }
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
  decodeManifestDocument(rawJson).pipe(
    Effect.mapError((parseError) =>
      ZKManifestError.make(`Invalid ZK artifact manifest: ${formatParseError(parseError)}`, parseError)
    ),
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
        // The directory name is the first segment of every flattened path; reject anything that could
        // escape the assets directory (`..`, path separators) before it is joined.
        if (!isSafeSegment(key)) {
          return Effect.fail(
            ZKManifestError.make(`ZK artifact manifest directory name '${key}' is not a valid path segment.`)
          );
        }
        // A directory node: collect its file leaves, skipping the `type: 'directory'` marker.
        for (const [fileName, fileNode] of Object.entries(value)) {
          if (!isFileNode(fileNode)) {
            // The only non-file the schema admits is the bare `'directory'` marker, and it is
            // legitimate only as `type: 'directory'`. Any other bare-string leaf (e.g.
            // `"clear.prover": "directory"`) would be silently skipped, dropping that asset's
            // integrity record while the parse still "passes" — the same harm the top-level check above
            // guards, one level down.
            if (fileName === 'type') continue;
            return Effect.fail(
              ZKManifestError.make(
                `ZK artifact manifest entry '${key}/${fileName}' must be a file, not the string '${fileNode}'.`
              )
            );
          }
          // The file name is the second segment of the flattened path; same containment check.
          if (!isSafeSegment(fileName)) {
            return Effect.fail(
              ZKManifestError.make(`ZK artifact manifest file name '${key}/${fileName}' is not a valid path segment.`)
            );
          }
          // With both segments validated as separator-free and unique within their JSON object, each
          // `<dir>/<file>` path is necessarily unique, so no collision check is needed.
          files.set(`${key}/${fileName}`, { size: fileNode.size, hash: fileNode.hash });
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
