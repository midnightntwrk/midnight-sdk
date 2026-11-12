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

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { NodeContext } from '@effect/platform-node';
import { CompiledContract, ContractExecutable } from '@midnight-ntwrk/compact-js/v8/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import * as LedgerV9 from '@midnightntwrk/ledger-v9';
import { sampleContractAddress } from 'compact-runtime-ledger8';
import { ConfigProvider, Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

/**
 * **A ledger 8 call, re-partitioned under ledger 9** — the case midnight-sdk#400 exists for.
 *
 * @remarks
 * Across a hard-fork window a keep-state call *executes* on the old era and *composes* on the new
 * one: the compiled artifact is pre-fork, the chain head is post-fork. So the partition that came
 * out of the executing era is not the one the chain will accept, and the composing side has to redo
 * it against the target era's `LedgerParameters`. `ContractCallPublic.partitionInputs` exists to
 * make that possible, and until this suite nothing exercised the crossing — the ledger 8 round-trip
 * in `LedgerEightExecutable.test.ts` re-partitions under ledger *8*, which is the era that already
 * did it.
 *
 * What the crossing actually requires, and what each assertion below pins:
 *
 * - `block` and `effects` cross as they are. They are plain data, and the two eras' shapes accept
 *   each other — which is the property that lets compact-js publish them rather than a redone
 *   partition.
 * - `state` does **not**. It is a live onchain-runtime handle, and ledger 9 rejects a foreign one
 *   outright, so it crosses as encoded bytes. That step is asserted to be load-bearing rather than
 *   assumed, because a consumer who skips it gets a WASM type error rather than a wrong answer and
 *   should be able to find out why from here.
 * - `comIndices` goes on through `insertCommitment`, the same way `partitionAllTranscripts` puts it
 *   there.
 *
 * Ledger 9 arrives here as a **direct package import** rather than through `/v9/effect`. This
 * project aliases `@midnight-ntwrk/compact-runtime` at the 0.16 line for every importer (see
 * `vitest.era8.config.ts`), and the v9 entry's runtime binding imports that specifier — so loading
 * the entry here would bind ledger 9 to a 0.16 runtime and fail. A real consumer scopes the
 * redirect to its own era-8 subtree and reaches ledger 9 through the facade as usual; only the
 * *names* differ, since everything crossing below is plain data or bytes.
 */
const ERA8_COUNTER = resolve(import.meta.dirname, '../contract/managed-v8/counter');
const FIXTURE_PRESENT = existsSync(resolve(ERA8_COUNTER, 'contract/index.js'));
const describeWithFixture = FIXTURE_PRESENT ? describe : describe.skip;

const VALID_COIN_PUBLIC_KEY = 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79';

/** The private state the era 8 counter fixture is compiled against. */
type CounterPrivateState = { readonly count: number };

const testLayer = Layer.mergeAll(ZKFileConfiguration.layer(ERA8_COUNTER), Configuration.layer).pipe(
  Layer.provideMerge(NodeContext.layer),
  Layer.provide(
    Layer.setConfigProvider(
      ConfigProvider.fromMap(new Map([['KEYS_COIN_PUBLIC', VALID_COIN_PUBLIC_KEY]]), { pathDelim: '_' }).pipe(
        ConfigProvider.constantCase
      )
    )
  )
);

const loadExecutable = async () => {
  const { Contract } = (await import(resolve(ERA8_COUNTER, 'contract/index.js'))) as {
    Contract: new (witnesses: Record<string, unknown>) => never;
  };
  return CompiledContract.make('Era8Counter', Contract).pipe(
    CompiledContract.withWitnesses({
      private_increment: ({ privateState }: { privateState: CounterPrivateState }) => [
        { count: privateState.count + 1 },
        []
      ]
    } as never),
    CompiledContract.withCompiledFileAssets(ERA8_COUNTER),
    ContractExecutable.make,
    ContractExecutable.provide(testLayer)
  );
};

/** Runs `increment` on the ledger 8 counter and returns its single call. */
const executeOnLedgerEight = async () => {
  const executable = await loadExecutable();
  const deployed = await Effect.runPromise(executable.initialize({ count: 0 }));
  const address = ContractAddress.ContractAddress(sampleContractAddress());
  const result = await Effect.runPromise(
    executable.circuit('increment', {
      address,
      contractState: deployed.public.contractState,
      privateState: deployed.private.privateState
    })
  );
  return { address, call: result.calls[0]! };
};

describeWithFixture('a ledger 8 call composed under ledger 9', () => {
  it('re-partitions under the target era from the inputs the call reported', async () => {
    const { address, call } = await executeOnLedgerEight();
    const inputs = call.public.partitionInputs;

    // The state crosses as bytes. `decode` is ledger 9's, so what comes back is a ledger 9 value
    // built from a ledger 8 one — the keep-state premise, stated as an assertion.
    const state = LedgerV9.StateValue.decode(inputs.state.encode() as never);
    const queryContext = new LedgerV9.QueryContext(new LedgerV9.ChargedState(state), address);

    // These two do not need encoding: plain data on both eras, and ledger 9's setters accept the
    // shapes ledger 8's runtime produced.
    queryContext.block = inputs.block as never;
    queryContext.effects = inputs.effects as never;
    const withCommitments = [...inputs.comIndices].reduce(
      (context, [commitment, index]) => context.insertCommitment(commitment as never, index as never),
      queryContext
    );

    // Ledger 9's partitioner, ledger 9's parameters, a ledger 8 call. This is the operation #400
    // asked to be made possible.
    const [rebuilt] = LedgerV9.partitionTranscripts(
      [new LedgerV9.PreTranscript(withCommitments, call.public.publicTranscript as never)],
      LedgerV9.LedgerParameters.initialParameters()
    );

    // Recombined before anything else, so the assertion cannot pass vacuously on two empty halves:
    // whatever ledger 9 produced has to account for the whole transcript it was given.
    expect([...(rebuilt?.[0]?.program ?? []), ...(rebuilt?.[1]?.program ?? [])]).toEqual(call.public.publicTranscript);
    // And it was really charged, rather than handed back unpartitioned.
    expect(rebuilt?.[0]?.gas).toBeDefined();
  });

  it('requires the state to be encoded across, not handed across', async () => {
    const { call } = await executeOnLedgerEight();

    // The reason `partitionInputs.state` is documented as a live handle. Ledger 9 rejects an
    // onchain-runtime value outright, so the failure is loud — unlike passing the *wrong* state,
    // which is silent and is what the provenance tests exist for.
    expect(() => new LedgerV9.ChargedState(call.public.partitionInputs.state as never)).toThrow();
  });

  it('carries a block and effects ledger 9 accepts unchanged', async () => {
    const { address, call } = await executeOnLedgerEight();
    const inputs = call.public.partitionInputs;
    const queryContext = new LedgerV9.QueryContext(
      new LedgerV9.ChargedState(LedgerV9.StateValue.decode(inputs.state.encode() as never)),
      address
    );

    // Asserted separately from the round-trip above because this is the property that makes
    // publishing plain data sufficient: if a future era's `CallContext` or `Effects` gained a
    // required member the older era does not produce, these setters would reject and #400's
    // approach would need revisiting rather than just a wider type.
    expect(() => {
      queryContext.block = inputs.block as never;
    }).not.toThrow();
    expect(() => {
      queryContext.effects = inputs.effects as never;
    }).not.toThrow();
  });
});
