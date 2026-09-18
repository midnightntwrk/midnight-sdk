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

import { type SigningKey as PlatformSigningKey } from '@midnight-ntwrk/platform-js/effect/SigningKey';

import { type Era } from '../era.js';

/**
 * The contract every era binding module (`v8.ts`, `v9.ts`, a future `v10.ts`, …) must satisfy.
 *
 * @remarks
 * Checking a binding happens in two stages, because presence alone is not enough and a single
 * interface cannot express the rest:
 *
 * 1. {@link LedgerBinding} — every name the facade re-exports is present, callable, and
 *    constructible with the right arity. Parameters are typed `never` so any concrete parameter
 *    type satisfies them (parameters are contravariant): this stage deliberately does *not*
 *    pin the era's own types, because they legitimately differ between eras.
 * 2. {@link LedgerBindingViolations} — the *relationships between* a binding's members hold. This
 *    is where signature drift is caught: each check projects the binding's own types with
 *    `ReturnType`/`ConstructorParameters`/`InstanceType` and asserts the pairs that compact-js
 *    actually composes still fit together, whatever the era's concrete types are.
 *
 * Stage 2 exists because stage 1 used to be the whole contract, with every member typed
 * `unknown`. That made conformance a presence check: a binding could re-export a name whose
 * signature had drifted and still satisfy the contract, with the breakage surfacing far
 * downstream at a call site. Relational checks catch it at the binding, and — unlike writing the
 * expected signatures out by hand — they do not duplicate the ledger package's declarations,
 * which remain authoritative for their own shapes.
 *
 * Type-only exports (`ContractOperation`, `SigningKey`, `SingleUpdate`, `Transcript`) are erased
 * from `typeof <module>` entirely and cannot be constrained by an interface; they are pinned in
 * `conformance.ts` and `test/typetests/effect/Ledger.tst.ts` instead.
 *
 * @internal
 */
export interface LedgerBinding {
  readonly era: Era;

  readonly makeContractOperationVersion: () => { readonly version: string };
  readonly makeVersionedVerifierKey: (verifierKey: Uint8Array) => {
    readonly version: string;
    readonly rawVk: Uint8Array;
  };
  /**
   * Adapts a platform-js signing key to this era's ledger `SigningKey`. Owned by the binding
   * rather than by the facade because the *shape* is era-varying — ledger 8 signs with a bare hex
   * string, ledger 9 with `{ tag, value }` — and `Era` describes which schemes an era allows, not
   * how it represents a key. The facade keeps the era-neutral half (the allowlist check and the
   * typed failure) and delegates the shape to this.
   */
  readonly makeSigningKey: (signingKey: PlatformSigningKey) => unknown;

  readonly communicationCommitmentRandomness: () => unknown;
  readonly partitionTranscripts: (calls: never, params: never) => readonly unknown[];
  readonly signData: (key: never, data: Uint8Array) => unknown;

  readonly ChargedState: new (state: never) => { readonly state: unknown };
  readonly ContractCallPrototype: new (...args: never[]) => unknown;
  readonly ContractDeploy: new (initialState: never) => { readonly address: string };
  readonly ContractMaintenanceAuthority: {
    new (committee: never, threshold: never, counter?: never): { readonly threshold: number };
    deserialize(raw: Uint8Array): unknown;
  };
  readonly ContractState: {
    new (): { operation(operation: never): unknown; serialize(): Uint8Array };
    deserialize(raw: Uint8Array): unknown;
  };
  readonly Intent: {
    new: (ttl: Date) => {
      addCall(call: never): unknown;
      addDeploy(deploy: never): unknown;
      addMaintenanceUpdate(update: never): unknown;
    };
  };
  readonly LedgerParameters: {
    initialParameters(): unknown;
    deserialize(raw: Uint8Array): unknown;
  };
  readonly MaintenanceUpdate: new (
    address: never,
    updates: never,
    counter: never
  ) => {
    addSignature(idx: bigint, signature: never): unknown;
    readonly dataToSign: Uint8Array;
  };
  readonly PreTranscript: new (context: never, program: never, commComm?: never) => unknown;
  readonly QueryContext: new (state: never, address: never) => unknown;
  readonly ReplaceAuthority: new (authority: never) => unknown;
  readonly StateValue: { decode(value: never): unknown };
  readonly VerifierKeyInsert: new (operation: never, vk: never) => unknown;
  readonly VerifierKeyRemove: new (operation: never, version: never) => unknown;
}

// Tupled so the conditional never distributes over a union operand, and so a `never` on either
// side does not silently resolve to `true`.
type Requires<A, B, Message extends string> = [A] extends [B] ? never : Message;

