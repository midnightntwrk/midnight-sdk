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
  /** The manifest format version (always {@link SUPPORTED_MANIFEST_VERSION} for a successful parse). */
  readonly manifestVersion: string;
  /** The version of `compactc` that produced the assets, if recorded. */
  readonly compilerVersion?: string;
  /** The Compact language version the source targeted, if recorded. */
  readonly languageVersion?: string;
  /** The `@midnight-ntwrk/compact-runtime` version the assets target, if recorded. */
  readonly runtimeVersion?: string;
  /** File integrity entries keyed by `"<dir>/<file>"` relative path. */
  readonly files: ReadonlyMap<string, ZKManifestFile>;
}

/** Leaf node: `{ "type": "file", "size": n, "hash": "…" }`. */
const ManifestFileSchema = Schema.Struct({
  type: Schema.Literal('file'),
  size: Schema.Number,
  hash: Schema.String
});
type ManifestFileNode = Schema.Schema.Type<typeof ManifestFileSchema>;

/**
 * Directory node: a `"type": "directory"` marker (a bare string) alongside file leaves. Modelling
 * every value as a union of the marker or a file leaf sidesteps the awkward typing of a struct
 * whose known key (`type`) differs from its index signature.
 */
const ManifestDirectorySchema = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.Literal('directory'), ManifestFileSchema)
});

/** Whole document: metadata strings (e.g. `manifest-version`) alongside directory nodes. */
const ManifestDocumentSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.String, ManifestDirectorySchema)
});

const decodeManifestDocument = Schema.decodeUnknown(Schema.parseJson(ManifestDocumentSchema), { errors: 'all' });

const isFileNode = (value: string | ManifestFileNode): value is ManifestFileNode => typeof value !== 'string';

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
      ZKManifestError.make(`Invalid ZK artifact manifest: ${TreeFormatter.formatErrorSync(parseError)}`, parseError)
    ),
    Effect.flatMap((document) => {
      const metadata = new Map<string, string>();
      const files = new Map<string, ZKManifestFile>();

      for (const [key, value] of Object.entries(document)) {
        if (typeof value === 'string') {
          metadata.set(key, value);
          continue;
        }
        // A directory node: collect its file leaves, skipping the `type: 'directory'` marker.
        for (const [fileName, fileNode] of Object.entries(value)) {
          if (isFileNode(fileNode)) {
            files.set(`${key}/${fileName}`, { size: fileNode.size, hash: fileNode.hash });
          }
        }
      }

      const manifestVersion = metadata.get(MANIFEST_VERSION_KEY);
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

      return Effect.succeed({
        manifestVersion,
        compilerVersion: metadata.get(COMPILER_VERSION_KEY),
        languageVersion: metadata.get(LANGUAGE_VERSION_KEY),
        runtimeVersion: metadata.get(RUNTIME_VERSION_KEY),
        files
      } satisfies ZKManifest);
    })
  );
