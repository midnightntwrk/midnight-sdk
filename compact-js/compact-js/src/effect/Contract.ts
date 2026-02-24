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

import type {
  CircuitContext,
  CircuitResults,
  ConstructorContext,
  ConstructorResult,
  WitnessContext} from '@midnight-ntwrk/compact-runtime';
import { Brand } from 'effect';

export type Witness<PS, U = any> = (context: WitnessContext<U, PS>, ...args: any[]) => [PS, U];
export type Witnesses<PS> = Record<string, Witness<PS>>;

export type Circuit<PS, U = any> = (context: CircuitContext<PS>, ...args: any[]) => CircuitResults<PS, U>;
export type Circuits<PS> = Record<string, Circuit<PS>>;

export type ProvableCircuit<PS, U = any> = (context: CircuitContext<PS>, ...args: any[]) => CircuitResults<PS, U>;
export type ProvableCircuits<PS> = Record<string, ProvableCircuit<PS>>;

export type VerifierKey = Uint8Array & Brand.Brand<'VerifierKey'>;
export const VerifierKey = Brand.nominal<VerifierKey>();

export type ZKIR = Uint8Array & Brand.Brand<'ZKIR'>;
export const ZKIR = Brand.nominal<ZKIR>();

export type ProvableCircuitId<C extends Contract.Any = Contract.Any, K = Contract.ProvableCircuitId<C>> = K &
  Brand.Brand<'ProvableCircuitId'>;
const ProvableCircuitId_ = Brand.nominal<ProvableCircuitId>();
export const ProvableCircuitId = <C extends Contract.Any>(
  id: Brand.Brand.Unbranded<ProvableCircuitId<C>>
): ProvableCircuitId<C> => ProvableCircuitId_(id);

export interface Contract<PS, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;

  circuits: Circuits<PS>;
  provableCircuits: ProvableCircuits<PS>;

  initialState(context: ConstructorContext<PS>, ...args: any[]): ConstructorResult<PS>;
}

export declare namespace Contract {
  export type Any = Contract<any>;

  export type PrivateState<C> = C extends Contract<infer PS>
    ? PS
    : never;

  // eslint-disable-next-line @typescript-eslint/no-shadow
  export type Witnesses<C> = C extends Contract<any, infer W>
    ? keyof W extends never
        ? never 
        : W
    : never;

  export type InitializeParameters<C extends Contract<any>> =
    Parameters<C['initialState']> extends [ConstructorContext<any>, ...infer A] ? A : never;

  export type ProvableCircuitId<C extends Contract<any>> = keyof C['provableCircuits'] & string;

  export type CircuitParameters<C extends Contract<any>, K extends ProvableCircuitId<C>> =
    Parameters<C['provableCircuits'][K]> extends [CircuitContext<any>, ...infer A] ? A : never;

  export type CircuitReturnType<C extends Contract<any>, K extends ProvableCircuitId<C>> =
    ReturnType<C['provableCircuits'][K]> extends CircuitResults<any, infer U> ? U : never;
}

export const getProvableCircuitIds: <C extends Contract.Any>(contract: C) => ProvableCircuitId<C>[] = (contract) =>
  Object.keys(contract.provableCircuits).map(ProvableCircuitId);
