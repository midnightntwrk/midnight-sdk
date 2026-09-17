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

export const encodeZswapLocalStateObject = Schema.encodeUnknown(EncodedZswapLocalStateSchema);
export const decodeZswapLocalStateObject = Schema.decodeUnknown(EncodedZswapLocalStateSchema);
