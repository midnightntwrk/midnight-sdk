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

import * as SigningKey from '@midnight-ntwrk/platform-js/effect/SigningKey';
import { Effect, Either } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeConversions } from '../../src/effect/internal/ledger/conversions.js';
import * as V8 from '../../src/effect/internal/ledger/v8.js';
import * as V0_16 from '../../src/effect/internal/runtime/v0_16.js';

/**
 * The **ledger 8 facade**: proof that the runtime↔ledger conversions are no longer a module
 * singleton (midnight-sdk#387/#388).
 *
 * @remarks
 * `Ledger.ts` used to define every conversion directly against `internal/ledger/current.js`. That
 * made the facade a singleton: each entry — `/effect`, `/v9/effect`, and any future `/v8/effect` —
 * resolves the same `Ledger.ts` module instance, so an era-suffixed subpath could only *label* the
 * one bound era, never select it. Adding a `/v8` entry on that basis would have shipped a path
 * named v8 that resolved ledger 9.
 *
 * The conversions now come from `makeConversions(ledgerBinding, runtimeBinding)`, and this suite
 * instantiates it with the **ledger 8** pair while the default test project runs the ledger 9 pair
 * — the two coexisting is the property under test.
 *
 * It also pins the era-varying behaviour that flows through the shared factory rather than being
 * special-cased at a call site: on ledger 8 a signing key is a bare hex string and ECDSA has no
 * representation at all, where ledger 9 tags keys and admits both schemes.
 */
describe('ledger 8 facade', () => {
  const conversions = makeConversions(V8, V0_16);

  it('instantiates the conversions for a second era pair', () => {
    // The whole point: a ledger-8 facade exists at the same time as the ledger-9 one that
    // `Ledger.ts` builds, rather than replacing it.
    expect(conversions.contractStateFromBytes).toBeTypeOf('function');
    expect(V8.era.ledger).toBe(8);
    expect(V0_16.line).toBe('0.16');
  });

  it('pairs ledger 8 with the compact-runtime line it declares', () => {
    // The pairing used to be checked only at run time, across two independent `current.ts` files.
    // Passing both halves to one factory is what makes a mismatched pair a construction error.
    expect(V8.era.runtime).toBe(V0_16.line);
  });

  it('round-trips a ledger 8 contract state through the era-8 conversions', async () => {
    const state = new V8.ContractState();
    const decoded = await Effect.runPromise(conversions.contractStateFromBytes(state.serialize()));

    expect(decoded).toBeInstanceOf(V8.ContractState);
  });

  it('converts a ledger 8 contract state to its paired runtime state', async () => {
    const state = new V8.ContractState();
    const runtimeState = await Effect.runPromise(conversions.toRuntimeContractState(state));

    // Crosses the era boundary the other way: ledger 8 bytes into the 0.16 runtime, which is only
    // sound because the factory was given the *paired* runtime binding.
    expect(runtimeState).toBeInstanceOf(V0_16.ContractState);
  });

  it('produces a bare hex signing key on ledger 8, not a tagged one', () => {
    const platformKey = SigningKey.make('ab'.repeat(32), 'schnorr');
    const result = conversions.fromPlatformSigningKey(platformKey);

    expect(Either.isRight(result)).toBe(true);
    // The one era difference that reaches the public API. Ledger 9's facade returns
    // `{ tag, value }` from this same factory; ledger 8 has no tagged-key concept.
    expect(Either.getOrThrow(result)).toBe('ab'.repeat(32));
  });

  it('rejects an ECDSA key on ledger 8, which cannot represent one', () => {
    const platformKey = SigningKey.make('cd'.repeat(32), 'ecdsa');
    const result = conversions.fromPlatformSigningKey(platformKey);

    // Not a formality: ledger 8 keys are BIP-340 only, so an ECDSA key has no representation in
    // this era at all and must fail rather than be coerced into a bare hex string. The same
    // factory admits ECDSA on ledger 9, so this is era policy flowing through shared code.
    expect(Either.isLeft(result)).toBe(true);
    expect(Either.isLeft(result) && result.left.message).toMatch(/Unsupported signature scheme 'ecdsa'/);
  });

  it('is what the `/v8/effect` entry resolves', async () => {
    // The regression this entry exists to prevent: a path named v8 that resolves ledger 9. Anchored
    // on the ledger-v8 package's own class, not on the literal `8` (whose obvious repair when red
    // is to edit the number) and not on the era-8 binding this file already imports (which would
    // be a tautology).
    const v8Entry = await import('@midnight-ntwrk/compact-js/v8/effect');
    const ledgerV8 = await import('@midnightntwrk/ledger-v8');

    expect(v8Entry.Ledger.ContractState).toBe(ledgerV8.ContractState);
    expect(v8Entry.Ledger.era.ledger).toBe(8);
    expect(v8Entry.CompactRuntime.line).toBe('0.16');
  });

  it('exposes no contract-event surface on the `/v8/effect` entry', async () => {
    const v8Entry = await import('@midnight-ntwrk/compact-js/v8/effect');

    // Era-impossible on ledger 8, so absent rather than present and failing at run time (#388).
    for (const name of ['ContractEventStore', 'ContractLog', 'ContractEventValidationError', 'validateEvents']) {
      expect(Object.keys(v8Entry)).not.toContain(name);
    }
  });

  it('reports the era 8 CMA allowlist in its failure message', () => {
    const result = conversions.fromPlatformSigningKey(SigningKey.make('ef'.repeat(32), 'ecdsa'));

    expect(Either.isLeft(result) && result.left.message).toContain('schnorr');
    expect(Either.isLeft(result) && result.left.message).not.toContain('ecdsa,');
  });
});
