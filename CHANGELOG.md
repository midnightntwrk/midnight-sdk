# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [compact-js 2.5.1] - 2026-05-18

### Removed

- **`compact-js-command`**: The `--network` / `-n` CLI option has been removed. `NetworkId` is no longer required by the serialization functions of Ledger or Compact Runtime.

### Changed

- **`@midnight-ntwrk/compact-js`**: `ContractExecutable.Context` no longer requires `Configuration.Network`. Layers providing `Configuration.Network` can be safely removed from application code.
  ```diff
  - type Context = ZKConfiguration | Configuration.Keys | Configuration.Network
  + type Context = ZKConfiguration | Configuration.Keys
  ```

### Dependencies

- CompactC: `0.30.0` → `0.31.0`
- compact-runtime: `0.15.0` → `0.16.0`

### Security

- Resolved 19 dependency vulnerabilities (GHSAs)
