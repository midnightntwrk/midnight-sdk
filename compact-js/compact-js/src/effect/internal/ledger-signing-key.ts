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

import { signingKeyFromBip340, type SigningKey as LedgerSigningKey } from '@midnightntwrk/ledger-v9';

const BIP340_KEY_BYTES = 32;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid signing key hex: odd length (${clean.length})`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Convert a platform-js SigningKey (hex string) into a ledger-v9 SigningKey.
 *
 * platform-js permits 32..=35 bytes: the 32-byte BIP-340 key plus an OPTIONAL
 * 3-byte version prefix. ledger's signingKeyFromBip340 wants exactly the 32
 * BIP-340 bytes, so we strip any leading prefix.
 *
 * IMPORTANT: we call signingKeyFromBip340 rather than hand-building
 * { tag: 'schnorr', value: hex }. ledger's `value` is the *serialized* key
 * (tagged framing), NOT the raw bytes — the raw platform-js hex is not a valid
 * `value`.
 */
export function toLedgerSigningKey(platformKey: string): LedgerSigningKey {
  const bytes = hexToBytes(platformKey);

  let bip340: Uint8Array;
  if (bytes.length === BIP340_KEY_BYTES) {
    bip340 = bytes;
  } else if (bytes.length > BIP340_KEY_BYTES) {
    bip340 = bytes.subarray(bytes.length - BIP340_KEY_BYTES);
  } else {
    throw new Error(`Signing key too short: ${bytes.length} bytes, need ${BIP340_KEY_BYTES}`);
  }

  return signingKeyFromBip340(bip340);
}
