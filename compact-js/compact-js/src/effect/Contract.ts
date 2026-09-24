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

/**
 * Provides types and utilities for working directly with Compact generated contract executables.
 *
 * @module
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Brand } from 'effect';

/**
 * The context a Compact witness receives.
 *
 * @remarks
 * Declared here rather than re-exported from the {@link CompactRuntime} seam, and stated exactly:
 * compact-runtime 0.16 and 0.19 declare this identically (`ContractAddress` is `string` on both
 * onchain-runtime majors), so naming the shape costs no precision and keeps this module off the
 * seam — see the note on {@link Contract}.
 */
export interface WitnessContext<L, PS> {
  readonly ledger: L;
  readonly privateState: PS;
  readonly contractAddress: string;
}

/**
 * The context a Compact circuit receives — deliberately opaque.
 *
 * @remarks
 * This is the one shape that genuinely differs between runtime lines: 0.16 passes a flat, single
 * contract frame (`currentPrivateState`, `currentQueryContext`, `currentZswapLocalState`) and 0.19
 * passes a call tree (`callContext`, `queryContexts`, `callProofDataTrace`, `events`). The two
 * share no member, so no structural type describes both, and naming either one pins the spine to
 * an era.
 *
 * It is a *parameter* type, so `any` rather than `unknown`: parameters are contravariant, and a
 * circuit that accepts its own line's context must remain assignable to this signature. `unknown`
 * would reject every real contract. Nothing in compact-js reads a circuit context through this
 * type — the executable builds one through its era's `createExecutionContext` and hands it straight
 * back to the circuit — so the looseness is confined to the description of a value this package
 * only ever passes through.
 */
export type CircuitContext = any;

/**
 * What a Compact circuit resolves to, as much of it as is era-free.
 *
 * @remarks
 * A *return* type, so it is stated as the structural minimum both lines satisfy rather than as
 * `any`: `result` is the value callers actually want, and returning it is what makes
 * {@link Contract.CircuitReturnType} work on either era. The rest of the era's results object
 * (0.16's `proofData`, both lines' `context` and `gasCost`) is intentionally not described here —
 * it is read by the era's `readExecution`, which is typed against the binding that produced it.
 */
export interface CircuitResults<U> {
  readonly result: U;
}

/**
 * What a Compact contract's constructor resolves to, as much of it as is era-free.
 *
 * @remarks
 * `currentPrivateState` is named because it is the only anchor that keeps `PS` inferable from a
 * contract with no witnesses; the contract state and Zswap local state it sits beside are era
 * types, so they are left to the executable's binding.
 */
export interface ConstructorResult<PS> {
  readonly currentPrivateState: PS;
}

/**
 * A value, or a promise of one.
 *
 * @remarks
 * The second thing about a compiled contract that varies by era, alongside the circuit context.
 * compactc 0.31.1 (Compact 0.23, the ledger 8 / runtime 0.16 pairing) generates **synchronous**
 * circuits and `initialState`; 0.34 generates `Promise`-returning ones. Diff the two `.d.ts` files
 * a single `counter.compact` produces — `test/contract/managed-v8/counter/contract/index.d.ts`
 * against `test/contract/managed/counter/contract/index.d.ts` — and that is the entire difference.
 *
 * So the spine says "settles to", not "resolves to". Naming `Promise` here is what previously kept
 * a real ledger 8 artifact from satisfying `Contract<PS>` at all — `Witnesses<C>` collapsed to
 * `never` and `CompiledContract.make` was uncallable — even after the era-varying *types* were
 * removed. Reading a result through the union costs nothing: everything in compact-js that calls a
 * circuit or the constructor already `await`s it, and `await` on a non-promise is the value.
 */
export type Awaitable<A> = A | Promise<A>;

export type Witness<PS, U = any> = (context: WitnessContext<U, PS>, ...args: any[]) => [PS, U];
export type Witnesses<PS> = Record<string, Witness<PS>>;

export type Circuit<U = any> = (context: CircuitContext, ...args: any[]) => Awaitable<CircuitResults<U>>;
export type Circuits = Record<string, Circuit>;

export type ProvableCircuit<U = any> = (context: CircuitContext, ...args: any[]) => Awaitable<CircuitResults<U>>;
export type ProvableCircuits = Record<string, ProvableCircuit>;

export type VerifierKey = Uint8Array & Brand.Brand<'VerifierKey'>;
export const VerifierKey = Brand.nominal<VerifierKey>();

export type ZKIR = Uint8Array & Brand.Brand<'ZKIR'>;
export const ZKIR = Brand.nominal<ZKIR>();

/**
 * A circuit id, branded, optionally narrowed to the one circuit it names. `K` is constrained
 * because {@link Contract.CircuitParameters} and {@link Contract.CircuitReturnType} index by it —
 * left open, a mistyped name is well-formed here and fails only downstream. The brand tag omits
 * `C`: it marks circuit ids, not which contract they came from.
 */
export type ProvableCircuitId<
  C extends Contract.Any = Contract.Any,
  K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>
> = K & Brand.Brand<'ProvableCircuitId'>;
const ProvableCircuitId_ = Brand.nominal<ProvableCircuitId>();

