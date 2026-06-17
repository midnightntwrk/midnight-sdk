/**
 * Standard event system constants matching midnight-compiler and onchain-vm.
 * @internal
 */

/** Phase 1 wire format version for events */
export const EVENT_VERSION = 1 as const;

/** Maximum serialized event size in bytes (512 KiB) */
export const MAX_EVENT_SIZE = 512 * 1024;

/** Matches MAX_LOG_SIZE in midnight-ledger onchain-vm/src/ops.rs */
export const MAX_LOG_SIZE = 2 ** 19; // 524,288 bytes
