# Compact.js 2.4.2 - Release Notes

### Version 2.4.2

**Version:** 2.4.2  
**Date:** 2026-02-17  
**Environment:** Preprod, Preview

### High-level summary 

Provides a Typescript-based execution environment for smart contracts
compiled with the [Compact](https://docs.midnight.network/develop/reference/compact/) language. This release
is the first initial release of Compact.js, and is used internally by Midnight.js and the Node Toolkit. The
SDK provides a core library for tool and framework developers, and a _command_ package that encapsulates the
library provided capabilities as commands that can be integrated into command line applications built with
[Effect's CLI](https://effect-ts.github.io/effect/docs/cli).

### Audience

This release is relevant for developers who:
- Build tools or frameworks that deploy and otherwise interact with contracts on the Midnight blockchain.

### New features

**Core Library**

**Description:** `@midnight-ntwrk/compact-js` provides the core capabilities to build `CompiledContract`
instances from the compiled assets produced by the Compact compiler. These can then be transformed
into `ContractExecutable` instances upon which contract instances can be initialized and executed.

---

**Commanding**

**Description:** `@midnight-ntwrk/compact-js-command` provides commands that consume a TypeScript based configuration
defining a `CompiledContract` and exposes it via a command line interface.

### New features requiring configuration updates

N/A

### Improvements

The `circuit` command present in the `@midnight-ntwrk/compact-js-command` package now accepts an optional
`--output-oc` option that when supplied, writes the on-chain (public) state data from the circuit invocation to
the specified file path.

It allows for scenarios where callers are required to batch circuit invocations into a single transaction since
the on-chain state from each invocation can be used to setup the next invocation that is to be included in the
transaction.

### Deprecations

N/A

### Breaking changes or required actions for developers

While developers can use Compact.js to interact with Compact compiled contracts at runtime, this release is used
internally by the Midnight.js contracts package (`@midnight-ntwrk/midnight-js-contracts`), to deploy contracts
and invoke their circuits. It is recommended that dApp developers continue to use Midnight.js for this capability.

### Known issues

N/A

### Fixed defect list

N/A
