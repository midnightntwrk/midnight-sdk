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

import * as Error from '@effect/platform/Error';
import { hasProperty } from 'effect/Predicate';

const TypeId: unique symbol = Symbol.for('compact-js/effect/ZKManifestError');
type TypeId = typeof TypeId;

/**
 * An error that occurred while parsing a ZK artifact manifest.
 *
 * @category errors
 */
export class ZKManifestError extends Error.TypeIdError(TypeId, 'ZKManifestError')<{
  /** A displayable message. */
  readonly message: string;
  /** Indicates a more specific cause of the error. */
  readonly cause?: unknown;
}> {}

/**
 * Determines if a value is a ZK manifest error.
 *
 * @param u The value to check.
 * @returns `true` if `u` is a {@link ZKManifestError}; `false` otherwise.
 *
 * @category guards
 */
export const isManifestError = (u: unknown): u is ZKManifestError => hasProperty(u, TypeId);

/**
 * Creates a new {@link ZKManifestError}.
 *
 * @category constructors
 */
export const make: (message: string, cause?: unknown) => ZKManifestError = (message, cause) =>
  new ZKManifestError({ message, cause });
