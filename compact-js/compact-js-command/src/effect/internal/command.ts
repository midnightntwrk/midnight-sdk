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

import type { Command } from '@effect/cli';
import type { FileSystem, Path } from '@effect/platform';
import { type PlatformError } from '@effect/platform/Error';
import { NodeContext } from '@effect/platform-node';
import * as Ansi from '@effect/printer-ansi/Ansi';
import * as Doc from '@effect/printer-ansi/AnsiDoc';
import { type ContractExecutable, ContractExecutableRuntime, type ContractRuntimeError, type ZKConfiguration } from '@midnight-ntwrk/compact-js/effect';
import { ZKFileConfiguration } from '@midnight-ntwrk/compact-js-node/effect';
import * as Configuration from '@midnight-ntwrk/platform-js/effect/Configuration';
import { ConfigError as EffectConfigError, type ConfigProvider, Console, DateTime, Duration, Effect, Layer } from 'effect';

import * as CompiledContractReflection from '../CompiledContractReflection.js';
import * as ConfigCompilationError from '../ConfigCompilationError.js';
import * as ConfigCompiler from '../ConfigCompiler.js';
import * as ConfigError from '../ConfigError.js';
import * as CommandConfigProvider from './commandConfigProvider.js';
import type * as EraBinding from './era/binding.js';
import * as InternalOptions from './options.js';

/** How far into the future a generated intent's TTL is set. */
const INTENT_TTL = Duration.minutes(10);

/**
 * Applies a duration to the current date/time, returning a date/time that is in the future.
 *
 * @param duration A `Duration` describing how far into the future the returned date/time should be.
 * @returns An `Effect` that yields a `Date` that will be in the future from `duration`.
 */
const ttl: (duration: Duration.Duration) => Effect.Effect<Date> = (duration) =>
  DateTime.now.pipe(Effect.map((utcNow) => DateTime.toDate(DateTime.addDuration(utcNow, duration))));

/**
 * The intent operations every command shares, instantiated for one era.
 *
 * @remarks
 * `tryLedger` is the era's own `Ledger.tryConvert` under the name the command handlers know it by,
 * so there is exactly one copy of the boundary handling. Ledger bindings signal rejection by
 * *throwing* — `Intent.addMaintenanceUpdate()` throws `'expected instance of MaintenanceUpdate'`
 * when handed a value built against a different WASM instance, which is exactly what a config and a
 * `--ledger-era` that disagree produce. A throw inside `Effect.gen` becomes a defect, and a defect
 * escapes both the `Effect.mapError(...)` a handler ends with *and* {@link invocationHandler}'s
 * `Effect.catchAll(reportContractExecutionError)`: the user gets a raw fiber dump instead of the
 * CLI's formatted report. Every ledger call made outside the facade goes through here.
 *
 * The compact-runtime seam has the same hazard and the same wrapper: reach for the era's
 * `CompactRuntime.tryRuntime` at a runtime call site rather than adding a third alias.
 */
export interface Intents {
  readonly tryLedger: <A>(
    message: string,
    evaluate: () => A extends PromiseLike<unknown> ? never : A
  ) => Effect.Effect<A, ContractRuntimeError.ContractRuntimeError>;

  /**
   * Creates an empty ledger `Intent` with the command-wide TTL applied. Every command emits its
   * result as an intent with the same TTL policy; single-sourcing it here keeps the default in one
   * place.
   */
  readonly newIntent: () => Effect.Effect<
    EraBinding.CommandIntent,
    ContractRuntimeError.ContractRuntimeError
  >;

  /**
   * Serializes a ledger `Intent`, ready for writing to a command's output file.
   *
   * @remarks
   * Takes {@link EraBinding.CommandIntent} rather than a bare `{ serialize(): Uint8Array }` duck
   * type: ledger contract states are serialized through `tryLedger` with that identical shape
   * elsewhere in this package, so a structural parameter would accept one, write a contract state
   * into the intent output file, and still report 'Failed to serialize the intent' — with nothing
   * catching it until the file is deserialized as an `Intent` at submission. In a seam built to
   * make era and type mismatches loud, this is the one signature that would let a wrong type
   * through quietly. `CommandIntent` also demands the three `add*` members, so a contract state
   * does not satisfy it.
   */
  readonly serializeIntent: (
    intent: EraBinding.CommandIntent
  ) => Effect.Effect<Uint8Array, ContractRuntimeError.ContractRuntimeError>;
}

/**
 * Builds the shared intent operations for one era.
 *
 * @param ledger The era's `Ledger` facade — `@midnight-ntwrk/compact-js/v8/effect`'s or
 * `/v9/effect`'s. The era arrives as an argument here exactly as it does in `compact-js`'s
 * `internal/executable.ts`; nothing in this module names one.
 *
 * @internal
 */
