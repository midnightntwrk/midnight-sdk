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

import { type FileSystem } from '@effect/platform';
import { NodeContext } from '@effect/platform-node';
import { ConfigCompiler } from '@midnight-ntwrk/compact-js-command/effect';
import { Console, Effect, Layer } from 'effect';

import * as MockConsole from './MockConsole.js';

/**
 * The layer every command test runs under: a {@link MockConsole} capturing command output, the
 * config compiler, and the Node platform services. A fresh `MockConsole` is built per
 * `Effect.provide`, so tests never observe each other's output.
 */
export const testLayer: Layer.Layer<
  ConfigCompiler.ConfigCompiler | NodeContext.NodeContext | FileSystem.FileSystem
> = Effect.gen(function* () {
  const console = yield* MockConsole.make;
  return Layer.mergeAll(
    Console.setConsole(console),
    ConfigCompiler.layer.pipe(Layer.provideMerge(NodeContext.layer))
  );
}).pipe(Layer.unwrapEffect);
