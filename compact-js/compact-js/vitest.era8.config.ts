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

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * The **ledger 8 era**
 *
 * @remarks
 * A separate project purely because of module resolution. A contract compiled by `compactc` opens
 * with, verbatim:
 *
 * ```js
 * import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
 * __compactRuntime.checkRuntimeVersion('0.16.0');
 * ```
 *
 * That is a *bare specifier* in generated code compact-js does not own and cannot rewrite, and
 * `checkRuntimeVersion` hard-fails across minors while the major is 0. So a ledger-8 fixture
 * loaded in the default project — whose `@midnight-ntwrk/compact-runtime` is 0.19 — throws
 * `Version mismatch: compiled code expects 0.16.0, runtime is 0.19.0-rc.0` before a single
 * assertion runs. The alias below is what points that specifier at the 0.16 line for these tests
 * only; the default project is untouched and still exercises ledger 9.
 *
 * This is also the mechanism a *consumer* would use to hold both eras at once — a bundler alias,
 * or a nested `node_modules` for the era-8 subtree. Worth knowing that it is resolution-level,
 * not something an era-scoped subpath export can solve on its own (midnight-sdk#388).
 *
 * The alias target is the `compact-runtime-ledger8` npm alias, which resolves to the same file as
 * the era binding's own import, so module identity holds across the two names.
 *
 * Run with `vitest run --config vitest.era8.config.ts`. Kept out of the default project's
 * `include` so a missing fixture never breaks the ledger 9 suite.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/era8/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: { enabled: false },
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@midnight-ntwrk/compact-runtime': 'compact-runtime-ledger8'
    }
  }
});
