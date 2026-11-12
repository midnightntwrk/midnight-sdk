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

import { describe, it } from '@effect/vitest';
import { ContractRuntimeError, Ledger } from '@midnight-ntwrk/compact-js/effect';
import {
  ChargedState as RuntimeChargedState,
  ContractOperation as RuntimeContractOperation,
  ContractState as RuntimeContractState,
  QueryContext as RuntimeQueryContext,
  StateValue as RuntimeStateValue
} from '@midnight-ntwrk/compact-runtime';
import { Cause, Effect, Exit, Option } from 'effect';

const ADDRESS = '0a2d0e34db258f640dc2ec410fb0e4eea9cd6f9661ba6a86f0c35a708e1b811a';
// A 32-byte coin commitment, hex encoded — the key type of `QueryContext.comIndices`.
const COMMITMENT = 'ab'.repeat(32);

/** A runtime contract state carrying an operation per supplied circuit id. */
const runtimeStateWith = (...circuitIds: readonly string[]): RuntimeContractState => {
  const state = new RuntimeContractState();
  for (const circuitId of circuitIds) {
    state.setOperation(circuitId, new RuntimeContractOperation());
  }
  return state;
};

const ledgerStateWith = (...circuitIds: readonly string[]): Ledger.ContractState =>
  Effect.runSync(Ledger.fromRuntimeContractState(runtimeStateWith(...circuitIds)));

describe('Ledger.operationForCircuit', () => {
  it.effect('resolves the operation when the state has one for the circuit', () =>
    Effect.gen(function* () {
      const operation = yield* Ledger.operationForCircuit(ledgerStateWith('increment'), 'increment', ADDRESS);

      expect(operation).toBeDefined();
    })
  );

  it('fails with a ContractRuntimeError naming the circuit and address when the operation is absent', () => {
    // The whole point of this function: a state file for the wrong contract parses fine and then
    // yields `undefined`, which would otherwise be cast and surface as an opaque native fault.
    const exit = Effect.runSyncExit(
      Ledger.operationForCircuit(ledgerStateWith('increment'), 'not_a_circuit', ADDRESS)
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
    expect(ContractRuntimeError.isRuntimeError(error)).toBe(true);
    expect((error as ContractRuntimeError.ContractRuntimeError).message).toContain('not_a_circuit');
    expect((error as ContractRuntimeError.ContractRuntimeError).message).toContain(ADDRESS);
  });

  it('fails in the error channel, not as a defect, when the ledger rejects the state', () => {
    // A state built against a different WASM instantiation fails `_assertClass` by *throwing*
    // ('expected instance of ContractState'), which this function's docblock promises not to let
    // surface as an opaque native fault. The call is evaluated while the caller's `Effect.gen`
    // body runs, so an unwrapped throw is a defect: it escapes both the handler's terminating
    // `mapError` and the CLI's `catchAll`. `Cause.failureOption` is the assertion that separates
    // the two — a `Die` yields `None` here even though the exit is still a failure.
    const foreignState = {
      operation: () => {
        throw new Error('expected instance of ContractState');
      }
    } as unknown as Ledger.ContractState;

    const exit = Effect.runSyncExit(
      Effect.gen(function* () {
        return yield* Ledger.operationForCircuit(foreignState, 'increment', ADDRESS);
      })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const failure = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;
    expect(ContractRuntimeError.isRuntimeError(failure)).toBe(true);
    expect((failure as ContractRuntimeError.ContractRuntimeError).message).toContain('increment');
  });
});

describe('Ledger.fromRuntimeQueryContext', () => {
  const runtimeContext = (): RuntimeQueryContext =>
    new RuntimeQueryContext(new RuntimeChargedState(RuntimeStateValue.newNull()), ADDRESS);

  it.effect('carries state, address, block and effects', () =>
    Effect.gen(function* () {
      const source = runtimeContext();
      const block = { ...source.block, secondsSinceEpoch: 1234n };
      source.block = block;

      const converted = yield* Ledger.fromRuntimeQueryContext(source);

      expect(converted.address).toEqual(source.address);
      expect(converted.block.secondsSinceEpoch).toEqual(1234n);
      expect(converted.effects).toBeDefined();
    })
  );

  it.effect('carries comIndices via the block assignment, despite the readonly declaration', () =>
    Effect.gen(function* () {
      // `comIndices` is `readonly` and writable only through `insertCommitment`, which reads as
      // though this conversion must drop it. It does not: the commitment map rides on `block`.
      // Pinned because the plausible-looking "fix" — re-inserting the entries here — would union
      // two commitment sets at `partitionAllTranscripts`, which supplies its own.
      const source = runtimeContext().insertCommitment(COMMITMENT, 7n);
      expect(source.comIndices.size).toBe(1);

      const converted = yield* Ledger.fromRuntimeQueryContext(source);

      expect(converted.comIndices.size).toBe(1);
      expect(converted.comIndices.get(COMMITMENT)).toEqual(7n);
    })
  );
});

describe('Ledger conversion error channel', () => {
  it('fails with a ContractRuntimeError rather than throwing on undeserializable bytes', () => {
    const exit = Effect.runSyncExit(Ledger.contractStateFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])));

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
