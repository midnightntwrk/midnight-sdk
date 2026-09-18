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

import { type SignatureKind } from '@midnight-ntwrk/platform-js/effect/SigningKey';

import { type RuntimeLine } from '../era.js';

/**
 * The era-neutral core every compact-runtime binding module (`v0_16.ts`, `v0_19.ts`, a future
 * `v0_20.ts`, …) must satisfy: the members whose signatures really are the same on every line
 * this codebase binds.
 *
 * @remarks
 * This contract used to list eleven members typed `unknown`, which made it a presence check — and
 * a misleading one. Every single one of those names exists on compact-runtime 0.16 as well as
 * 0.19, so a ledger-8 binding satisfied the contract *completely* while `CircuitContext`,
 * `createCircuitContext` and `CircuitResults` had all changed shape between the lines, and
 * `CallProofData`, `CommunicationCommitmentData`, `LogEvent`, `ContractStateProvider` and
 * `crossContractCall` did not exist on 0.16 at all. Conformance would have gone green on a binding
 * that breaks every consumer.
 *
 * The fix has two parts. Members that genuinely differ moved out of this interface into
 * {@link CallTreeRuntimeBinding}, so a line that cannot provide them fails to claim the capability
 * instead of silently passing. Members that *can* be made era-neutral are normalised by the
 * binding — see {@link makeSampleSigningKey} — rather than leaving each call site to cope.
 * {@link RuntimeBindingViolations} then checks the relationships between what is left.
 *
 * As in the ledger seam, parameters are typed `never` (parameters are contravariant, so any
 * concrete parameter type satisfies them): this stage pins presence, callability and arity, and
 * the relational stage pins the signatures.
 *
 * @internal
 */
export interface RuntimeBinding {
  readonly line: RuntimeLine;

  readonly CompactError: new (message: never) => Error;
  readonly ContractMaintenanceAuthority: new (committee: never, threshold: never, counter?: never) => {
    readonly counter: bigint;
  };
  readonly ContractState: {
    new (): { serialize(): Uint8Array };
    deserialize(raw: Uint8Array): unknown;
  };
  readonly createConstructorContext: (...args: never[]) => unknown;

  readonly emptyZswapLocalState: (coinPublicKey: never) => unknown;
  readonly encodeZswapLocalState: (state: never) => unknown;
  readonly decodeZswapLocalState: (encoded: never) => unknown;

  // Note there is no `signData` here: CMA signing goes through the *ledger* seam
  // (`Ledger.signData`), and the runtime side only ever needs to derive a verifying key.
  readonly signatureVerifyingKey: (key: never) => unknown;
  /**
   * Samples a fresh signing key for `kind`, in this line's **native** key representation.
   *
   * @remarks
   * Owned by the binding because the underlying call is era-varying in both directions:
   * onchain-runtime-v3 exposes `sampleSigningKey(): string` — a bare hex key, no parameter, no
   * scheme concept — while v4 exposes `sampleSigningKey(kind?: SignatureKind): { tag, value }`.
   * Re-exporting the raw function would leave the single call site in
   * `ContractExecutable.createMaintenanceAuthority` passing an argument one line does not accept.
   *
   * The return type is deliberately *not* normalised to a common shape: the key has to stay
   * assignable to this line's own `signatureVerifyingKey`, which takes the native type. Reading a
   * key's hex is what gets normalised — see {@link signingKeyHex}.
   *
   * Callers must still consult the *ledger* era's allowlist before choosing `kind`: a line with no
   * scheme concept cannot honour anything but its one native scheme, and ignores the argument.
   */
  readonly makeSampleSigningKey: (kind: SignatureKind) => unknown;
  /**
   * Extracts the hex value of one of this line's signing keys.
   *
   * @remarks
   * The era-neutral half of the signing-key difference: a bare hex `string` is already its own
   * value on 0.16, while a 0.19 key carries it under `.value`. Having the binding answer this
   * means `ContractExecutable` can hand the hex to `platform-js`'s `SigningKey.make` without
   * branching on the era.
   */
  readonly signingKeyHex: (key: never) => string;
}

