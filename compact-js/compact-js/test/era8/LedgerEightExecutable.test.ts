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
import { CompiledContract, ContractExecutable, Ledger } from '@midnight-ntwrk/compact-js/v8/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import { sampleContractAddress } from 'compact-runtime-ledger8';
import { ConfigProvider, Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

/**
 * **A ledger 8 contract, executed through `/v8/effect`** — the deliverable behind
 * midnight-sdk#387/#388, and the thing a consumer (midnight-js included) actually needs: one
 * installed compact-js, an era chosen at the import, a contract compiled for that era running
 * end to end.
 *
 * @remarks
 * `LedgerEightExecution.test.ts` proves the *runtime line* works by driving a compiled artifact
 * directly. This suite goes through the public entry instead, so it covers the part that used to be
 * missing: `ContractExecutable` was written against the facades, resolved whichever era `current.ts`
 * bound, and was therefore withheld from `/v8/effect` entirely. It is now `internal/executable.ts`
 * applied to the ledger 8 pair, and what follows is that application doing real work — verifier keys
 * read and installed, a maintenance authority sampled through the 0.16 line's untagged signing key,
 * a circuit run, its transcript partitioned by ledger 8's partitioner.
 *
 * The suite runs in the era 8 vitest project, whose alias points `@midnight-ntwrk/compact-runtime`
 * at the 0.16 line — the same resolution scope a consumer gives their ledger 8 artifacts, and the
 * one thing compact-js cannot do for them (a generated artifact imports that specifier itself).
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

// Loaded dynamically: the fixture is generated rather than committed, so a static import would be a
// resolution error in a tree that has not run `yarn compact-v8` yet.
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

describeWithFixture('a ledger 8 contract through the `/v8/effect` executable', () => {
  it('is the ledger 8 era, not the era the build binds', () => {
    expect(Ledger.era.ledger).toBe(8);
    expect(Ledger.era.runtime).toBe('0.16');
  });

  it('initializes a deployable contract state', async () => {
    const executable = await loadExecutable();
    const result = await Effect.runPromise(executable.initialize({ count: 0 }));

    // A real deploy result: a ledger 8 contract state carrying the verifier keys this executable
    // read from the era 8 assets, and the CMA it sampled through the 0.16 line.
    expect(result.public.contractState).toBeDefined();
    expect(result.private.privateState).toMatchObject({ count: 0 });
    // Sampled via `makeSampleSigningKey`/`signingKeyHex`: onchain-runtime-v3 has no scheme concept
    // and hands back a bare hex string, so reading `.value` off the runtime call — which is what
    // the executable did before the seam absorbed it — would have failed here.
    expect(result.private.signingKey.tag).toBe(Ledger.era.defaultCmaSignatureKind);
    expect(result.private.signingKey.value).toMatch(/^[0-9a-f]+$/);
  });

  it('converts its deploy result through the ledger 8 conversions', async () => {
    const executable = await loadExecutable();
    const result = await Effect.runPromise(executable.initialize({ count: 0 }));
    const ledgerState = await Effect.runPromise(Ledger.fromRuntimeContractState(result.public.contractState));

    // The entry's own `Ledger`, not the bound one: an era-8 runtime state crossing into an era-8
    // ledger state. Against the ledger 9 facade this throws inside WASM.
    expect(ledgerState).toBeInstanceOf(Ledger.ContractState);
  });

  it('runs a circuit and reports the root call', async () => {
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

    // One call, because ledger 8 has no cross-contract calls at all — the trace the 0.16 binding
    // synthesises from its flat frame is complete by construction.
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.circuitId).toBe('increment');
    expect(result.calls[0]?.contractAddress).toBe(address);
    // Partitioned by ledger 8's own partitioner, through the era 8 pre-transcripts.
    expect(result.calls[0]?.public.partitionedTranscript).toHaveLength(2);
    expect(result.calls[0]?.public.publicTranscript.length).toBeGreaterThan(0);
    // The witness ran: the private state came back incremented by the executable's own witness call.
    expect(result.privateState).toMatchObject({ count: 1 });
  });

  it('exposes the inputs its transcript was partitioned from', async () => {
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

    // midnight-sdk#400: the values needed to rebuild this call's pre-transcript in a *different*
    // ledger era. Present on ledger 8 for the same reason as on ledger 9 — every era carries them
    // on its query context — so this is era-neutral surface rather than an era-gated capability
    // like contract events.
    const call = result.calls[0]!;
    expect(call.public.partitionInputs.block.ownAddress).toBe(address);
    expect(typeof call.public.partitionInputs.block.secondsSinceEpoch).toBe('bigint');
    expect(Array.isArray(call.public.partitionInputs.effects.claimedNullifiers)).toBe(true);
    expect(call.public.partitionInputs.comIndices).toBeInstanceOf(Map);
    // Plain data, unlike the two state members (live WASM handles) — which is what lets these
    // cross an era seam at all.
    expect(() => structuredClone(call.public.partitionInputs.block)).not.toThrow();
    expect(() => structuredClone(call.public.partitionInputs.effects)).not.toThrow();
    // The state the call ran against is genuinely the pre-execution one: the counter holds an
    // empty cell before `increment` and a `01` cell after, so these two stringify differently.
    // An `initialContractState` wired to the final context would make them equal.
    expect(String(call.public.partitionInputs.state)).not.toBe(String(call.public.contractState));
  });

  it('re-partitions to the same transcript from the exposed inputs alone', async () => {
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
    const call = result.calls[0]!;

    // midnight-sdk#400's actual use case, done entirely through the public entry and entirely from
    // the call result: rebuild the pre-transcript from the exposed values and re-run the
    // partitioner. "From the exposed inputs alone" is the load-bearing part — every input below
    // comes off `call.public`, including the pre-execution state, which used to have to be
    // snapshotted from outside the result before the circuit ran.
    //
    // What this does *not* prove is that each input is read from the right context. The counter's
    // partition is insensitive to all four — it inserts no commitments, and its state does not
    // change size, so substituting the post-execution state reproduces this assertion exactly.
    // `ContractExecutable.partitionInputs.test.ts` is what pins provenance; this pins usability.
    //
    // Encoded across rather than handed across: `initialContractState` is a live onchain-runtime
    // handle, and the ledger rejects a foreign one outright (`expected instance of StateValue`).
    // Encoding is the step a consumer crossing an era boundary takes anyway.
    const initialState = Ledger.StateValue.decode(call.public.partitionInputs.state.encode());
    const queryContext = new Ledger.QueryContext(new Ledger.ChargedState(initialState), address);
    queryContext.block = call.public.partitionInputs.block;
    queryContext.effects = call.public.partitionInputs.effects;
    const withCommitments = [...call.public.partitionInputs.comIndices].reduce(
      (context, [commitment, index]) => context.insertCommitment(commitment, index),
      queryContext
    );

    const [rebuilt] = Ledger.partitionTranscripts(
      [new Ledger.PreTranscript(withCommitments, call.public.publicTranscript)],
      Ledger.LedgerParameters.initialParameters()
    );

    // Recombined first, so neither assertion can pass vacuously on two undefined halves: the
    // rebuilt partition has to account for the whole transcript before matching the original.
    expect([...(rebuilt?.[0]?.program ?? []), ...(rebuilt?.[1]?.program ?? [])]).toEqual(call.public.publicTranscript);
    expect(rebuilt?.[0]?.program).toEqual(call.public.partitionedTranscript[0]?.program);
    expect(rebuilt?.[1]?.program).toEqual(call.public.partitionedTranscript[1]?.program);
  });

  it('emits no events on an era that cannot emit them', async () => {
    const executable = await loadExecutable();
    const deployed = await Effect.runPromise(executable.initialize({ count: 0 }));

    const result = await Effect.runPromise(
      executable.circuit('increment', {
        address: ContractAddress.ContractAddress(sampleContractAddress()),
        contractState: deployed.public.contractState,
        privateState: deployed.private.privateState
      })
    );

    // Statically `never[]` — the 0.16 binding's `readExecution` instantiates the event type as
    // `never` — so this asserts at run time what the types already forbid at compile time.
    expect(result.events).toEqual([]);
  });
});
