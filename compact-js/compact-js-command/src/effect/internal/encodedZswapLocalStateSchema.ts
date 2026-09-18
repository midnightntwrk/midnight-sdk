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

/**
 * This schema's decoded type — the shape the commands hand to, and receive from, an era's
 * compact-runtime zswap codec.
 *
 * @remarks
 * The two pins that used to live here (`_PinnedToRuntime` and `_RuntimePinnedToSchema`, asserting
 * assignability in each direction against `CompactRuntime.EncodedZswapLocalState`) moved into
 * `internal/era/binding.ts`, which states them as the *parameter* and *return* types of
 * `CommandRuntime`'s two zswap members. That checks the identical pair of relationships — parameters
 * contravariantly, returns covariantly — but once per era the CLI can select, rather than once
 * against whichever line the build happens to bind. The reason the encode direction matters is
 * unchanged and worth keeping in view: `Schema.Struct` defaults to `onExcessProperty: 'ignore'`, so
 * a field added to a line's encoded zswap state would be silently stripped from every written
 * `--output-zswap` file, surfacing only when the file is read back and the coin set is wrong.
 */
export type EncodedZswapLocalStateSchema = typeof EncodedZswapLocalStateSchema.Type;

export const encodeZswapLocalStateObject = Schema.encodeUnknown(EncodedZswapLocalStateSchema);
export const decodeZswapLocalStateObject = Schema.decodeUnknown(EncodedZswapLocalStateSchema);
