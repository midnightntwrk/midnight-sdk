# Compact.js 2.5.0 - Release Notes

### Version 2.5.0

**Version:** 2.5.0  
**Date:** 2026-03-20  
**Environment:** Preprod, Preview, Mainnet  

### High-level summary 

Provides a Typescript-based execution environment for smart contracts
compiled with the [Compact](https://docs.midnight.network/develop/reference/compact/) language. The
SDK provides a core library for tool and framework developers, and a _command_ package that encapsulates the
library provided capabilities as commands that can be integrated into command line applications built with
[Effect's CLI](https://effect-ts.github.io/effect/docs/cli).

### Audience

This release is relevant for developers who:
- Build tools or frameworks that deploy and otherwise interact with contracts on the Midnight blockchain.

### New features

N/A

### New features requiring configuration updates

N/A

### Improvements

The `circuit` command present in the `@midnight-ntwrk/compact-js-command` package now accepts an optional
`--input-ledger-params` option that represents a file path to a binary serialized instance of `LedgerParameters`.
If not specified, then Compact.js will default to the initial parameters provided by the Ledger.

### Deprecations

N/A

### Breaking changes or required actions for developers

This version of Compact.js has been built against `@midnight-ntwrk/compact-runtime` version `0.15.0` which in
turn will require `compactc` version `0.30.0`. Contracts will have to be re-compiled against these dependencies.

### Known issues

N/A

### Fixed defect list

N/A