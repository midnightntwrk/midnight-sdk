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

import type * as V8Entry from '@midnight-ntwrk/compact-js/v8/effect';
import type * as V9Entry from '@midnight-ntwrk/compact-js/v9/effect';
import type { ContractState as LedgerV8ContractState } from '@midnightntwrk/ledger-v8';
import type { ContractState as LedgerV9ContractState } from '@midnightntwrk/ledger-v9';
import { describe, expect, it } from 'tstyche';

import type * as V0_19 from '../../../src/effect/internal/runtime/v0_19.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * **The executable's types follow the era it was given**, not the era the build bound.
 *
 * @remarks
 * `internal/executable.ts` derives every era-varying type in its public API from the two binding
 * arguments, rather than declaring a type surface per era. The whole point of deriving is that
 * nothing has to be kept in step — but that only holds if the derivation actually *lands* on the
 * right types, and a derivation that silently collapses to `never` or widens to `unknown` still
 * compiles. (One did: the cross-contract state provider resolved to `never` on ledger 9 in the
 * first draft, which would have made every cross-contract call in the CLI unconstructable. The
 * CLI's own build caught it; these assertions catch it here, where the cause is.)
 *
 * Read as a pair, the two eras' entries state what #388 asks for: the same public API, with the
 * members an older era cannot support absent rather than present and failing.
 */
type MaintenanceUpdateOf<E> = E extends {
  ContractExecutable: { make: (...args: any) => { replaceContractMaintenanceAuthority: (...args: any) => any } };
}
  ? E
  : never;

describe('the era-pinned executables', () => {
  it('types the contract state as its own era ledger sees it', () => {
    // A ledger 8 contract state is what `/v8`'s executable takes, and a ledger 9 one is what
    // `/v9`'s takes. Before the executable took its bindings as arguments both entries said
    // "ledger 9", because both resolved the same module.
    expect<V8Entry.ContractExecutable.ContractExecutable.ContractContext['contractState']>().type.not.toBe<
      V9Entry.ContractExecutable.ContractExecutable.ContractContext['contractState']
    >();
  });

  it('offers a cross-contract state provider on ledger 9 only', () => {
    // The capability gate, expressed in the type rather than in a runtime check. On 0.16 the
    // provider type derives to `never`, so the branch of `CircuitContext` that carries one cannot
    // be constructed at all; on 0.19 it is a real type.
    // `CircuitContext` is a union: one branch carries neither a provider nor a parent block hash,
    // the other carries both. The capability lives in the second branch, so that is what to read —
    // asserting against the whole union would pass on either era via the first branch.
    type ProviderBranch<C> = Extract<C, { parentBlockHash: string }> extends { stateProvider: infer P } ? P : never;

    expect<ProviderBranch<V8Entry.ContractExecutable.ContractExecutable.CircuitContext<unknown>>>().type.toBe<never>();
    expect<
      ProviderBranch<V9Entry.ContractExecutable.ContractExecutable.CircuitContext<unknown>>
    >().type.not.toBe<never>();
  });

  it('keeps each era\'s maintenance update on its own ledger', () => {
    expect<V8Entry.ContractExecutable.ContractExecutable.MaintenanceResult['public']['maintenanceUpdate']>().type.not.toBe<
      V9Entry.ContractExecutable.ContractExecutable.MaintenanceResult['public']['maintenanceUpdate']
    >();
  });

  it('converts to the ledger package its era names', () => {
    // Anchored on the ledger packages themselves rather than on each other, so this stays red if
    // both entries drifted onto one era together.
    //
    // An earlier assertion here read `Awaited<ReturnType<…contractStateFromBytes>> extends never`
    // and could not fail: `Effect` is not `PromiseLike`, so `Awaited<Effect<A, E, R>>` is the
    // `Effect` itself and is never `never`. The two below do the work it was meant to.
    expect<ReturnType<typeof V8Entry.Ledger.fromRuntimeContractState>>().type.not.toBe<
      ReturnType<typeof V9Entry.Ledger.fromRuntimeContractState>
    >();
    expect<LedgerV8ContractState>().type.not.toBe<LedgerV9ContractState>();
  });

  it('decodes its own era\'s events, and does not lose their type', () => {
    // `ContractLog` used to take `LogEvent` from `effect/CompactRuntime.ts`, which resolves
    // `internal/runtime/current.ts` — the one era-varying type on this entry that was not derived
    // from a binding argument. Repointing `current.ts` at a later line would have left
    // `ContractExecutable.CallResult.events` correctly on 0.19 while `ContractLog` decoded against
    // the new line: wrong precisely in a fork window, which is what an era-pinned entry is for.
    //
    // It is now era-*free* — the structural minimum the decoder reads — so it cannot follow a
    // swap at all. These assert the two properties that replace that coupling.

    // This entry's own events still fit the decoder. (`internal/runtime/conformance.ts` asserts the
    // same for the binding; here it is stated at the entry a consumer actually imports.)
    expect<V0_19.LogEvent>().type.toBeAssignableTo<V9Entry.ContractLog.LogEvent>();

    // And era precision survives decoding: `decode` is generic in the event it is given, so `raw`
    // comes back as the 0.19 event that went in rather than widened to the structural minimum.
    expect<ReturnType<typeof V9Entry.ContractLog.decode<V0_19.LogEvent>>['raw']>().type.toBe<V0_19.LogEvent>();
  });

  it('derives each call\'s partition inputs from its own era\'s query context', () => {
    // midnight-sdk#400. The failure mode here is silent: `block`, `effects` and `comIndices` are
    // derived by conditional types off the trace entry's query context, and a derivation that
    // misses resolves to `never` — which is assignable to everything, so the member would compile
    // clean at every call site and simply be unusable. Nothing else would catch that.
    expect<V8Entry.ContractExecutable.ContractExecutable.ContractCallPublic['block']>().type.not.toBe<never>();
    expect<V8Entry.ContractExecutable.ContractExecutable.ContractCallPublic['effects']>().type.not.toBe<never>();
    expect<V8Entry.ContractExecutable.ContractExecutable.ContractCallPublic['comIndices']>().type.not.toBe<never>();
    expect<V9Entry.ContractExecutable.ContractExecutable.ContractCallPublic['block']>().type.not.toBe<never>();
    expect<V9Entry.ContractExecutable.ContractExecutable.ContractCallPublic['effects']>().type.not.toBe<never>();
    expect<V9Entry.ContractExecutable.ContractExecutable.ContractCallPublic['comIndices']>().type.not.toBe<never>();
  });

  it('lets a consumer name the partition inputs it was handed', () => {
    // The other half of #400 (its addendum): exposing values a consumer cannot *name* leaves them
    // importing the era package around the seam, which is what the facade exists to prevent. These
    // tie each exposed member to the facade name for it, so adding the member without the type —
    // or letting the two drift onto different declarations — fails here.
    expect<V8Entry.ContractExecutable.ContractExecutable.ContractCallPublic['block']>().type.toBe<
      V8Entry.CompactRuntime.CallContext
    >();
    expect<V8Entry.ContractExecutable.ContractExecutable.ContractCallPublic['effects']>().type.toBe<
      V8Entry.CompactRuntime.Effects
    >();
    expect<V9Entry.ContractExecutable.ContractExecutable.ContractCallPublic['block']>().type.toBe<
      V9Entry.CompactRuntime.CallContext
    >();
    expect<V9Entry.ContractExecutable.ContractExecutable.ContractCallPublic['effects']>().type.toBe<
      V9Entry.CompactRuntime.Effects
    >();
    // `comIndices` is keyed by the era's own `CoinCommitment`, so naming the map needs that too.
    expect<V9Entry.ContractExecutable.ContractExecutable.ContractCallPublic['comIndices']>().type.toBe<
      Map<V9Entry.CompactRuntime.CoinCommitment, bigint>
    >();
  });

  it('exposes the maintenance surface on both eras', () => {
    // The other half of #388's requirement: what an older era *can* do is present, with the same
    // shape. `MaintenanceUpdateOf` resolves to the entry itself when the operation is there.
    expect<MaintenanceUpdateOf<typeof V8Entry>>().type.not.toBe<never>();
    expect<MaintenanceUpdateOf<typeof V9Entry>>().type.not.toBe<never>();
  });
});