export const makeIntents: (ledger: EraBinding.CommandLedger) => Intents = (ledger) => {
  const tryLedger: Intents['tryLedger'] = ledger.tryConvert;

  return {
    tryLedger,
    newIntent: () =>
      ttl(INTENT_TTL).pipe(
        Effect.flatMap((date) => tryLedger('Failed to create intent', () => ledger.Intent.new(date)))
      ),
    serializeIntent: (intent) => tryLedger('Failed to serialize the intent', () => intent.serialize())
  };
};

/**
 * Renders a link in a cause chain as text.
 *
 * @remarks
 * `Doc.text` throws on a non-string, and a cause is not necessarily an `Error`:
 * `ContractExecutable.circuit` maps a rejected witness with `Effect.tryPromise({ catch: identity })`,
 * so a witness that does `throw 'insufficient balance'` puts a bare string in the chain. The
 * reporter is what turns a failure into output, so a throw *here* is the silent exit it exists to
 * prevent — it escapes {@link invocationHandler}'s `catchAll` as a defect.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const messageOf = (errOrCause: any): string =>
  typeof errOrCause?.message === 'string' ? errOrCause.message : String(errOrCause);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reportCausableError: (err: any) => Effect.Effect<void, never> =
  (err) => Effect.gen(function* () {
    const buildCauseDocs = () => {
      const docs: Doc.Doc<unknown>[] = [];
      const buildCauseDoc = (errOrDoc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (Doc.isDoc(errOrDoc)) {
          return docs.push(errOrDoc);
        }
        docs.push(Doc.text(messageOf(errOrDoc)));
        if (errOrDoc?.cause) {
          buildCauseDoc(errOrDoc.cause);
        }
      }
      buildCauseDoc(err.cause);
      return docs;
    }
    let errorDoc: Doc.AnsiDoc = Doc.text(messageOf(err));
    if (err.cause) {
      errorDoc = errorDoc.pipe(
        Doc.catWithLineBreak(Doc.annotate(Doc.text('(cause)'), Ansi.italicized)),
        Doc.catWithLineBreak(Doc.hsep([
          Doc.text('..'),
          Doc.align(Doc.vsep(buildCauseDocs()))
        ]))
      ) as Doc.AnsiDoc
    }
    yield* Console.log(Doc.render(errorDoc, {style: 'pretty'}));
    if (!process.env['VITEST']) {
      process.exit(1); // Terminate with non-zero exit code on any causable error (if not running inside a test).
    }
  });

/**
 * Pretty prints a configuration error from {@link ConfigCompiler.ConfigCompiler | ConfigCompiler} implementations.
 *
 * @param err The {@link ConfigError.ConfigError | ConfigError} or 
 * {@link ConfigCompilationError.ConfigCompilationError | ConfigCompilationError} to report for.
 * @returns An `Effect` that writes `err` to the console.
 */
export const reportContractConfigError: (err: ConfigError.ConfigError | ConfigCompilationError.ConfigCompilationError) =>
  Effect.Effect<void, never> =
    (err) => Effect.gen(function* () {
      if (err.cause && err.cause instanceof ConfigCompilationError.ConfigCompilationError) {
        return yield* reportCausableError({
          message: err.message,
          cause: Doc.annotate(Doc.text(err.cause.message), Ansi.italicized).pipe(
            Doc.catWithLineBreak(Doc.hsep([
              Doc.text('..'),
              Doc.align(Doc.vsep(err.cause.diagnostics.map((d) => Doc.text(d.messageText))))
            ]))
          )
        });
      }
      yield* reportCausableError(err);
    });

const ConfigErrorType = {
  MissingData: 1,
  InvalidData: 2,
  UnsupportedData: 4
}
type ConfigErrorType = typeof ConfigErrorType[keyof typeof ConfigErrorType];
type ReportedConfigError = readonly [flag: ConfigErrorType, messages: string[]];

const reduceConfigError = (err: EffectConfigError.ConfigError): ReportedConfigError =>
  EffectConfigError.reduceWithContext<undefined, ReportedConfigError>(err, undefined, {
    andCase: (_, left, right) => [left[0] | right[0], [...left[1], ...right[1]]],
    orCase: (_, left, right) => left || right,
    missingDataCase: (_, path) => [ConfigErrorType.MissingData, [`Missing data at path '${path.join(',')}'`]],
    invalidDataCase: (_, path) => [ConfigErrorType.InvalidData, [`Invalid data at path '${path.join(',')}'`]],
    sourceUnavailableCase: (_, path, message, cause) => [ConfigErrorType.MissingData, [`The underlying source for data at path '${path.join(',')}' could not be found`, message, cause.toString()]],
    unsupportedCase: (_, path) => [ConfigErrorType.UnsupportedData, [`Unsupported data at path '${path.join(',')}'`]],
  });

