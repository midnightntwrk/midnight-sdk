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

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * The canonical key-location grammar for contract calls.
 *
 * A transaction carries one proof per contract call, and each call prototype carries a
 * `key_location` string that routes the call to the proving material (prover key, verifier key,
 * ZKIR) for its circuit. The ledger treats `key_location` as opaque prover-routing metadata: it is
 * written by the transaction assembler, round-tripped verbatim to the proving provider, and never
 * enters consensus. Historically the bare circuit name was used, which collides when two contracts
 * in the same transaction deploy identically named circuits.
 *
 * The canonical grammar is:
 *
 * ```
 * contract:<contract-address-hex>/<circuitId>?vk=<sha-256 of the deployed raw verifier key, hex>
 * ```
 *
 * - `<contract-address-hex>` is the 64-character hex encoding of the contract's address;
 * - `<circuitId>` is the circuit's identifier, restricted to `[A-Za-z0-9_]+` so that locations
 *   can never traverse paths when a prover maps them onto a file system;
 * - `vk` is the lowercase hex SHA-256 digest of the raw verifier key bytes deployed for the
 *   circuit, allowing provers to resolve key material by verifier-key content (a vk-join) rather
 *   than trusting a name.
 *
 * The `midnight/` prefix is reserved for protocol builtins (e.g. `midnight/zswap/spend`) and is
 * never produced or parsed by this codec.
 */
export interface ContractKeyLocation {
  /** The hex-encoded address of the contract being called. */
  readonly contractAddress: string;
  /** The identifier of the circuit being invoked. */
  readonly circuitId: string;
  /** The lowercase hex SHA-256 digest of the circuit's deployed raw verifier key. */
  readonly verifierKeyHash: string;
}

const PREFIX = 'contract:';
const CONTRACT_ADDRESS_PATTERN = /^[0-9a-fA-F]{64}$/;
const CIRCUIT_ID_PATTERN = /^[A-Za-z0-9_]+$/;
const VERIFIER_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const LOCATION_PATTERN = /^contract:([0-9a-fA-F]{64})\/([A-Za-z0-9_]+)\?vk=([0-9a-f]{64})$/;

/**
 * Computes the lowercase hex SHA-256 digest of a raw verifier key.
 *
 * @param verifierKey The raw verifier key bytes, exactly as deployed in the contract's operation.
 */
export const hashVerifierKey = (verifierKey: Uint8Array): string => bytesToHex(sha256(verifierKey));

/**
 * Encodes a {@link ContractKeyLocation} into the canonical grammar.
 *
 * @throws Error If any component fails validation; an invalid component can never be a key
 * location, and silently encoding one would produce a location no prover can resolve.
 */
export const encodeContractKeyLocation = (location: ContractKeyLocation): string => {
  if (!CONTRACT_ADDRESS_PATTERN.test(location.contractAddress)) {
    throw new Error(
      `Cannot encode contract key location: contract address '${location.contractAddress}' is not 64 hex characters.`
    );
  }
  if (!CIRCUIT_ID_PATTERN.test(location.circuitId)) {
    throw new Error(
      `Cannot encode contract key location: circuit id '${location.circuitId}' must match [A-Za-z0-9_]+.`
    );
  }
  if (!VERIFIER_KEY_HASH_PATTERN.test(location.verifierKeyHash)) {
    throw new Error(
      `Cannot encode contract key location: verifier key hash '${location.verifierKeyHash}' is not a lowercase hex SHA-256 digest.`
    );
  }
  return `${PREFIX}${location.contractAddress}/${location.circuitId}?vk=${location.verifierKeyHash}`;
};

/**
 * Parses a canonical key location, returning `undefined` when the input is not in the canonical
 * grammar (e.g. a bare circuit name, or a `midnight/` protocol builtin). Parsing is strict:
 * a string that begins with `contract:` but deviates from the grammar is rejected rather than
 * repaired, so that assembler and prover can never disagree about a location's meaning.
 */
export const parseContractKeyLocation = (keyLocation: string): ContractKeyLocation | undefined => {
  const match = LOCATION_PATTERN.exec(keyLocation);
  if (match === null) {
    return undefined;
  }
  const contractAddress = match[1];
  const circuitId = match[2];
  const verifierKeyHash = match[3];
  if (contractAddress === undefined || circuitId === undefined || verifierKeyHash === undefined) {
    // Unreachable: the pattern has exactly three non-optional capture groups. Guarded (rather
    // than asserted) so the module is sound under `noUncheckedIndexedAccess` in any consumer.
    return undefined;
  }
  return { contractAddress, circuitId, verifierKeyHash };
};
