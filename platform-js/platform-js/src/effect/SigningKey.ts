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

import { Brand } from 'effect';

import * as Hex from './Hex.js';

/**
 * The kind of signature scheme that a {@link SigningKey} is used with.
 *
 * @remarks
 * This mirrors the `SignatureKind` discriminant used by the Midnight ledger (Ledger 9). It is kept as a plain
 * string literal union so that a {@link SigningKey} is structurally compatible with the ledger's representation
 * without requiring a direct dependency on it.
 *
 * @category models
 */
export type SignatureKind = (typeof SignatureKinds)[number];

/**
 * All supported {@link SignatureKind} values.
 *
 * @category models
 */
export const SignatureKinds = ['schnorr', 'ecdsa'] as const;

/**
 * The default {@link SignatureKind} assumed when none is configured.
 *
 * @category models
 */
export const DefaultSignatureKind: SignatureKind = 'schnorr';

/**
 * A signing key, comprising the {@link SignatureKind | kind} of signature scheme it is used with, along with the
 * raw key {@link SigningKey.Value | value}.
 *
 * @remarks
 * A signing key is used to create a Contract Maintenance Authority (CMA) when initializing a new contract.
 * It is used to create a verifying key that is included in the contract deployment data that will
 * eventually be stored on the Midnight network.
 *
 * The shape `{ tag, value }` is structurally compatible with the signing key representation used by the Midnight
 * ledger (Ledger 9).
 *
 * @category keys
 */
export interface SigningKey {
  /**
   * The kind of signature scheme this key is used with.
   */
  readonly tag: SignatureKind;

  /**
   * The raw key value, a public BIP-340 signing key, 32 bytes in length, with an optional 3-byte version prefix.
   */
  readonly value: SigningKey.Value;
}

export declare namespace SigningKey {
  /**
   * The raw value of a {@link SigningKey}; a hex-encoded string 32 bytes in length, with an optional 3-byte
   * version prefix.
   *
   * @category keys
   */
  export type Value = Brand.Branded<string, 'SigningKeyValue'>;
}

/**
 * Creates a {@link SigningKey.Value} from a hex-encoded source string.
 *
 * @category constructors
 */
export const Value = Brand.all(
  Brand.nominal<SigningKey.Value>(),
  Hex.ConstrainedPlainHex({ byteLength: '32..=35' })
);

/**
 * Creates a {@link SigningKey} from a raw key value and an optional {@link SignatureKind}.
 *
 * @param value The raw key value. A string source is validated and branded as a {@link SigningKey.Value}.
 * @param tag The {@link SignatureKind} the key is used with. Defaults to {@link DefaultSignatureKind}
 * (`'schnorr'`).
 * @returns A {@link SigningKey}.
 *
 * @category constructors
 */
export const make: (value: SigningKey.Value | string, tag?: SignatureKind) => SigningKey
  = (value, tag = DefaultSignatureKind) => ({ tag, value: Value(value) });