/**
 * Pretty prints a configuration or contract execution error.
 *
 * @param err The {@link ContractExecutable.ContractExecutionError | ContractExecutionError} or `ConfigError` to
 * report for.
 * @returns An `Effect` that writes `err` to the console.
 */
export const reportContractExecutionError: (
  err: ContractExecutable.ContractExecutionError | EffectConfigError.ConfigError | PlatformError
) => Effect.Effect<void, never> =
  (err) => Effect.gen(function* () {
    if (EffectConfigError.isConfigError(err)) {
      const [errorType, messages] = reduceConfigError(err);
      yield* reportCausableError({
        message: 'Invalid, missing, or unsupported configuration',
        cause: Doc.vsep(messages.map(Doc.text))
      });
      if (errorType & ConfigErrorType.InvalidData || errorType & ConfigErrorType.MissingData) {
        yield* Console.log();
        yield* Console.log(Doc.render(
          Doc.vsep([
            Doc.text('The reported error indicates that configuration may be missing, or is invalid.'),
            Doc.text('Check the values provided in the \'config\' property of the specified \'contract.config.ts\' file,'),
            Doc.text('or the supplied environment variables, or the values supplied as options on the command line.')
          ]),
          { style: 'compact' }
        ));
      }
      if (errorType & ConfigErrorType.UnsupportedData) {
        yield* Console.log();
        yield* Console.log(Doc.render(
          Doc.vsep([
            Doc.text('The reported error indicates that unsupported or incompatible configuration values was detected.'),
            Doc.text('Check the values (along with their formats and lengths), provided in the \'config\' property of'),
            Doc.text('the specified \'contract.config.ts\' file, or the supplied environment variables, or the values'),
            Doc.text('supplied as options on the command line.')
          ]),
          { style: 'compact' }
        ));
      }
      return;
    }
    yield* reportCausableError(err);
  });

/**
 * Reports a defect — a failure the command did not model — rather than letting it exit silently.
 *
 * @remarks
 * The backstop for the whole CLI. `Effect.catchAll` covers the *failure* channel only, so a throw
 * evaluated in an `Effect.gen` body passes every recovery this module installs and reaches
 * `NodeRuntime.runMain({ disableErrorReporting: true })` in `src/index.ts`, which exits non-zero
 * printing nothing. That is the worst outcome the CLI can produce: the user has no message, no exit
 * context, and nothing to report.
 *
 * Individual defect sources are worth fixing at the source — and are, as they are found — but this
 * exists so that the *next* one is a legible bug report instead of a silent exit. The wording
 * separates "your input was wrong" from "this is our bug", because a defect is always the latter.
 *
 * @internal
 */
export const reportUnhandledDefect: (defect: unknown) => Effect.Effect<void, never> = (defect) =>
  reportCausableError({
    message: 'Internal error: the command failed in a way it does not handle. Please report this.',
    cause: defect
  });

/** @internal */
export type GlobalOptions = Command.Command.ParseConfig<typeof GlobalOptions>;
/** @internal */
export const GlobalOptions = {
  config: InternalOptions.config,
  coinPublicKey: InternalOptions.coinPublicKey,
  ledgerEra: InternalOptions.ledgerEra
}

/**
 * Creates a default layer that provides services for executing Compact contracts via a command line.
 *
 * @param configProvider 
 * @param zkBaseFolderPath A base path to a folder containing the ZK assets for the contract that will be in
 * scope during invocation
 *
 * @category layers
 */
export const layer: (configProvider: ConfigProvider.ConfigProvider, zkBaseFolderPath: string) =>
  Layer.Layer<
    ZKConfiguration.ZKConfiguration | Configuration.Keys | Configuration.Network | NodeContext.NodeContext,
    EffectConfigError.ConfigError
  > = (configProvider, zkBaseFolderPath) =>
    Layer.mergeAll(ZKFileConfiguration.layer(zkBaseFolderPath), Configuration.layer).pipe(
      Layer.provideMerge(NodeContext.layer),
      Layer.provide(Layer.setConfigProvider(configProvider))
    );

/**
 * A command handler, once an era has been selected for it.
 *
 * @internal
 */
export type CommandHandler<I> = (
  inputs: I & GlobalOptions,
  module: ConfigCompiler.ConfigCompiler.ModuleSpec
) => Effect.Effect<
  void,
  ContractExecutable.ContractExecutionError | EffectConfigError.ConfigError,
  | Path.Path
  | FileSystem.FileSystem
  | CompiledContractReflection.CompiledContractReflection
  // The executable's own services. Declared rather than fictionalised away: `ModuleSpec` used to
  // type the executable with no requirements at all, which only held because a dynamically
  // imported module is never checked against its declared shape. `invocationHandler` discharges
  // them with the `ContractExecutableRuntime` it builds from the configuration's ZK assets and
  // keys, which is the one place that can.
  | ContractExecutable.ContractExecutable.Context
