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

// JSON.parse collapses duplicate object keys silently (keeping the last occurrence), which
// would let a tampered manifest with a shadow file entry pass without error. To catch this at the
// JSON layer — before the manifest ever reaches the Schema validator — we parse with a custom
// reviver that detects and rejects duplicate keys. `JSON.parse`'s own prototype-pollution guard
// (it never assigns a `__proto__` property back onto the decoded object) is preserved.
//
// `onExcessProperty: 'error'` rejects unknown keys on the file-leaf struct, in keeping with the
// "reject what we cannot interpret" posture. (Records match every key via their index signature, so
// this only tightens `ManifestFileSchema`.)
const parseJsonRejectingDuplicateKeys = (raw: string): unknown => {
  // Walker state — index walks the raw string without slicing or regex splitting.
  let index = 0;
  const input = raw;

  const fail = (msg: string): never => {
    throw new ZKManifestError.ZKManifestError(`Invalid ZK artifact manifest: ${msg}`);
  };

  /** Advances past any whitespace (JSON is whitespace-safe between tokens). */
  const skipWs = () => {
    while (index < input.length && (input[index] === ' ' || input[index] === '\n' || input[index] === '\r' || input[index] === '\t')) {
      index++;
    }
  };

  /** Reads a double-quoted JSON string, returning the decoded JS string value. Throws on invalid UTF-8 or unterminated strings. */
  const parseString = (): string => {
    if (input[index] !== '"') fail(`Expected '"' at position ${index}`);
    index++;
    let result = '';
    while (index < input.length && input[index] !== '"') {
      const ch = input[index];
      if (ch === '\\') {
        index++;
        if (index >= input.length) fail('Unexpected end of string');
        const esc = input[index];
        if (esc === '"' || esc === '\\' || esc === '/') { result += esc; index++; }
        else if (esc === 'n') { result += '\n'; index++; }
        else if (esc === 'r') { result += '\r'; index++; }
        else if (esc === 't') { result += '\t'; index++; }
        else if (esc === 'u') {
          if (index + 4 > input.length) fail('Unexpected end of string');
          const hex = input.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(`Invalid unicode escape \\u${hex}`);
          result += String.fromCharCode(parseInt(hex, 16));
          index += 5;
        } else fail(`Unsupported escape \\${esc}`);
      } else if (ch === '"') {
        break;
      } else if (ch.charCodeAt(0) < 0x20) {
        fail(`Control character ${ch.charCodeAt(0)} in string`);
      } else {
        result += ch;
        index++;
      }
    }
    if (index >= input.length || input[index] !== '"') fail('Unterminated string');
    index++; // consume closing quote
    return result;
  };

  /** Parses a JSON value, returning the decoded JS value. */
  const parseValue = (): unknown => {
    skipWs();
    if (index >= input.length) fail('Unexpected end of input');
    const ch = input[index];
    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === 't') {
      if (input.slice(index, index + 4) !== 'true') fail('Invalid literal');
      index += 4; return true;
    }
    if (ch === 'f') {
      if (input.slice(index, index + 5) !== 'false') fail('Invalid literal');
      index += 5; return false;
    }
    if (ch === 'n') {
      if (input.slice(index, index + 4) !== 'null') fail('Invalid literal');
      index += 4; return null;
    }
    if (ch === '-' || (ch.charCodeAt(0) >= 48 && ch.charCodeAt(0) <= 57)) return parseNumber();
    fail(`Unexpected character '${ch}'`);
  };

  /** Parses a JSON number, returning a JS number. */
  const parseNumber = (): number => {
    const start = index;
    if (input[index] === '-') index++;
    if (index >= input.length) fail('Unexpected end of number');
    if (input[index] === '0') {
      index++;
    } else if (input[index].charCodeAt(0) >= 49 && input[index].charCodeAt(0) <= 57) {
      while (index < input.length && input[index].charCodeAt(0) >= 48 && input[index].charCodeAt(0) <= 57) index++;
    } else {
      fail('Invalid number');
    }
    if (input[index] === '.') {
      index++;
      while (index < input.length && input[index].charCodeAt(0) >= 48 && input[index].charCodeAt(0) <= 57) index++;
    }
    if (input[index] === 'e' || input[index] === 'E') {
      index++;
      if (input[index] === '+' || input[index] === '-') index++;
      while (index < input.length && input[index].charCodeAt(0) >= 48 && input[index].charCodeAt(0) <= 57) index++;
    }
    const numStr = input.slice(start, index);
    const num = Number(numStr);
    if (!Number.isFinite(num)) fail(`Invalid number: ${numStr}`);
    return num;
  };

  /** Parses a JSON array, returning a JS array. */
  const parseArray = (): unknown[] => {
    if (input[index] !== '[') fail("Expected '['");
    index++;
    const arr: unknown[] = [];
    skipWs();
    if (input[index] === ']') { index++; return arr; }
    for (;;) {
      arr.push(parseValue());
      skipWs();
      if (input[index] === ']') { index++; return arr; }
      if (input[index] !== ',') fail("Expected ',' or ']'");
      index++;
    }
  };

  /** Parses a JSON object, detecting duplicate keys and throwing a descriptive error. */
  const parseObject = (): Record<string, unknown> => {
    if (input[index] !== '{') fail("Expected '{'");
    index++;
    const obj: Record<string, unknown> = {};
    skipWs();
    if (input[index] === '}') { index++; return obj; }
    for (;;) {
      const key = parseString();
      skipWs();
      if (input[index] !== ':') fail("Expected ':'");
      index++;
      const val = parseValue();
      // Reject duplicate keys — this is the security boundary.
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fail(`Duplicate key '${key}' in JSON object`);
      }
      obj[key] = val;
      skipWs();
      if (input[index] === '}') { index++; return obj; }
      if (input[index] !== ',') fail("Expected ',' or '}'");
      index++;
    }
  };

  const result = parseValue();
  skipWs();
  if (index !== input.length) fail(`Unexpected content after JSON value at position ${index}`);
  return result;
};

/** Parses the manifest JSON, rejecting duplicate keys with a typed {@link ZKManifestError}. */
const parseManifestJson = (raw: string): Record<string, unknown> => {
  try {
    return parseJsonRejectingDuplicateKeys(raw) as Record<string, unknown>;
  } catch (err) {
    // Wrap non-ZKManifestError throws (e.g. from the manual parser) as typed errors.
    if (err instanceof ZKManifestError.ZKManifestError) throw err;
    throw new ZKManifestError.ZKManifestError(`Invalid ZK artifact manifest: ${err instanceof Error ? err.message : String(err)}`);
  }
};

/** Decodes a pre-parsed manifest document object against the schema. */
const decodeManifestDocument = Schema.decodeUnknown(ManifestDocumentSchema, {
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
  // Step 1: parse JSON with duplicate-key detection at the JSON layer (throws ZKManifestError on
  // duplicate keys).  Step 2: validate the decoded structure against the schema (typed failure on
  // schema errors, wrapping parse errors from the schema layer).
  Effect.try({ try: () => parseManifestJson(rawJson), catch: (err) => err as ZKManifestError.ZKManifestError }).pipe(
    Effect.flatMap((document) =>
      (decodeManifestDocument(document) as Effect.Effect<Record<string, unknown>, ZKManifestError.ZKManifestError>).pipe(
        Effect.mapError((parseError) =>
          ZKManifestError.make(`Invalid ZK artifact manifest: ${formatParseError(parseError)}`, parseError)
        )
      )
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
