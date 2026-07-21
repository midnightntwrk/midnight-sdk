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

import { join } from 'node:path';

import { FileSystem } from '@effect/platform';
import { type PlatformError } from '@effect/platform/Error';
import { NodeContext } from '@effect/platform-node';
import { describe, it } from '@effect/vitest';
import { Contract, ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import { CompiledContractReflection } from '@midnight-ntwrk/compact-js-command/effect';
import { Effect, Layer, String } from 'effect';

import { ensureRemovePath } from './cleanup.js';

const BASE_PATH = join(import.meta.dirname);
const DECLARATION_FILEPATH = join(BASE_PATH, 'contract', 'index.d.ts');
const testLayer: Layer.Layer<
  CompiledContractReflection.CompiledContractReflection
  | NodeContext.NodeContext,
  PlatformError
> = CompiledContractReflection.layer(BASE_PATH).pipe(Layer.provideMerge(NodeContext.layer));

/**
 * Sets up a dummy contract and context for an `ArgumentParser` test fixture.
 *
 * @param argText A string defining on or more JS/TS arguments (in the form `'argName: argType'`).
 * @param fn A function receiving an `ArgumentParser` that should return an array  from arguments
 * called with it.
 * @returns An `Effect` that yields the parsed arguments defined by `argText`, or fails with a `ContractRuntimeError`
 * if the invocation failed.
 */
const parseArgumentsTest = (
  argText: string,
  fn: (argsParser: CompiledContractReflection.CompiledContractReflection.AnyArgumentParser)
    => Effect.Effect<any[], ContractRuntimeError.ContractRuntimeError>, // eslint-disable-line @typescript-eslint/no-explicit-any
  prelude = ''
) => Effect.gen(function* () {
      const NullContract = (() => ({} as any)) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const fs = yield* FileSystem.FileSystem;

      yield* fs.makeDirectory(join(BASE_PATH, 'contract'));
      yield* fs.writeFileString(DECLARATION_FILEPATH, String.stripMargin(`
        |${prelude}
        |export type ImpureCircuits<T> = {
        | circuit(_: any, ${argText}): void;
        |}
        |
        |export declare class Contract<T, W> {
        | initialState(_: any, ${argText}): void;
        |}
      `));

      const contractReflection = yield* CompiledContractReflection.CompiledContractReflection;
      const argsParser = yield* contractReflection.createArgumentParser(
        CompiledContract.make('NullContract', NullContract).pipe(
          CompiledContract.withWitnesses({} as never),
          CompiledContract.withCompiledFileAssets(BASE_PATH)
        )
      );
      return yield* fn(argsParser);
  }).pipe(
    Effect.ensuring(ensureRemovePath(join(BASE_PATH, 'contract')))
  );

describe.sequential('CompiledContractReflection', () => {
  describe('argument parsing', () => {
    it.each([
      ['bigint', 'abc'],
      ['boolean', 'maybe']
    ])('should fail to parse with an invalid argument (%s)', async (type, invalidValue) => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
            `a: ${type}`,
            (_) => _.parseInitializationArgs([invalidValue])
          ).pipe(Effect.flip)
        ).toBeInstanceOf(ContractRuntimeError.ContractRuntimeError);
      }).pipe(Effect.provide(testLayer)));
    });

    it.each([
      ['number', '3'],
      ['bigint', '100'],
      ['boolean', 'true'],
      ['boolean', 'false'],
      ['string', 'hosky'],
      ['Uint8Array', 'ffffff']
    ])('should parse with a valid argument (%s)', async (type, validString) => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
            `a: ${type}`,
            (_) => _.parseInitializationArgs([validString])
          )
        ).toHaveLength(1);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse multiple arguments', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
          'a: bigint, b: string, c: boolean',
          (_) => _.parseInitializationArgs(['100', 'hosky', 'true'])
        )).toStrictEqual([100n, 'hosky', true]);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should fail when parsing an invalid tuple element', async () => {
      await Effect.runPromise(Effect.gen(function* () {
          expect(yield* parseArgumentsTest(
            'a: [bigint, boolean]',
            (_) => _.parseInitializationArgs(['[100, maybe]'])
          ).pipe(Effect.flip)
        ).toBeInstanceOf(ContractRuntimeError.ContractRuntimeError)
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse multiple valid tuple type elements', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
          'a: [bigint, string, boolean]',
          (_) => _.parseInitializationArgs(["[100, 'hosky', true]"])
        )).toStrictEqual([[100n, 'hosky', true]]);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse nested tuple type elements', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
          'a: [bigint, [string, boolean], boolean]',
          (_) => _.parseInitializationArgs(["[100, ['hosky', false], true]"])
        )).toStrictEqual([[100n, ['hosky', false], true]]);
      }).pipe(Effect.provide(testLayer)));
    });


    it('should parse object literal type elements', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: { x: Uint8Array; y: bigint; z: string; }',
          (_) => _.parseInitializationArgs(["{ x: 'ffffff', y: 100, z: 'hosky' }"])
        );
        expect(parsedArgs[0].x).toBeInstanceOf(Uint8Array);
        expect(parsedArgs[0]).toMatchObject({ y: 100n, z: 'hosky' });
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse object literal type elements containing tuple types', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
          'a: { x: [bigint, string]; y: string; }',
          (_) => _.parseInitializationArgs(["{ x: [100, 'doggo'], y: 'hosky' }"])
        )).toStrictEqual([{ x: [100n, 'doggo'], y: 'hosky' }]);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse nested object literal type elements', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: { x: Uint8Array; y: { y1: bigint, y2: string  }; z: string; }',
          (_) => _.parseInitializationArgs(["{ x: 'ffffff', y: { y1: 200, y2: 'doggo' }, z: 'hosky' }"])
        );
        expect(parsedArgs[0].x).toBeInstanceOf(Uint8Array);
        expect(parsedArgs[0]).toMatchObject({ y: { y1: 200n, y2: 'doggo' }, z: 'hosky' });
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse object with bytes property as Bech32m-encoded string', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const bech32Address = 'mn_addr_undeployed1h3ssm5ru2t6eqy4g3she78zlxn96e36ms6pq996aduvmateh9p9sk96u7s';
        const expected = 'bc610dd07c52f59012a88c2f9f1c5f34cbacc75b868202975d6f19beaf37284b';

        const parsedArgs = yield* parseArgumentsTest(
          'a: { bytes: Uint8Array }',
          (_) => _.parseInitializationArgs([`{ bytes: '${bech32Address}' }`])
        );

        expect(parsedArgs[0].bytes).toBeInstanceOf(Uint8Array);
        const bytesAsHex = Buffer.from(parsedArgs[0].bytes).toString('hex');
        expect(bytesAsHex).toEqual(expected);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should successfully parse object with bytes property as hex string', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: { bytes: Uint8Array }',
          (_) => _.parseInitializationArgs(["{ bytes: 'ffffff' }"])
        );

        expect(parsedArgs[0].bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(parsedArgs[0].bytes)).toEqual([255, 255, 255]);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse object with nested bytes property as Bech32m string', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const bech32Address = 'mn_addr_undeployed1h3ssm5ru2t6eqy4g3she78zlxn96e36ms6pq996aduvmateh9p9sk96u7s';

        const parsedArgs = yield* parseArgumentsTest(
          'a: { data: { bytes: Uint8Array }, label: string }',
          (_) => _.parseInitializationArgs([`{ data: { bytes: '${bech32Address}' }, label: 'test' }`])
        );

        expect(parsedArgs[0].data.bytes).toBeInstanceOf(Uint8Array);
        expect(parsedArgs[0].label).toBe('test');
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse a named struct type alias (ShieldedCoinInfo)', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const nonce = 'ff'.repeat(32);
        const color = 'ab'.repeat(32);
        const parsedArgs = yield* parseArgumentsTest(
          'a: ShieldedCoinInfo',
          (_) => _.parseInitializationArgs(
            [`{"nonce":"${nonce}","color":"${color}","value":100}`]
          ),
          'export type ShieldedCoinInfo = { nonce: Uint8Array; color: Uint8Array; value: bigint };'
        );

        expect(parsedArgs[0].nonce).toBeInstanceOf(Uint8Array);
        expect(parsedArgs[0].nonce).toHaveLength(32);
        expect(parsedArgs[0].color).toBeInstanceOf(Uint8Array);
        expect(parsedArgs[0].color).toHaveLength(32);
        expect(Buffer.from(parsedArgs[0].nonce).toString('hex')).toEqual(nonce);
        expect(Buffer.from(parsedArgs[0].color).toString('hex')).toEqual(color);
        expect(parsedArgs[0].value).toEqual(100n);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse multiple named struct alias arguments', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const nonce = 'ff'.repeat(32);
        const color = 'ab'.repeat(32);
        const coin = `{"nonce":"${nonce}","color":"${color}","value":100}`;
        const parsedArgs = yield* parseArgumentsTest(
          'amount: bigint, coinA: ShieldedCoinInfo, coinB: ShieldedCoinInfo',
          (_) => _.parseInitializationArgs(['5', coin, coin]),
          'export type ShieldedCoinInfo = { nonce: Uint8Array; color: Uint8Array; value: bigint };'
        );

        expect(parsedArgs[0]).toEqual(5n);
        expect(parsedArgs[1].value).toEqual(100n);
        expect(parsedArgs[2].value).toEqual(100n);
        expect(parsedArgs[1].nonce).toBeInstanceOf(Uint8Array);
        expect(parsedArgs[2].color).toBeInstanceOf(Uint8Array);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should resolve a named alias that references another named alias', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const bytes = 'cd'.repeat(32);
        const parsedArgs = yield* parseArgumentsTest(
          'a: Outer',
          (_) => _.parseInitializationArgs(
            [`{"inner":{"bytes":"${bytes}"},"count":7}`]
          ),
          String.stripMargin(`
            |export type Inner = { bytes: Uint8Array };
            |export type Outer = { inner: Inner; count: bigint };
          `)
        );

        expect(parsedArgs[0].inner.bytes).toBeInstanceOf(Uint8Array);
        expect(Buffer.from(parsedArgs[0].inner.bytes).toString('hex')).toEqual(bytes);
        expect(parsedArgs[0].count).toEqual(7n);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should fail with a descriptive error for an unknown type reference', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
          'a: Mystery',
          (_) => _.parseCircuitArgs(Contract.ProvableCircuitId('circuit'), ['{}'])
        ).pipe(Effect.flip)
        ).toBeInstanceOf(ContractRuntimeError.ContractRuntimeError);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse a generic alias by binding its type argument (Maybe<bigint>)', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: Maybe<bigint>',
          (_) => _.parseCircuitArgs(Contract.ProvableCircuitId('circuit'), ['{"is_some":true,"value":42}']),
          'export type Maybe<T> = { is_some: boolean; value: T };'
        );

        expect(parsedArgs[0]).toStrictEqual({ is_some: true, value: 42n });
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse a generic alias whose type argument needs decoding (Maybe<Uint8Array>)', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const bytes = 'ab'.repeat(32);
        const parsedArgs = yield* parseArgumentsTest(
          'a: Maybe<Uint8Array>',
          (_) => _.parseInitializationArgs([`{"is_some":true,"value":"${bytes}"}`]),
          'export type Maybe<T> = { is_some: boolean; value: T };'
        );

        expect(parsedArgs[0].is_some).toEqual(true);
        expect(parsedArgs[0].value).toBeInstanceOf(Uint8Array);
        expect(Buffer.from(parsedArgs[0].value).toString('hex')).toEqual(bytes);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse an array of a generic alias (Maybe<string>[])', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: Maybe<string>[]',
          (_) => _.parseInitializationArgs(['[{"is_some":true,"value":"hosky"},{"is_some":false,"value":""}]']),
          'export type Maybe<T> = { is_some: boolean; value: T };'
        );

        expect(parsedArgs[0]).toStrictEqual([
          { is_some: true, value: 'hosky' },
          { is_some: false, value: '' }
        ]);
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse a nested generic alias without type-parameter collision (Maybe<Maybe<bigint>>)', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: Maybe<Maybe<bigint>>',
          (_) => _.parseInitializationArgs(['{"is_some":true,"value":{"is_some":true,"value":7}}']),
          'export type Maybe<T> = { is_some: boolean; value: T };'
        );

        expect(parsedArgs[0]).toStrictEqual({ is_some: true, value: { is_some: true, value: 7n } });
      }).pipe(Effect.provide(testLayer)));
    });

    it('should parse a multi-parameter generic alias (Either<bigint, string>)', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: Either<bigint, string>',
          (_) => _.parseInitializationArgs(['{"is_left":true,"left":9,"right":"hosky"}']),
          'export type Either<A, B> = { is_left: boolean; left: A; right: B };'
        );

        expect(parsedArgs[0]).toStrictEqual({ is_left: true, left: 9n, right: 'hosky' });
      }).pipe(Effect.provide(testLayer)));
    });

    it('should resolve a type parameter passed through to another generic alias', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        const parsedArgs = yield* parseArgumentsTest(
          'a: Wrapper<bigint>',
          (_) => _.parseInitializationArgs(['{"inner":{"is_some":true,"value":3}}']),
          String.stripMargin(`
            |export type Maybe<T> = { is_some: boolean; value: T };
            |export type Wrapper<T> = { inner: Maybe<T> };
          `)
        );

        expect(parsedArgs[0]).toStrictEqual({ inner: { is_some: true, value: 3n } });
      }).pipe(Effect.provide(testLayer)));
    });

    it('should fail when a generic alias is used without its type argument', async () => {
      await Effect.runPromise(Effect.gen(function* () {
        expect(yield* parseArgumentsTest(
          'a: Maybe',
          (_) => _.parseCircuitArgs(Contract.ProvableCircuitId('circuit'), ['{"is_some":true,"value":1}']),
          'export type Maybe<T> = { is_some: boolean; value: T };'
        ).pipe(Effect.flip)
        ).toBeInstanceOf(ContractRuntimeError.ContractRuntimeError);
      }).pipe(Effect.provide(testLayer)));
    });
  });
});
