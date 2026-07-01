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
 * `JSON.stringify` replacer for circuit outputs (results and log events), which contain types that
 * the default serializer mishandles:
 * - `bigint` throws a `TypeError` unless converted, so it is emitted as its decimal string.
 * - `Uint8Array` serializes as an object (`{"0":215,...}`) rather than an array, so it is emitted
 *   as a plain `number[]`.
 *
 * @internal
 */
export const circuitOutputReplacer = (_key: string, value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Array.from(value);
  return value;
};

/**
 * Serializes a circuit output value to JSON using {@link circuitOutputReplacer}.
 *
 * @param value The value to serialize.
 * @param space Optional indentation passed through to `JSON.stringify`.
 * @returns The JSON string.
 *
 * @internal
 */
export const stringifyCircuitOutput = (value: unknown, space?: number): string =>
  JSON.stringify(value, circuitOutputReplacer, space);
