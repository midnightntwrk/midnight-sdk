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

import { type ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { Effect, type ParseResult, Schema } from 'effect';

import type * as EraBinding from './era/binding.js';

export const EncodedCoinPublicKeySchema = Schema.Struct({
  bytes: Schema.Uint8Array
});

export const EncodedContractAddressSchema = Schema.Struct({
  bytes: Schema.Uint8Array
});

export const EncodedShieldedCoinInfoSchema = Schema.Struct({
  nonce: Schema.Uint8Array,
  color: Schema.Uint8Array,
  value: Schema.BigInt
});

/** A coin with its position in the coin commitment tree, as the compact-runtime 0.16 line records an input. */
export const EncodedQualifiedShieldedCoinInfoSchema = Schema.Struct({
  ...EncodedShieldedCoinInfoSchema.fields,
  mt_index: Schema.BigInt
});

export const EncodedRecipientSchema = Schema.Struct({
  is_left: Schema.Boolean,
  left: EncodedCoinPublicKeySchema,
  right: EncodedContractAddressSchema
});

const EncodedZswapOutputSchema = Schema.Struct({
  coinInfo: EncodedShieldedCoinInfoSchema,
  recipient: EncodedRecipientSchema
});

/**
 * The encoded zswap local state of a runtime line that records no tree positions: an input is the
 * coin alone, because the transaction builder locates a contract-owned coin's leaf by its
 * commitment.
 *
 * @remarks
 * `Schema.mutable` on the two collections: `Schema.Array` decodes to `readonly T[]`, which is the
 * only thing that kept this schema's output from being the runtime's own `EncodedZswapLocalState`.
 * `Schema.Struct` defaults to `onExcessProperty: 'ignore'`, so a state file written by a line that
 * did record positions still reads back through this schema, minus the positions.
 */
export const EncodedZswapLocalStateSchema = Schema.Struct({
  coinPublicKey: EncodedCoinPublicKeySchema,
  inputs: Schema.mutable(Schema.Array(EncodedShieldedCoinInfoSchema)),
  outputs: Schema.mutable(Schema.Array(EncodedZswapOutputSchema))
});

/**
 * The encoded zswap local state of a runtime line that records tree positions (compact-runtime
 * 0.16): each input carries its `mt_index`, and `currentIndex` counts the outputs the contract has
 * produced.
 */
export const EncodedZswapLocalStateWithTreePositionsSchema = Schema.Struct({
  coinPublicKey: EncodedCoinPublicKeySchema,
  currentIndex: Schema.BigInt,
  inputs: Schema.mutable(Schema.Array(EncodedQualifiedShieldedCoinInfoSchema)),
  outputs: Schema.mutable(Schema.Array(EncodedZswapOutputSchema))
});

/**
 * Encodes a runtime line's zswap local state to its JSON-representable form through the era's
 * schema. `tryRuntime` refuses an async `evaluate` through a conditional on its return type, which
 * a type parameter cannot discharge, so the (synchronous) runtime result is asserted into shape.
 */
export const encodeZswapLocalStateFile = <Z, ZI>(
  runtime: EraBinding.CommandRuntime<Z>,
  zswapLocalStateSchema: Schema.Schema<Z, ZI>,
  message: string,
  zswapLocalState: unknown
): Effect.Effect<ZI, ContractRuntimeError.ContractRuntimeError | ParseResult.ParseError> =>
  runtime
    .tryRuntime(
      message,
      () => runtime.encodeZswapLocalState(zswapLocalState as never) as Z extends PromiseLike<unknown> ? never : Z
    )
    .pipe(Effect.flatMap(Schema.encodeUnknown(zswapLocalStateSchema)));
