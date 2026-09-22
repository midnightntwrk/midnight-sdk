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
import { CompactRuntime } from '@midnight-ntwrk/compact-js/effect';
import { ContractState, versionString } from '@midnight-ntwrk/compact-runtime';

/**
 * This package reaches compact-runtime through compact-js and pins it only for its own tests, so
 * the pin here and compact-js's `dependencies` entry must stay in lockstep. If they drift, yarn
 * nests a second copy and the two are no longer the same WASM instantiation — every value that
 * crosses between them then fails with `expected instance of <T>`, far from the cause.
 *
 * The identity check is the one that matters: `versionString` alone would still match across two
 * separately instantiated copies of the *same* version.
 */
describe('compact-runtime identity', () => {
  it('resolves the same compact-runtime module as the CompactRuntime facade', () => {
    expect(CompactRuntime.ContractState).toBe(ContractState);
  });

  it('resolves a compact-runtime on the line the facade is bound to', () => {
    expect(versionString.startsWith(`${CompactRuntime.line}.`)).toBe(true);
  });
});
