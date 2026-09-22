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

import { CompactRuntime, type ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import type {
  AlignedValue as RuntimeAlignedValue,
  CallProofData as RuntimeCallProofData,
  CircuitContext as RuntimeCircuitContext,
  ContractModuleProvider as RuntimeContractModuleProvider,
  ContractStateProvider as RuntimeContractStateProvider,
  EncodedZswapLocalState as RuntimeEncodedZswapLocalState,
  LogEvent as RuntimeLogEvent,
  Op as RuntimeOp,
  QueryContext as RuntimeQueryContext,
  StateValue as RuntimeStateValue,
  WitnessContext as RuntimeWitnessContext,
  ZswapLocalState as RuntimeZswapLocalState
} from '@midnight-ntwrk/compact-runtime';
import type { Effect } from 'effect';
import { describe, expect, it } from 'tstyche';

/**
 * Type-level coverage for the compact-runtime era seam, the twin of `Ledger.tst.ts`.
 *
 * `CompactRuntime.test.ts` checks the facade at run time, but `Object.keys` cannot see a type-only
 * export and `RuntimeBinding` deliberately does not constrain them either
 * (`internal/runtime/binding.ts`: they are erased at that level). Without this file the facade's
 * type surface is the least-guarded part of the seam: dropping `EncodedZswapLocalState` breaks the
 * CLI's `--input-zswap` path, and dropping `ContractStateProvider` silently changes the public
 * return type of `compact-js-node`'s `FileSystemContractStateProvider.make`.
 */
describe('CompactRuntime facade type surface', () => {
  it('re-exports runtime type-only names as the compact-runtime package\'s own types', () => {
    // Identity, not structural similarity: a binding that substituted a look-alike would pass every
    // run-time check in `CompactRuntime.test.ts` and surface only here.
    expect<CompactRuntime.AlignedValue>().type.toBe<RuntimeAlignedValue>();
    expect<CompactRuntime.CallProofData>().type.toBe<RuntimeCallProofData>();
    expect<CompactRuntime.EncodedZswapLocalState>().type.toBe<RuntimeEncodedZswapLocalState>();
    expect<CompactRuntime.LogEvent>().type.toBe<RuntimeLogEvent>();
    expect<CompactRuntime.Op<string>>().type.toBe<RuntimeOp<string>>();
    expect<CompactRuntime.QueryContext>().type.toBe<RuntimeQueryContext>();
    expect<CompactRuntime.StateValue>().type.toBe<RuntimeStateValue>();
    expect<CompactRuntime.ZswapLocalState>().type.toBe<RuntimeZswapLocalState>();
  });

  it('re-exports the type-only names its dependents name in their own public signatures', () => {
    // `ContractStateProvider` and `ContractModuleProvider` are the return types of `compact-js-node`'s
    // `FileSystemContractStateProvider.make` and `FileSystemContractModuleProvider.make`, and
    // `CircuitContext`/`WitnessContext` are the shapes a contract's witnesses are written against —
    // a drift here is a breaking change downstream.
    expect<CompactRuntime.ContractStateProvider>().type.toBe<RuntimeContractStateProvider>();
    expect<CompactRuntime.ContractModuleProvider>().type.toBe<RuntimeContractModuleProvider>();
    expect<CompactRuntime.CircuitContext<{ readonly count: number }>>().type.toBe<
      RuntimeCircuitContext<{ readonly count: number }>
    >();
    expect<CompactRuntime.WitnessContext<RuntimeStateValue, { readonly count: number }>>().type.toBe<
      RuntimeWitnessContext<RuntimeStateValue, { readonly count: number }>
    >();
  });

  it('exposes the bound runtime line as a literal, not a widened union', () => {
    // The binding writes `as const satisfies RuntimeLine` rather than a `: RuntimeLine`
    // annotation, matching the ledger twin: an annotation widens this to the whole union at every
    // consumer and in the emitted `.d.ts`, foreclosing any compile-time use of the era pairing.
    // Note the two forms coincide while `RuntimeLine` is a singleton, so today this catches the
    // name being dropped or typed `string` but not yet the annotation itself; it separates them
    // the moment a second line is bound, which is the point at which it matters.
    expect<typeof CompactRuntime.line>().type.toBe<'0.19'>();
  });

  it('types the boundary wrapper as failing with ContractRuntimeError', () => {
    // The seam only changes where a binding resolves; this wrapper is what keeps a runtime
    // rejection in the error channel instead of escaping as a defect.
    expect(CompactRuntime.tryRuntime('', () => 1)).type.toBe<
      Effect.Effect<number, ContractRuntimeError.ContractRuntimeError>
    >();
  });

  it('rejects an async thunk rather than succeeding with a pending promise', () => {
    // `Effect.try` does not await, so an async thunk would infer `A = Promise<X>`: the effect
    // *succeeds* carrying a pending promise, the rejection never reaches the error channel, and
    // the caller gets an unhandled rejection. The doctrine is "every boundary call goes through
    // the wrapper", so the next person extending a call to an async API reaches for this function
    // — it has to refuse rather than silently mis-handle it.
    expect(CompactRuntime.tryRuntime('', async () => 1)).type.toRaiseError();
  });
});
