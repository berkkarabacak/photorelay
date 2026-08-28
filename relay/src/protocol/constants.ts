/**
 * RelaySync/1 normative constants — docs/transfer-protocol.md §8.
 * Both ends of every connection must use these exact values.
 */

export const PROTOCOL_VERSION = "RelaySync/1";

/** Chunk size in bytes (256 KiB). */
export const CHUNK_SIZE = 262_144;

/** Maximum frame size including the type byte (4 MiB). */
export const MAX_FRAME_SIZE = 4 * 1024 * 1024;

/** Default sender window: unacknowledged chunks in flight. */
export const MAX_IN_FLIGHT = 16;

/** Heartbeat cadence and dead-peer limit. */
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_MISS_LIMIT = 3;

/** Reconnect backoff ladder (ms), capped at the last value, ±25% jitter. */
export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/** Per-chunk retry limit before a file is marked needs_attention. */
export const CHUNK_RETRY_LIMIT = 5;

/** Manifest pagination. */
export const MANIFEST_PAGE_SIZE = 500;

/** Length of the hashed file-id carried in CHUNK_DATA headers. */
export const FILE_ID_HASH_BYTES = 16;

/** Message type codes (transfer-protocol.md §3.3). */
export const MsgType = {
  HELLO: 0x01,
  HELLO_ACK: 0x02,
  MANIFEST: 0x03,
  MANIFEST_ACK: 0x04,
  PLAN: 0x05,
  CHUNK_DATA: 0x06,
  CHUNK_ACK: 0x07,
  FILE_DONE: 0x08,
  FILE_VERIFIED: 0x09,
  PAUSE: 0x0a,
  RESUME_REQ: 0x0b,
  HEARTBEAT: 0x0c,
  BYE: 0x7e,
  ERROR: 0x7f,
} as const;
export type MsgTypeCode = (typeof MsgType)[keyof typeof MsgType];

/** Structured error codes (transfer-protocol.md §9). */
export const ErrorCode = {
  DISK_FULL: "DISK_FULL",
  CHUNK_MISMATCH: "CHUNK_MISMATCH",
  VERIFY_FAILED: "VERIFY_FAILED",
  FILE_GONE: "FILE_GONE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  UNPAIRED: "UNPAIRED",
  PROTOCOL_VIOLATION: "PROTOCOL_VIOLATION",
  BUSY: "BUSY",
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
