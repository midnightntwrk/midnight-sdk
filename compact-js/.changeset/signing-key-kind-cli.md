---
"@midnight-ntwrk/compact-js": patch
"@midnight-ntwrk/compact-js-command": minor
---

Add a `--signing-kind` option (`schnorr` or `ecdsa`) to the CLI. On `deploy` it feeds `keys.signingKind` through the configuration provider, overriding the `KEYS_SIGNING_KIND` environment variable and the contract configuration; on `maintain contract` it sets the kind of the new authority key (defaulting to `schnorr`) without retagging the current key that signs the update. Choosing `ecdsa` on a ledger 8 build fails with the existing "unsupported signature scheme" error. The error raised when a signature verifying key cannot be created now names the scheme and the key length instead of interpolating the signing key itself.
