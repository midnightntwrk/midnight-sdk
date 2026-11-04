---
"@midnight-ntwrk/platform-js": patch
---

`SigningKey.Value` now accepts exactly 32 bytes. The previous 32–35 byte range (an "optional 3-byte version prefix") was accepted by no ledger: a longer key passed configuration validation and only failed when the contract was created. The key is also now documented as what it is — a secret (private) key for either the `schnorr` or `ecdsa` scheme, never a public key.
