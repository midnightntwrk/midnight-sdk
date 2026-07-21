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

const TypeId: unique symbol = Symbol.for('compact-js/effect/MalformedHexPrefixError');
type TypeId = typeof TypeId;

/**
 * A query supplied a `fieldPrefixes` prefix that is not valid hex. Unlike the never-throw contract
 * for on-chain event decoding, a malformed query prefix is a caller programming error (a typo, or a
 * non-hex blob such as a UUID) rather than a normal degraded input — surfacing it fails fast instead
 * of silently matching nothing.
 *
 * @category errors
 */
export class MalformedHexPrefixError extends Error.TypeIdError(TypeId, 'MalformedHexPrefixError')<{
  /** A displayable message. */
  readonly message: string;
  /** The offending prefix, normalized (lowercased, any leading `0x` stripped). */
  readonly prefix: string;
}> {}

/**
 * Determines if a value is a malformed hex prefix error.
 *
 * @param u The value to check.
 * @returns `true` if `u` is a {@link MalformedHexPrefixError}; `false` otherwise.
 *
 * @category guards
 */
export const isMalformedHexPrefixError = (u: unknown): u is MalformedHexPrefixError => hasProperty(u, TypeId);

/**
 * Creates a new {@link MalformedHexPrefixError} for the given (normalized) prefix.
 *
 * @category constructors
 */
export const make: (prefix: string) => MalformedHexPrefixError = (prefix) =>
  new MalformedHexPrefixError({ message: `Malformed hex prefix in query filter: "${prefix}"`, prefix });
