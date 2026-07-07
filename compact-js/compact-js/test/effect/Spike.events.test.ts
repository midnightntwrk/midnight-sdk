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

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NodeContext } from '@effect/platform-node';
import { describe, it } from '@effect/vitest';
import {
  CompiledContract,
  Contract,
  ContractExecutable,
  ContractExecutableRuntime
} from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import { ContractState, encodeRawTokenType, rawTokenType } from '@midnight-ntwrk/compact-runtime';
import { CoinPublicKey, ContractAddress, DomainSeparator } from '@midnight-ntwrk/platform-js';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import { ContractDeploy, ContractState as LedgerContractState } from '@midnightntwrk/ledger-v9';
import { ConfigProvider, Effect, Layer } from 'effect';

import { UnshieldedContract } from '../contract';
import * as Arbitrary from './Arbitrary.js';

const ASSETS_PATH = resolve(import.meta.dirname, '../contract/managed/unshielded');
const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';

const asLedgerContractState = (s: ContractState): LedgerContractState =>
  LedgerContractState.deserialize(s.serialize());
const asContractState = (s: LedgerContractState): ContractState => ContractState.deserialize(s.serialize());

const testLayer = (configMap: Map<string, string>) =>
  Layer.mergeAll(ZKFileConfiguration.layer(ASSETS_PATH), Configuration.layer).pipe(
    Layer.provideMerge(NodeContext.layer),
    Layer.provide(
      Layer.setConfigProvider(ConfigProvider.fromMap(configMap, { pathDelim: '_' }).pipe(ConfigProvider.constantCase))
    )
  );
const runtime = ContractExecutableRuntime.make(testLayer(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]])));

// Make bigint/Uint8Array/Map printable so we can see the real wire shape, and tag the JS
// type of every leaf so the structure is unambiguous when we design decoders.
const replacer = (_k: string, v: unknown) =>
  typeof v === 'bigint'
    ? { __bigint: v.toString() }
    : v instanceof Uint8Array
      ? { __u8: Array.from(v), __len: v.length }
      : v instanceof Map
        ? { __map: Array.from(v.entries()) }
        : v;

// SKIPPED: this is a diagnostic capture harness, not an assertion. It cannot capture live events
// with the bundled toolchain — the managed contracts are compiled with compactc 0.31.0, whose
// standard token library emits no `log` ops, and the `emit` expression is a post-0.31.0 feature
// (see EVENTS_INTEGRATION_PLAN.md §11.3). Re-enable once an emit-capable compactc is wired into the
// test build, to re-confirm the derived intra-`data` field offsets against a live `emit`.
describe.skip('SPIKE events wire shape', () => {
  it('dump events from each unshielded circuit', async () => {
    const program = Effect.gen(function* () {
      const contract = CompiledContract.make<UnshieldedContract>('UnshieldedContract', UnshieldedContract).pipe(
        CompiledContract.withVacantWitnesses,
        CompiledContract.withCompiledFileAssets(ASSETS_PATH),
        ContractExecutable.make
      );
      const init = yield* contract.initialize(undefined);
      const deployment = new ContractDeploy(asLedgerContractState(init.public.contractState));
      const domainSep = Arbitrary.getSampleDomainSeparator();
      const ctx = {
        address: ContractAddress.ContractAddress(deployment.address),
        contractState: asContractState(deployment.initialState),
        privateState: undefined
      };

      const dump: Record<string, unknown> = {};

      const mintToContract = yield* contract.circuit(
        Contract.ProvableCircuitId<UnshieldedContract>('mintUnshieldedToContractTest'),
        ctx,
        DomainSeparator.asBytes(domainSep),
        { bytes: ContractAddress.asBytes(Arbitrary.getSampleContractAddress()) },
        1_000n
      );
      dump.mintUnshieldedToContractTest = mintToContract.events;

      const mintToUser = yield* contract.circuit(
        Contract.ProvableCircuitId<UnshieldedContract>('mintUnshieldedToUserTest'),
        ctx,
        DomainSeparator.asBytes(domainSep),
        { bytes: CoinPublicKey.asBytes(CoinPublicKey.Hex(VALID_COIN_PUBLIC_KEY)) },
        1_000n
      );
      dump.mintUnshieldedToUserTest = mintToUser.events;

      const mintToSelf = yield* contract.circuit(
        Contract.ProvableCircuitId<UnshieldedContract>('mintUnshieldedToSelfTest'),
        ctx,
        DomainSeparator.asBytes(domainSep),
        1_000n
      );
      dump.mintUnshieldedToSelfTest = mintToSelf.events;

      const color = encodeRawTokenType(
        rawTokenType(DomainSeparator.asBytes(domainSep), Arbitrary.getSampleContractAddress())
      );

      const sendToSelf = yield* contract.circuit(
        Contract.ProvableCircuitId<UnshieldedContract>('sendUnshieldedToSelfTest'),
        ctx,
        color,
        1_000n
      );
      dump.sendUnshieldedToSelfTest = sendToSelf.events;

      const receive = yield* contract.circuit(
        Contract.ProvableCircuitId<UnshieldedContract>('receiveUnshieldedTest'),
        ctx,
        color,
        1_000n
      );
      dump.receiveUnshieldedTest = receive.events;

      return dump;
    });

    const dump = await runtime.runPromise(program);

    const out = resolve(import.meta.dirname, 'spike-events-dump.json');
    writeFileSync(out, JSON.stringify(dump, replacer, 2));
    console.log('EVENTS DUMP:\n', JSON.stringify(dump, replacer, 2));
  });
});