/**
 * The capability a compact-runtime line must have for compact-js to execute circuits the way
 * `ContractExecutable` does: a **call tree** rather than a single frame, with contract events and
 * cross-contract calls.
 *
 * @remarks
 * Declared separately from {@link RuntimeBinding}, and deliberately unsatisfiable by
 * compact-runtime 0.16, because these features are era-impossible below ledger 9 rather than
 * merely absent:
 *
 * - **Cross-contract calls** need `crossContractCall` and a `ContractStateProvider` to resolve
 *   callee state. Neither exists on 0.16; nor does the per-callee `queryContexts` /
 *   `zswapLocalStates` / `contractStates` bookkeeping a call tree requires.
 * - **Contract events** need a `LogEvent`. The VM-level `log` gather op *does* exist under
 *   onchain-runtime-v3, but its payload is a bare `EncodedStateValue` against v4's
 *   `{ version, eventType, data }`, it carries no emitting-contract address, and 0.16 accumulates
 *   nothing on the context. Events on ledger 8 would have to be rebuilt against a different
 *   payload, not bound.
 *
 * Requiring this capability is therefore how a feature is kept off an older era's entry — absent,
 * not present and failing at run time (midnight-sdk#388). `test/typetests/effect/RuntimeBinding.tst.ts`
 * asserts `v0_16.ts` does *not* satisfy it, so the gate cannot be opened by accident.
 *
 * @internal
 */
export interface CallTreeRuntimeBinding {
  /**
   * The 0.19+ entry point: takes the circuit id *first* (0.16 takes the contract address) and
   * returns a call-tree-shaped context. The return type is what discriminates the lines — 0.16's
   * flat `{ currentPrivateState, currentZswapLocalState, currentQueryContext, costModel }` context
   * has no trace and no event log.
   */
  readonly createCircuitContext: (
    circuitId: string,
    ...rest: never[]
  ) => {
    readonly callContext: unknown;
    readonly callProofDataTrace: readonly unknown[];
    readonly events: readonly unknown[];
  };
}

// Tupled so the conditional never distributes over a union operand, and so a `never` on either
// side does not silently resolve to `true`.
type Requires<A, B, Message extends string> = [A] extends [B] ? never : Message;

/**
 * The relational half of the runtime binding contract: a union of human-readable messages for
 * every member pair that does **not** fit together, or `never` when the binding is sound.
 *
 * @remarks
 * `conformance.ts` asserts this is `never` for every binding, bound or not. Each check mirrors a
 * composition compact-js actually performs, so a line whose members drift apart fails the build
 * naming the relationship that broke rather than at a call site three packages away.
 *
 * @internal
 */
export type RuntimeBindingViolations<M extends RuntimeBinding> =
  | Requires<
      ReturnType<M['ContractState']['deserialize']>,
      InstanceType<M['ContractState']>,
      'ContractState.deserialize must return this line\'s ContractState'
    >
  // The zswap round-trip: a context rebuilt between calls decodes what the previous call encoded.
  | Requires<
      ReturnType<M['encodeZswapLocalState']>,
      Parameters<M['decodeZswapLocalState']>[0],
      'decodeZswapLocalState must accept what encodeZswapLocalState produces'
    >
  | Requires<
      ReturnType<M['decodeZswapLocalState']>,
      Parameters<M['encodeZswapLocalState']>[0],
      'encodeZswapLocalState must accept what decodeZswapLocalState produces'
    >
  // `emptyZswapLocalState` yields an *encoded* state (not a decoded one), so it is the decoder it
  // has to line up with. Getting this backwards is how the first draft of this contract was wrong.
  | Requires<
      ReturnType<M['emptyZswapLocalState']>,
      Parameters<M['decodeZswapLocalState']>[0],
      'decodeZswapLocalState must accept this line\'s empty ZswapLocalState'
    >
  // The CMA signing path, as composed by `ContractExecutable.createMaintenanceAuthority`.
  | Requires<
      ReturnType<M['makeSampleSigningKey']>,
      Parameters<M['signatureVerifyingKey']>[0],
      'signatureVerifyingKey must accept the key makeSampleSigningKey produces'
    >
  | Requires<
      ReturnType<M['makeSampleSigningKey']>,
      Parameters<M['signingKeyHex']>[0],
      'signingKeyHex must accept the key makeSampleSigningKey produces'
    >
  | Requires<
      ReturnType<M['signatureVerifyingKey']>,
      ConstructorParameters<M['ContractMaintenanceAuthority']>[0][number],
      'ContractMaintenanceAuthority must accept a committee of this line\'s verifying keys'
    >;
