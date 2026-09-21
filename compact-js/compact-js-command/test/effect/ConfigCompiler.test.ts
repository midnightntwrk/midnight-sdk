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

import { resolve } from 'node:path';

import { NodeContext } from '@effect/platform-node';
import { describe, expect,it } from '@effect/vitest';
import { ConfigCompiler } from '@midnight-ntwrk/compact-js-command/effect';
import { Effect, Layer } from 'effect';

import { useConfigFixture } from './configFixture.js';

// Test files run in parallel, and compiling a fixture writes a sibling `.js` next to it, so this
// file compiles its own copy rather than racing the command tests over one pair of paths.
const COUNTER_CONFIG_FILEPATH = useConfigFixture(
  resolve(import.meta.dirname, '../contract/counter/contract.config.ts'),
  'config-compiler'
);

describe('ConfigCompiler', () => {
  describe('layer', () => {
    describe('with valid and well formed configuration file', () => {
      it.effect('should compile and return module', () =>
        Effect.gen(function* () {
          const compiler = yield* ConfigCompiler.ConfigCompiler;
          const configModuleSpec = yield* compiler.compile(COUNTER_CONFIG_FILEPATH);

          expect(configModuleSpec).toMatchObject({
            moduleImportDirectoryPath: expect.any(String),
            module: expect.objectContaining({
              default: expect.objectContaining({
                config: expect.any(Object),
                contractExecutable: expect.objectContaining({
                  compiledContract: expect.objectContaining({
                    tag: 'CounterContract'
                  })
                })
              })
            })
          });
        }).pipe(
          Effect.provide(ConfigCompiler.layer.pipe(Layer.provideMerge(NodeContext.layer))),
          Effect.catchAll((err) => {
            console.log(err);
            return Effect.void
          })
        ),
        30_000
      );
    });
  });
});
