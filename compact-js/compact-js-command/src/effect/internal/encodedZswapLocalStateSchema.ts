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

import { type CompactRuntime } from '@midnight-ntwrk/compact-js/effect';
import * as Schema from 'effect/Schema';

export const EncodedCoinPublicKeySchema = Schema.Struct({
  bytes: Schema.Uint8Array
});

export const EncodedContractAddressSchema = Schema.Struct({
  bytes: Schema.Uint8Array
});

export const EncodedQualifiedShieldedCoinInfoSchema = Schema.Struct({
  nonce: Schema.Uint8Array,
  color: Schema.Uint8Array,
  value: Schema.BigInt,
  mt_index: Schema.BigInt
});

export const EncodedShieldedCoinInfoSchema = Schema.Struct({
  nonce: Schema.Uint8Array,
  color: Schema.Uint8Array,
  value: Schema.BigInt
});

export const EncodedRecipientSchema = Schema.Struct({
  is_left: Schema.Boolean,
  left: EncodedCoinPublicKeySchema,
  right: EncodedContractAddressSchema
});

// `Schema.mutable` on the two collections: `Schema.Array` decodes to `readonly T[]`, which is the
// only thing that kept this schema's output from being the runtime's own `EncodedZswapLocalState`.
export const EncodedZswapLocalStateSchema = Schema.Struct({
  coinPublicKey: EncodedCoinPublicKeySchema,
  currentIndex: Schema.BigInt,
  inputs: Schema.mutable(Schema.Array(EncodedQualifiedShieldedCoinInfoSchema)),
  outputs: Schema.mutable(Schema.Array(Schema.Struct({
    coinInfo: EncodedShieldedCoinInfoSchema,
    recipient: EncodedRecipientSchema
  })))
});

/** Erased at emit; exists only to fail the build if the two shapes below stop agreeing. */
type AssertAssignable<A extends B, B> = A;

/**
 * Pins this schema's decoded type to the runtime's own `EncodedZswapLocalState`, which is what lets
 * `circuitCommand` hand a decoded value straight to `CompactRuntime.decodeZswapLocalState` with no
 * `as` cast. The cast that used to sit at that call site asserted the entire shape matched while
 * only the array variance actually differed — and would have kept compiling if the schema and the
 * runtime type genuinely diverged, which is the case worth catching. This fails the build instead.
 */
type _PinnedToRuntime = AssertAssignable<
  typeof EncodedZswapLocalStateSchema.Type,
  CompactRuntime.EncodedZswapLocalState
>;

/**
 * The same pin in the other direction, for the encode path: it catches a field this schema declares
 * that the runtime's `EncodedZswapLocalState` does not have — a schema written against a newer or
 * older runtime than the one actually bound, which would decode `--input-zswap` into a shape the
 * runtime rejects.
 *
 * Note what it does *not* catch, since the two pins divide the work unevenly: a **required** field
 * added to the runtime type is caught by {@link _PinnedToRuntime} above, not here. This one stays
 * silent for that case.
 */
type _RuntimePinnedToSchema = AssertAssignable<
  CompactRuntime.EncodedZswapLocalState,
  typeof EncodedZswapLocalStateSchema.Type
>;

/**
 * Closes the gap neither assignability pin covers: an **optional** field added to the runtime's
 * `EncodedZswapLocalState`. Assignability ignores it in both directions, yet it is exactly what a
 * compatible upstream release adds — and `Schema.Struct` defaults to `onExcessProperty: 'ignore'`,
 * so it is **stripped** rather than rejected. `--output-zswap` feeds a value that comes *from* the
 * runtime through `encodeZswapLocalStateObject`, so the field would vanish from every written state
 * file with the build still green; the loss surfaces much later, when the file is read back through
 * `--input-zswap` and the coin set is wrong.
 *
 * Comparing key sets rather than types is what makes optional fields visible.
 */
type _NoKeyDrift = AssertAssignable<
  Exclude<keyof CompactRuntime.EncodedZswapLocalState, keyof typeof EncodedZswapLocalStateSchema.Type>,
  never
>;

export const encodeZswapLocalStateObject = Schema.encodeUnknown(EncodedZswapLocalStateSchema);
export const decodeZswapLocalStateObject = Schema.decodeUnknown(EncodedZswapLocalStateSchema);
