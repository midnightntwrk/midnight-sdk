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

// Pins *upstream* behaviour, not compact-js's: wasm-bindgen guards most entry points with
// `_assertClass`, but a handful take `JsValue` and discard the failed downcast, so a foreign handle
// reads back as absent. The condition is dual instantiation, not era mismatch — two copies of the
// *same* version behave identically. When an `UNGUARDED` case starts throwing, move it to `GUARDED`.

import * as LedgerV8 from '@midnightntwrk/ledger-v8';
import * as LedgerV9 from '@midnightntwrk/ledger-v9';
import { describe, expect, it } from 'vitest';

const TTL = new Date('2030-01-01T00:00:00Z');
const NETWORK_ID = 'undeployed';

const foreignIntent = () => LedgerV8.Intent.new(TTL) as never;
const foreignOffer = () => LedgerV8.UnshieldedOffer.new([], [], []) as never;
const foreignDustActions = () =>
  new LedgerV8.DustActions<LedgerV8.SignatureEnabled, LedgerV8.PreProof>('signature', 'pre-proof', TTL) as never;
const nativeIntent = () => LedgerV9.Intent.new(TTL);
const nativeOffer = () => LedgerV9.UnshieldedOffer.new([], [], []);
// Explicit type arguments: the marker strings are `S['instance']`, so inference lands on the
// constraint (`Signaturish, Proofish`) rather than the pair `Intent.dustActions` accepts.
const nativeDustActions = () =>
  new LedgerV9.DustActions<LedgerV9.SignatureEnabled, LedgerV9.PreProof>('signature', 'pre-proof', TTL);

describe('a ledger handle from a second instantiation', () => {
  // Matched on the guard's own message, so a case that stops reaching the call it names fails here
  // rather than passing on an unrelated throw from its own setup.
  const GUARDED: readonly [string, () => unknown, RegExp][] = [
    [
      'Intent.addDeploy',
      () => nativeIntent().addDeploy(new LedgerV8.ContractDeploy(new LedgerV8.ContractState()) as never),
      /expected instance of ContractDeploy/
    ],
    ['new ChargedState', () => new LedgerV9.ChargedState(LedgerV8.StateValue.newNull() as never), /instance of StateValue/],
    ['new ContractDeploy', () => new LedgerV9.ContractDeploy(new LedgerV8.ContractState() as never), /instance of ContractState/],
    [
      'partitionTranscripts',
      () =>
        LedgerV9.partitionTranscripts(
          [
            new LedgerV8.PreTranscript(
              new LedgerV8.QueryContext(
                new LedgerV8.ChargedState(LedgerV8.StateValue.newNull()),
                LedgerV8.sampleContractAddress()
              ),
              []
            ) as never
          ],
          LedgerV9.LedgerParameters.initialParameters()
        ),
      /Expected PreTranscript/
    ]
  ];

  it.each(GUARDED)('is rejected by %s', (_name, call, message) => {
    expect(call).toThrow(message);
  });

  // Each case sets a value twice — native, then foreign — and reads it back. The native read proves
  // the setter works at all, so a case cannot pass vacuously on a member that is simply absent.
  const UNGUARDED: readonly [string, (which: 'native' | 'foreign') => unknown][] = [
    [
      'Transaction.fromParts',
      (w) =>
        LedgerV9.Transaction.fromParts(NETWORK_ID, undefined, undefined, w === 'native' ? nativeIntent() : foreignIntent())
          .intents
    ],
    [
      'Transaction.fromPartsRandomized',
      (w) =>
        LedgerV9.Transaction.fromPartsRandomized(
          NETWORK_ID,
          undefined,
          undefined,
          w === 'native' ? nativeIntent() : foreignIntent()
        ).intents
    ],
    [
      'Intent.guaranteedUnshieldedOffer',
      (w) => {
        const intent = nativeIntent();
        intent.guaranteedUnshieldedOffer = w === 'native' ? nativeOffer() : foreignOffer();
        return intent.guaranteedUnshieldedOffer;
      }
    ],
    [
      'Intent.fallibleUnshieldedOffer',
      (w) => {
        const intent = nativeIntent();
        intent.fallibleUnshieldedOffer = w === 'native' ? nativeOffer() : foreignOffer();
        return intent.fallibleUnshieldedOffer;
      }
    ],
    [
      // The consequential one: `dustActions` carries the intent's fee payment, so dropping it
      // yields a transaction that looks composed and is unfunded.
      'Intent.dustActions',
      (w) => {
        const intent = nativeIntent();
        intent.dustActions = w === 'native' ? nativeDustActions() : foreignDustActions();
        return intent.dustActions;
      }
    ]
  ];

  it.each(UNGUARDED)('is silently discarded by %s, which does not throw', (_name, set) => {
    expect(set('native')).toBeDefined();
    expect(set('foreign')).toBeUndefined();
  });

  it('is not the only thing those setters swallow — a wrong class is accepted just as quietly', () => {
    // The parameter is simply unchecked. The descriptor lookup is this case's vacuity control:
    // assigning to a property a wasm-bindgen handle does not declare silently creates an own
    // property, so without it an upstream rename would leave this test green.
    const tx = LedgerV9.Transaction.fromParts(NETWORK_ID, undefined, undefined, nativeIntent());
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tx), 'guaranteedOffer')?.set;
    const before = tx.serialize();

    tx.guaranteedOffer = nativeOffer() as never;

    expect(setter).toBeTypeOf('function');
    expect(tx.guaranteedOffer).toBeUndefined();
    expect(tx.serialize()).toEqual(before);
  });
});
