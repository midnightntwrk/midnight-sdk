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

import { createHash } from 'node:crypto';

export type ContractKeyLocation = {
  contractAddress: string;
  circuitId: string;
  verifierKeyHash: string;
};

const HEX64 = /^[0-9a-f]{64}$/;

// Parses: contract:<64-hex-address>/<circuitId>?vk=<64-hex-hash>
const LOCATION_RE = /^contract:([0-9a-f]{64})\/([^/?]+)\?vk=([0-9a-f]{64})$/;

export function hashVerifierKey(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function encodeContractKeyLocation(loc: ContractKeyLocation): string {
  const { contractAddress, circuitId, verifierKeyHash } = loc;
  if (!HEX64.test(contractAddress)) {
    throw new Error(`Cannot encode contract key location: contractAddress must be 64-char lowercase hex`);
  }
  if (!circuitId || circuitId.includes('/') || circuitId.includes('?')) {
    throw new Error(`Cannot encode contract key location: circuitId must be non-empty and must not contain '/' or '?'`);
  }
  if (!HEX64.test(verifierKeyHash)) {
    throw new Error(`Cannot encode contract key location: verifierKeyHash must be 64-char lowercase hex`);
  }
  return `contract:${contractAddress}/${circuitId}?vk=${verifierKeyHash}`;
}

export function parseContractKeyLocation(str: string): ContractKeyLocation | undefined {
  const m = LOCATION_RE.exec(str);
  if (!m) return undefined;
  return { contractAddress: m[1], circuitId: m[2], verifierKeyHash: m[3] };
}
