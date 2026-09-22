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
 * The **ledger 8 era** test project for the CLI (midnight-sdk#387/#388).
 *
 * @remarks
 * A separate project for the same reason `compact-js/vitest.era8.config.ts` is one: a contract
 * compiled by `compactc` opens with the bare specifier
 * `import * as __compactRuntime from '@midnight-ntwrk/compact-runtime'` followed by
 * `checkRuntimeVersion('0.16.0')`, which hard-fails against the 0.19 line. Generated code
 * compact-js does not own and cannot rewrite, so the only lever is module resolution.
 *
 * The alias is **scoped to the importer**, which the library's era 8 project does not need to do.
 * The CLI holds *both* eras in one process — `internal/era/registry.ts` imports `/v8/effect` and
 * `/v9/effect` — so redirecting `@midnight-ntwrk/compact-runtime` globally would hand the 0.16 line
 * to `internal/runtime/v0_19.ts` as well, leaving the ledger 9 half of the registry silently
 * running the wrong line. Every value name 0.19 re-exports also exists on 0.16, so that would not
 * even fail to link: it would just be wrong. Redirecting only for importers under `managed-v8`
 * gives each era its own line, which is what the two named dependencies
 * (`@midnight-ntwrk/compact-runtime` and the `compact-runtime-ledger8` alias) achieve in a real
 * install.
 *
 * That is also the shape of the recipe a *consumer* needs: era 8 artifacts must resolve
 * `@midnight-ntwrk/compact-runtime` to 0.16 where they live — a nested `node_modules`, a workspace
 * alias, or a bundler rule — and no compact-js entry or CLI option can do it for them.
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
  plugins: [
    {
      name: 'compact-js-command:era8-runtime-resolution',
      // Ahead of Vite's own resolution, so the redirect happens before the specifier is resolved
      // against this package's `@midnight-ntwrk/compact-runtime`. A plugin rather than an alias with
      // `customResolver`, which Vite 9 removes.
      enforce: 'pre',
      resolveId(source, importer) {
        return source === '@midnight-ntwrk/compact-runtime' && importer?.includes('managed-v8')
          ? this.resolve('compact-runtime-ledger8', importer, { skipSelf: true }).then((r) => r?.id)
          : null;
      }
    }
  ]
});
