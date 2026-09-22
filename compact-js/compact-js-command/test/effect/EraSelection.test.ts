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

import { describe, expect, it } from '@effect/vitest';
import { ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import { Cause, Clock, Effect, Exit, Option } from 'effect';

import * as CircuitCommand from '../../src/effect/internal/circuitCommand.js';
import { makeIntents } from '../../src/effect/internal/command.js';
import type * as EraBinding from '../../src/effect/internal/era/binding.js';
import { DEFAULT_LEDGER_ERA, SELECTABLE_LEDGER_ERAS } from '../../src/effect/internal/era/eras.js';
import { forLedgerEra } from '../../src/effect/internal/era/registry.js';

/**
 * The half of `--ledger-era` that `LedgerEraOption.test.ts` cannot reach: that a handler built for
 * an era really uses *that* era, and that the options an era cannot honour are refused by name.
 *
 * @remarks
 * Reaching through the CLI would not prove the first point — the `counter` fixture's executable is
 * ledger 9, so an era 8 invocation stops on the era reconciliation before a handler runs. So the
 * handler factories are driven directly here: a stub era whose every member is observable shows
 * that what the handler calls is the argument it was given and not the bound facade, which is a
 * property no end-to-end run against a single era can distinguish.
 */

/** A ledger 8 era descriptor, structurally the real thing so the stub needs no cast. */
const STUB_ERA = {
  ledger: 8,
  runtime: '0.16',
  supportsCmaSignatureKind: () => true,
  cmaSignatureKindsDescription: 'schnorr',
  defaultCmaSignatureKind: 'schnorr'
} as const;

const STUB_INTENT_BYTES = new Uint8Array([1, 2, 3]);

interface StubCalls {
  readonly intentTtls: Date[];
  readonly boundaryMessages: string[];
}

/**
 * A `CommandLedger` that is not any era at all — every member is a recognisable stand-in. A handler
 * that reached past its argument to the bound facade would produce the real ledger's values here,
 * not these.
 */
const makeStubLedger = (): readonly [EraBinding.CommandLedger, StubCalls] => {
  const calls: StubCalls = { intentTtls: [], boundaryMessages: [] };

  const intent: EraBinding.CommandIntent = {
    addCall: () => intent,
    addDeploy: () => intent,
    addMaintenanceUpdate: () => intent,
    serialize: () => STUB_INTENT_BYTES
  };

  const ledger: EraBinding.CommandLedger = {
    era: STUB_ERA,
    Intent: {
      new: (ttl) => {
        calls.intentTtls.push(ttl);
        return intent;
      }
    },
    ChargedState: class {},
    ContractCallPrototype: class {},
    ContractDeploy: class {},
    communicationCommitmentRandomness: () => 'stub-comm-rand',
    tryConvert: (message, evaluate) => {
      calls.boundaryMessages.push(message);
      return Effect.try({
        try: evaluate,
        catch: (err) => ContractRuntimeError.make(message, err)
      });
    },
    contractStateFromBytes: () => Effect.succeed({ data: undefined, serialize: () => STUB_INTENT_BYTES }),
    parametersFromBytes: () => Effect.succeed('stub-parameters'),
    fromRuntimeContractState: () => Effect.succeed({ data: undefined, serialize: () => STUB_INTENT_BYTES }),
    toRuntimeContractState: () => Effect.succeed('stub-runtime-state'),
    fromRuntimeStateValue: () => Effect.succeed('stub-state-value'),
    operationForCircuit: () => Effect.succeed({ verifierKey: new Uint8Array() })
  };

  return [ledger, calls] as const;
};

const stubRuntime: EraBinding.CommandRuntime = {
  tryRuntime: (message, evaluate) => Effect.try({ try: evaluate, catch: (err) => ContractRuntimeError.make(message, err) }),
  decodeZswapLocalState: () => 'stub-decoded-zswap',
  encodeZswapLocalState: () => ({
    coinPublicKey: { bytes: new Uint8Array() },
    currentIndex: 0n,
    inputs: [],
    outputs: []
  })
};

/**
 * The `circuit` command's inputs, defaulted to a shape that reaches no era capability. Individual
 * tests override only the option under test, so a gate that fired for an unrelated reason would
 * show up as an unexpected failure rather than a passing assertion.
 */
const circuitInputs = (
  overrides: Partial<CircuitCommand.Args & CircuitCommand.Options> = {}
): CircuitCommand.Args & CircuitCommand.Options =>
  ({
    address: 'a'.repeat(64),
    circuitId: 'increment',
    args: [],
    inputFilePath: '/nonexistent/state.bin',
    inputPrivateStateFilePath: '/nonexistent/ps.json',
    inputZswapLocalStateFilePath: Option.none(),
    inputLedgerParamsFilePath: Option.none(),
    inputContractStatesDirPath: Option.none(),
    inputContractModulesDirPath: Option.none(),
    outputContractStatesDirPath: Option.none(),
    outputFilePath: '/nonexistent/out.bin',
    outputPublicFilePath: Option.none(),
    outputPrivateStateFilePath: '/nonexistent/out.ps.json',
    outputZswapLocalStateFilePath: '/nonexistent/out.zswap.json',
    outputResultFilePath: '/nonexistent/out.result.json',
    outputEventsFilePath: Option.none(),
    ...overrides
  }) as CircuitCommand.Args & CircuitCommand.Options;

/**
 * The message a capability gate produced.
 *
 * @remarks
 * The handler ends with `Effect.mapError((err) => ContractRuntimeError.make('Failed to invoke
 * circuit', err))`, so a gate's own message is the *cause* of the surfaced failure, not its
 * message. Reading only the top would let a test pass on any failure at all — including the file
 * errors the unreachable-path test deliberately provokes.
 */
const gateMessageOf = (exit: Exit.Exit<unknown, ContractRuntimeError.ContractRuntimeError>): string => {
  expect(Exit.isFailure(exit)).toBe(true);
  const failure = Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : Option.none();
  const cause = Option.getOrThrow(failure).cause;
  return cause instanceof Error ? cause.message : String(cause);
};

describe('era selection', () => {
  describe('the era registry', () => {
    it('holds one command set per selectable era, each pinned to its own era pair', () => {
      expect([...SELECTABLE_LEDGER_ERAS]).toEqual([8, 9]);

      // The era *pair*, not just the ledger major: a command set built from the unsuffixed entry
      // would report the bound era for both, which is the mislabelling the era work prevents.
      expect(forLedgerEra(8).era).toMatchObject({ ledger: 8, runtime: '0.16' });
      expect(forLedgerEra(9).era).toMatchObject({ ledger: 9, runtime: '0.19' });
    });

    it('applies the handler factories once per era', () => {
      // Distinct closures, so each command really is that era's application rather than one
      // shared handler consulting an era at call time.
      expect(forLedgerEra(8).circuit).not.toBe(forLedgerEra(9).circuit);
      expect(forLedgerEra(8).deploy).not.toBe(forLedgerEra(9).deploy);
      expect(forLedgerEra(8).maintainCircuit).not.toBe(forLedgerEra(9).maintainCircuit);
      expect(forLedgerEra(8).maintainContract).not.toBe(forLedgerEra(9).maintainContract);
    });

    it('defaults to the era this build binds', () => {
      expect(DEFAULT_LEDGER_ERA).toBe(9);
      expect(forLedgerEra(DEFAULT_LEDGER_ERA).era.ledger).toBe(DEFAULT_LEDGER_ERA);
    });

    it('refuses an era it has no command set for', () => {
      // Unreachable through the CLI (option parsing rejects it first), so this pins the registry's
      // own totality rather than a user-facing path.
      expect(() => forLedgerEra(7)).toThrow(/No command set for ledger era 7/);
    });
  });

  describe('the shared intent operations', () => {
    it.effect('builds its intent from the era it was given', () =>
      Effect.gen(function* () {
        const [ledger, calls] = makeStubLedger();
        const { newIntent, serializeIntent } = makeIntents(ledger);

        const now = yield* Clock.currentTimeMillis;
        const intent = yield* newIntent();
        const bytes = yield* serializeIntent(intent);

        expect(bytes).toBe(STUB_INTENT_BYTES);
        expect(calls.intentTtls).toHaveLength(1);
        // The command-wide TTL policy, applied to the stub's own `Intent.new`. Read off the
        // `Effect` clock rather than `Date.now`, which `it.effect`'s test clock does not advance.
        expect(Option.getOrThrow(Option.fromNullable(calls.intentTtls[0])).getTime() - now).toBe(600_000);
      })
    );

    it.effect('routes every ledger call through the era\'s own boundary wrapper', () =>
      Effect.gen(function* () {
        const [ledger, calls] = makeStubLedger();
        const { newIntent, serializeIntent } = makeIntents(ledger);

        yield* newIntent().pipe(Effect.flatMap(serializeIntent));

        // Both calls went through the stub's `tryConvert`, which is what keeps a WASM rejection in
        // the error channel instead of letting it escape the handler as a defect.
        expect(calls.boundaryMessages).toEqual(['Failed to create intent', 'Failed to serialize the intent']);
      })
    );

    it.effect('turns a rejection from the era into a typed failure, not a defect', () =>
      Effect.gen(function* () {
        const [ledger, calls] = makeStubLedger();
        const rejecting: EraBinding.CommandLedger = {
          ...ledger,
          Intent: {
            new: () => {
              throw new Error('expected instance of Intent');
            }
          }
        };

        const exit = yield* Effect.exit(makeIntents(rejecting).newIntent());

        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).toMatch(/Failed to create intent/);
        expect(calls.intentTtls).toHaveLength(0);
      })
    );
  });

  describe('era capabilities', () => {
    const [stubLedger] = makeStubLedger();

    // An era with neither capability — ledger 8's shape, built here rather than imported so the
    // gates are tested against the *contract* rather than against one era's current facts.
    const withoutCapabilities = CircuitCommand.makeHandler(stubLedger, stubRuntime, { contractEvents: false });
    const withCapabilities = CircuitCommand.makeHandler(stubLedger, stubRuntime, {
      makeContractStateProvider: () => ({ getContractState: () => Promise.resolve(undefined) }),
      makeContractModuleProvider: () => ({ resolve: () => undefined }),
      contractEvents: true
    });

    it.effect('rejects --contract-states-dir on an era with no cross-contract calls', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          withoutCapabilities(
            circuitInputs({ inputContractStatesDirPath: Option.some('/states') }),
            undefined as never
          )
        );

        const message = gateMessageOf(exit);
        expect(message).toMatch(/Ledger era 8 has no cross-contract calls/);
        expect(message).toMatch(/--contract-states-dir/);
      })
    );

    it.effect('rejects --output-contract-states-dir on the same era', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          withoutCapabilities(
            circuitInputs({ outputContractStatesDirPath: Option.some('/states') }),
            undefined as never
          )
        );

        expect(gateMessageOf(exit)).toMatch(/Ledger era 8 has no cross-contract calls/);
      })
    );

    it.effect('rejects --output-events on an era that cannot emit them', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          withoutCapabilities(circuitInputs({ outputEventsFilePath: Option.some('/events.json') }), undefined as never)
        );

        const message = gateMessageOf(exit);
        expect(message).toMatch(/Ledger era 8 cannot emit contract log events/);
        // Rejected rather than silently writing `[]`, which would read as "the contract emitted
        // nothing" when the truth is that the era cannot emit at all.
        expect(message).toMatch(/--output-events/);
      })
    );

    it.effect('lets both options past on an era that has the capabilities', () =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          withCapabilities(
            circuitInputs({
              inputContractStatesDirPath: Option.some('/states'),
              inputContractModulesDirPath: Option.some('/modules'),
              outputContractStatesDirPath: Option.some('/states-out'),
              outputEventsFilePath: Option.some('/events.json')
            }),
            undefined as never
          )
        );

        // It still fails — there is no `FileSystem` in this test's context and the input paths do
        // not exist — but on the *inputs*, not on a capability gate.
        expect(Exit.isFailure(exit)).toBe(true);
        expect(String(exit)).not.toMatch(/cross-contract calls|cannot emit contract log events|must be given together/);
      })
    );
  });
});