/**
 * The relational half of the binding contract: a union of human-readable messages for every
 * member pair in a binding that does **not** fit together, or `never` when the binding is sound.
 *
 * @remarks
 * `conformance.ts` asserts this is `never` for every binding, bound or not, so a drifted signature
 * fails the build naming the specific relationship that broke. The message strings are the
 * diagnostic — a build failure reads as `Type '"signData must accept the key makeSigningKey
 * produces"' does not satisfy the constraint 'never'`.
 *
 * Each check mirrors a composition compact-js actually performs (mostly in `Ledger.ts` and
 * `ContractExecutable.ts`); adding a new one is how a newly discovered era difference gets
 * permanently guarded.
 *
 * @internal
 */
export type LedgerBindingViolations<M extends LedgerBinding> =
  // Round-trips: every codec must return the type it claims to decode, not a sibling. Not
  // hypothetical — `@midnightntwrk/ledger-v8@8.1.2` declares
  // `ContractMaintenanceAuthority.deserialize` as returning `ContractState`.
  | Requires<
      ReturnType<M['ContractState']['deserialize']>,
      InstanceType<M['ContractState']>,
      'ContractState.deserialize must return this era\'s ContractState'
    >
  | Requires<
      ReturnType<M['ContractMaintenanceAuthority']['deserialize']>,
      InstanceType<M['ContractMaintenanceAuthority']>,
      'ContractMaintenanceAuthority.deserialize must return this era\'s ContractMaintenanceAuthority'
    >
  | Requires<
      ReturnType<M['LedgerParameters']['deserialize']>,
      ReturnType<M['LedgerParameters']['initialParameters']>,
      'LedgerParameters.deserialize must return this era\'s LedgerParameters'
    >
  // The signing path, end to end: platform key -> era key -> signature -> maintenance update.
  // This is the chain that carries the era's one public-API-visible difference.
  | Requires<
      ReturnType<M['makeSigningKey']>,
      Parameters<M['signData']>[0],
      'signData must accept the key makeSigningKey produces'
    >
  | Requires<
      ReturnType<M['signData']>,
      Parameters<InstanceType<M['MaintenanceUpdate']>['addSignature']>[1],
      'MaintenanceUpdate.addSignature must accept the signature signData produces'
    >
  // Verifier-key maintenance: the binding owns the operation-version literal, so the values it
  // constructs must be the ones this era's single-update constructors take.
  | Requires<
      ReturnType<M['makeVersionedVerifierKey']>,
      ConstructorParameters<M['VerifierKeyInsert']>[1],
      'VerifierKeyInsert must accept the key makeVersionedVerifierKey produces'
    >
  | Requires<
      ReturnType<M['makeContractOperationVersion']>,
      ConstructorParameters<M['VerifierKeyRemove']>[1],
      'VerifierKeyRemove must accept the version makeContractOperationVersion produces'
    >
  // The state-conversion chain in `Ledger.fromRuntimeQueryContext`: decode -> charge -> query.
  | Requires<
      ReturnType<M['StateValue']['decode']>,
      ConstructorParameters<M['ChargedState']>[0],
      'ChargedState must accept the value StateValue.decode produces'
    >
  | Requires<
      InstanceType<M['ChargedState']>,
      ConstructorParameters<M['QueryContext']>[0],
      'QueryContext must accept this era\'s ChargedState'
    >
  | Requires<
      InstanceType<M['ContractState']>,
      ConstructorParameters<M['ContractDeploy']>[0],
      'ContractDeploy must accept this era\'s ContractState'
    >
  | Requires<
      InstanceType<M['ContractMaintenanceAuthority']>,
      ConstructorParameters<M['ReplaceAuthority']>[0],
      'ReplaceAuthority must accept this era\'s ContractMaintenanceAuthority'
    >
  // Transcript partitioning, as called by `ContractExecutable.partitionAllTranscripts`.
  | Requires<
      InstanceType<M['PreTranscript']>[],
      Parameters<M['partitionTranscripts']>[0],
      'partitionTranscripts must accept an array of this era\'s PreTranscript'
    >
  | Requires<
      ReturnType<M['LedgerParameters']['initialParameters']>,
      Parameters<M['partitionTranscripts']>[1],
      'partitionTranscripts must accept this era\'s LedgerParameters'
    >
  // Intent assembly, as called by the CLI's deploy/circuit/maintain commands.
  | Requires<
      InstanceType<M['ContractCallPrototype']>,
      Parameters<ReturnType<M['Intent']['new']>['addCall']>[0],
      'Intent.addCall must accept this era\'s ContractCallPrototype'
    >
  | Requires<
      InstanceType<M['ContractDeploy']>,
      Parameters<ReturnType<M['Intent']['new']>['addDeploy']>[0],
      'Intent.addDeploy must accept this era\'s ContractDeploy'
    >
  | Requires<
      InstanceType<M['MaintenanceUpdate']>,
      Parameters<ReturnType<M['Intent']['new']>['addMaintenanceUpdate']>[0],
      'Intent.addMaintenanceUpdate must accept this era\'s MaintenanceUpdate'
    >;