/**
 * Brands a circuit id, optionally narrowed to the single circuit it names.
 *
 * @remarks
 * `K` is what decides how precisely {@link Contract.CircuitParameters} and
 * {@link Contract.CircuitReturnType} can read the call downstream, and it is second because
 * TypeScript infers *all* of a call's type arguments or none of them: naming `C` alone — the
 * spelling everything here uses — leaves `K` on its default, the union of every circuit `C`
 * declares, and the argument tuple resolves to a union over all of them. That is enough to reject
 * arguments no circuit takes, and not enough to reject one circuit's arguments passed to another.
 *
 * Naming both (`ProvableCircuitId<Counter, 'decrement'>('decrement')`) narrows the brand to the one
 * literal and the arguments with it. It is opt-in because there is no third spelling: `C` cannot be
 * inferred (no value carries it), and once `C` is written explicitly `K` can only come from being
 * written too.
 */
export const ProvableCircuitId = <
  C extends Contract.Any,
  K extends Contract.ProvableCircuitId<C> = Contract.ProvableCircuitId<C>
>(
  id: K
): ProvableCircuitId<C, K> =>
  // The nominal constructor is built once, at the widest instantiation, so it hands back the brand
  // over `string`; the cast re-states the literal the caller already passed.
  ProvableCircuitId_(id) as ProvableCircuitId<C, K>;

/**
 * The shape of a contract executable, as `compactc` generates it.
 *
 * @remarks
 * Stated **era-free**: nothing in this module reaches the {@link CompactRuntime} or {@link Ledger}
 * seams, so one description covers a contract compiled for any ledger era compact-js binds, and the
 * era-pinned entries (`/v8/effect`, `/v9/effect`) hand back the same type rather than each other's.
 *
 * That is not a loosening for its own sake. The era is a property of the *executable* — which
 * binding builds the circuit context, partitions transcripts, converts states and signs maintenance
 * updates — not of the contract description, and a compiled artifact's own `.d.ts` imports
 * `@midnight-ntwrk/compact-runtime` by bare specifier, so its era is decided by how that resolves
 * where the artifact lives and not by which compact-js entry the application imported. A spine that
 * named one line's `CircuitContext` could only ever agree with contracts compiled for that line
 * (midnight-sdk#387/#388). `test/typetests/effect/Contract.tst.ts` pins both eras against this
 * type.
 */
export interface Contract<PS, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;

  circuits: Circuits;
  provableCircuits: ProvableCircuits;

  initialState(context: any, ...args: any[]): Awaitable<ConstructorResult<PS>>;
}

export declare namespace Contract {
  export type Any = Contract<any>;

  export type PrivateState<C> = C extends Contract<infer PS> ? PS : never;

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Witnesses<C> = C extends Contract<any, infer W> ? (keyof W extends never ? never : W) : never;

  // The leading element is matched as `any` rather than by name: it is the era's constructor
  // context, and the point here is only to drop it and keep what follows.
  export type InitializeParameters<C extends Contract<any>> =
    Parameters<C['initialState']> extends [any, ...infer A] ? A : never;

  export type ProvableCircuitId<C extends Contract<any>> = keyof C['provableCircuits'] & string;

  /**
   * A circuit id with the {@link ProvableCircuitId} brand taken back off, for use as an index.
   *
   * @remarks
   * Every key that reaches {@link CircuitParameters} or {@link CircuitReturnType} through the public
   * API is branded — `ProvableCircuitId()` and `getProvableCircuitIds()` return nothing else, and
   * `ContractExecutable.circuit` constrains its key parameter to them — and a brand is an
   * *intersection*, so `provableCircuits['increment' & Brand<'ProvableCircuitId'>]` does not resolve
   * to the declared method the way `provableCircuits['increment']` does. Both helpers used to index
   * with the key as given and so collapsed on exactly the keys the documented API produces:
   * arguments to `unknown[]` and results to `unknown`, on every era, since this spine is era-free
   * and both `/v8/effect` and `/v9/effect` re-export it (midnight-sdk#402).
   *
   * Stripping restores the plain literal. Two other spellings do not, and are recorded here so they
   * are not retried: template-literal inference (``K extends `${infer S}` ? S : never``) and
   * `keyof C['provableCircuits'] & K` both leave the collapse in place.
   */
  type CircuitKey<K> = Brand.Brand.Unbranded<K & Brand.Brand<'ProvableCircuitId'>>;

  export type CircuitParameters<C extends Contract<any>, K extends ProvableCircuitId<C>> =
    Parameters<C['provableCircuits'][CircuitKey<K>]> extends [any, ...infer A] ? A : never;

  export type CircuitReturnType<C extends Contract<any>, K extends ProvableCircuitId<C>> =
    Awaited<ReturnType<C['provableCircuits'][CircuitKey<K>]>> extends CircuitResults<infer U> ? U : never;
}

export const getProvableCircuitIds: <C extends Contract.Any>(contract: C) => ProvableCircuitId<C>[] = (contract) =>
  Object.keys(contract.provableCircuits).map(ProvableCircuitId);
