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

import { type Contract } from '@midnight-ntwrk/compact-js/effect';
import type * as Era9Runtime from '@midnight-ntwrk/compact-runtime';
import type * as Era8Runtime from 'compact-runtime-ledger8';
import { describe, expect, it } from 'tstyche';

 

/**
 * The **era-free contract spine** (midnight-sdk#387/#388).
 *
 * @remarks
 * `Contract.ts` describes the shape `compactc` generates: witnesses, circuits, `initialState`. Those
 * signatures are written in terms of the compact-runtime types — and two of them, `CircuitContext`
 * and `CircuitResults`, are exactly the ones that change between runtime lines. 0.16 hands a
 * circuit a flat context (`currentPrivateState`, `currentQueryContext`, `currentZswapLocalState`)
 * and returns `proofData` alongside the result; 0.19 hands it a call tree (`callContext`,
 * `queryContexts`, `callProofDataTrace`, `events`) and keeps the proof data on the context. The two
 * share no field, so neither is assignable to the other in either direction.
 *
 * While the spine named the *bound* era's versions of those types, a contract compiled for the
 * other era did not satisfy `Contract<PS>` — which is to say `/v8/effect` handed back a
 * ledger-9-typed spine, and a ledger 8 consumer could not call `CompiledContract.make` at all. The
 * era is a property of the *executable* (which binding partitions transcripts, converts states and
 * signs maintenance updates), not of the contract description, so the spine is stated era-free and
 * both eras' contracts satisfy it.
 *
 * The era 8 shapes are taken from `compact-runtime-ledger8` directly rather than from the compiled
 * `managed-v8/` fixture, because a generated artifact's own `.d.ts` imports
 * `@midnight-ntwrk/compact-runtime` by bare specifier: in this test program that resolves to 0.19,
 * so the fixture would be typed against the wrong line and prove nothing. Tests are exempt from the
 * seam's `no-restricted-imports` rule for this reason.
 */

type PrivateState = { readonly count: bigint };

/** A contract as `compactc` generates it for the ledger 9 / runtime 0.19 pair. */
type Era9Contract = {
  witnesses: {
    localSecretKey(context: Era9Runtime.WitnessContext<unknown, PrivateState>): [PrivateState, Uint8Array];
  };
  circuits: {
    increment(
      context: Era9Runtime.CircuitContext<PrivateState>,
      amount: bigint
    ): Promise<Era9Runtime.CircuitResults<PrivateState, bigint>>;
  };
  provableCircuits: {
    increment(
      context: Era9Runtime.CircuitContext<PrivateState>,
      amount: bigint
    ): Promise<Era9Runtime.CircuitResults<PrivateState, bigint>>;
  };
  initialState(
    context: Era9Runtime.ConstructorContext<PrivateState>,
    seed: Uint8Array
  ): Promise<Era9Runtime.ConstructorResult<PrivateState>>;
};

/** The same contract as `compactc` generates it for the ledger 8 / runtime 0.16 pair. */
type Era8Contract = {
  witnesses: {
    localSecretKey(context: Era8Runtime.WitnessContext<unknown, PrivateState>): [PrivateState, Uint8Array];
  };
  circuits: {
    increment(
      context: Era8Runtime.CircuitContext<PrivateState>,
      amount: bigint
    ): Promise<Era8Runtime.CircuitResults<PrivateState, bigint>>;
  };
  provableCircuits: {
    increment(
      context: Era8Runtime.CircuitContext<PrivateState>,
      amount: bigint
    ): Promise<Era8Runtime.CircuitResults<PrivateState, bigint>>;
  };
  initialState(
    context: Era8Runtime.ConstructorContext<PrivateState>,
    seed: Uint8Array
  ): Promise<Era8Runtime.ConstructorResult<PrivateState>>;
};

describe('the contract spine', () => {
  it('accepts a contract compiled for the ledger 9 era', () => {
    expect<Era9Contract>().type.toBeAssignableTo<Contract.Contract<PrivateState>>();
  });

  it('accepts a contract compiled for the ledger 8 era', () => {
    // Red before the spine was era-free: 0.16's flat `CircuitContext` is not assignable to 0.19's
    // call-tree one in either direction, and `CircuitResults.context` carries the same split.
    expect<Era8Contract>().type.toBeAssignableTo<Contract.Contract<PrivateState>>();
  });

  it('rejects an object that is not a contract at all', () => {
    // The spine stays a constraint, not a rubber stamp: era-freedom is achieved by not naming the
    // era-varying shapes, not by accepting anything.
    expect<{ witnesses: object; circuits: object }>().type.not.toBeAssignableTo<Contract.Contract<PrivateState>>();
  });
});

describe('the contract spine — inference', () => {
  it('recovers the private state from either era', () => {
    expect<Contract.Contract.PrivateState<Era9Contract>>().type.toBe<PrivateState>();
    expect<Contract.Contract.PrivateState<Era8Contract>>().type.toBe<PrivateState>();
  });

  it('recovers a circuit\'s arguments from either era', () => {
    // `CircuitParameters` drops the leading context and keeps the rest; it is what the CLI and
    // `ContractExecutable.circuit` type their arguments by, so it has to survive the era split.
    expect<Contract.Contract.CircuitParameters<Era9Contract, 'increment'>>().type.toBe<[bigint]>();
    expect<Contract.Contract.CircuitParameters<Era8Contract, 'increment'>>().type.toBe<[bigint]>();
  });

  it('recovers a circuit\'s result type from either era', () => {
    expect<Contract.Contract.CircuitReturnType<Era9Contract, 'increment'>>().type.toBe<bigint>();
    expect<Contract.Contract.CircuitReturnType<Era8Contract, 'increment'>>().type.toBe<bigint>();
  });

  it('recovers the constructor arguments from either era', () => {
    expect<Contract.Contract.InitializeParameters<Era9Contract>>().type.toBe<[Uint8Array]>();
    expect<Contract.Contract.InitializeParameters<Era8Contract>>().type.toBe<[Uint8Array]>();
  });
});