>;

/**
 * Fails when the era `--ledger-era` selected and the era the configuration's executable was built
 * for are not the same.
 *
 * @remarks
 * There are two era choices in play and the CLI only makes one of them. `--ledger-era` picks the
 * era of the intents, state files and conversions the command produces; the *executable's* era was
 * fixed by the import at the top of `contract.config.ts` (`/v8/effect` or `/v9/effect`). Left
 * unreconciled, a disagreement surfaces several conversions later as a WASM rejection — `expected
 * instance of ContractState` — whose message names neither era and points at neither decision.
 *
 * An executable from a compact-js older than `ContractExecutable.era` reports `undefined`; that is
 * treated as "unknown", not as a mismatch, so a configuration that worked before this check existed
 * still works. Such a mismatch still fails, just at the boundary and with the older message.
 */
const checkEra = (
  configFilePath: string,
  selected: number,
  executable: { readonly era?: { readonly ledger: number } }
): Effect.Effect<void, ConfigError.ConfigError> =>
  executable.era === undefined || executable.era.ledger === selected
    ? Effect.void
    : ConfigError.make(
        `The contract configuration '${configFilePath}' builds its executable against ledger era ` +
          `${executable.era.ledger}, but --ledger-era selected ${selected}. Import ` +
          `'@midnight-ntwrk/compact-js/v${selected}/effect' in the configuration, or run with ` +
          `--ledger-era ${executable.era.ledger}.`
      );

/**
 * Creates an appropriate runtime for a command handler, having first resolved the era the
 * invocation selected.
 *
 * @remarks
 * The parameter is a *selector* rather than a handler because the handler is era-specific: each
 * command module is a factory applied once per era (`internal/era/v8.ts`, `internal/era/v9.ts`),
 * and this is where `--ledger-era` stops being a validated-then-discarded option and becomes the
 * choice of which of those applications runs.
 *
 * It takes the era as a *number* and resolves nothing itself, so this module does not import the
 * era registry. That keeps the graph acyclic — the registry imports the command modules, which
 * import this one — and leaves `effect/index.ts`, which is downstream of all of them, as the single
 * place where a command is tied to the handler it wants.
 *
 * @param handlerForEra Picks this command's handler for the selected ledger era, e.g.
 * `(era) => EraRegistry.forLedgerEra(era).circuit`.
 * @returns An `Effect` that adapts the selected handler by compiling the configured configuration
 * file, reconciling its era against the selected one, and invoking the handler within an
 * appropriate `ContractExecutableRuntime`.
 */
export const invocationHandler: <I>(
  handlerForEra: (ledgerEra: number) => CommandHandler<I>
) =>
  (inputs: I & GlobalOptions) =>
    Effect.Effect<
      void,
      ConfigError.ConfigError | EffectConfigError.ConfigError,
      Path.Path | FileSystem.FileSystem | ConfigCompiler.ConfigCompiler
    > =
    (handlerForEra) => (inputs) => Effect.gen(function* () {
      // Option parsing has already rejected any era this build has no command set for, so the
      // selector below cannot fail to resolve one.
      const handler = handlerForEra(inputs.ledgerEra);
      const configCompiler = yield* ConfigCompiler.ConfigCompiler;
      const moduleSpec = yield* configCompiler.compile(inputs.config);
      const { moduleImportDirectoryPath, module: { default: contractModule } } = moduleSpec;

      yield* checkEra(inputs.config, inputs.ledgerEra, contractModule.contractExecutable);

      const contractRuntime = ContractExecutableRuntime.make(
        layer(
          CommandConfigProvider.make(contractModule.config ?? {}, InternalOptions.asConfigProvider(inputs)),
          moduleImportDirectoryPath
        )
      );

      yield* handler(inputs, moduleSpec).pipe(
        Effect.provide(CompiledContractReflection.layer(moduleImportDirectoryPath).pipe(
          Layer.provideMerge(NodeContext.layer)
        )),
        contractRuntime.runFork,
        Effect.catchAll(reportContractExecutionError)
      );
    }).pipe(
      Effect.catchAll(reportContractConfigError),
      // Outermost, so it covers the handler, the config compilation and the era reconciliation
      // alike. `catchAll` above it sees failures only; without this, a defect from any of them is
      // an exit code and an empty terminal.
      Effect.catchAllDefect(reportUnhandledDefect)
    );
