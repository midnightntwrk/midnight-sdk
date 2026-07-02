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

import { CompiledContract, ContractExecutable } from '@midnight-ntwrk/compact-js/effect';

import { Contract as C_ } from '../../../../compact-js/test/contract/managed/cccMiddle/contract/index';

type CCCMiddleContract = C_<undefined>;
const CCCMiddleContract = C_;

const createInitialPrivateState: () => undefined = () => undefined;

export default {
  contractExecutable: CompiledContract.make<CCCMiddleContract>('CCCMiddle', CCCMiddleContract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets('../../../../compact-js/test/contract/managed/cccMiddle'),
    ContractExecutable.make
  ),
  createInitialPrivateState,
  config: {
    keys: {
      coinPublic: 'd2dc8d175c0ef7d1f7e5b7f32bd9da5fcd4c60fa1b651f1d312986269c2d3c79',
    },
    network: 'undeployed'
  }
}
