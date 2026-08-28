/**
 * Hashing primitives for RelaySync/1 (transfer-protocol.md §7).
 *
 *  - xxh64Hex:  xxHash64, seed 0 — inline chunk integrity (fast, non-crypto)
 *  - sha256Hex: SHA-256 — strong full-file verification
 *  - fingerprint: Level-1 metadata verifier "size:mtime:xxh64(first 1 MiB)"
 *  - fileIdHash:  16-byte BLAKE2s truncation of the file id carried in
 *                 CHUNK_DATA binary headers
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { FILE_ID_HASH_BYTES } from "./constants.js";

// xxhashjs is CommonJS; load it via createRequire so ESM callers stay clean.
const require = createRequire(import.meta.url);
const XXH = require("xxhashjs") as {
  h64: (seed: number) => {
    update: (data: ArrayBuffer) => { digest: () => { toString: (radix: number) => string } };
    digest: () => { toString: (radix: number) => string };
  };
};

function toArrayBuffer(buf: Buffer | Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
  return ab;
}

/** xxHash64 (seed 0) as 16-char lowercase hex. */
export function xxh64Hex(data: Buffer | Uint8Array): string {
  return XXH.h64(0).update(toArrayBuffer(data)).digest().toString(16).padStart(16, "0");
}

/** xxHash64 (seed 0) as a BigInt — used for the CHUNK_DATA binary header. */
export function xxh64BigInt(data: Buffer | Uint8Array): bigint {
  return BigInt("0x" + xxh64Hex(data));
}

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Level-1 metadata fingerprint: always computed, goes in the manifest. */
export function fingerprint(opts: {
  size: number;
  mtime: number;
  firstMiB: Buffer | Uint8Array;
}): string {
  return `${opts.size}:${Math.floor(opts.mtime)}:${xxh64Hex(opts.firstMiB)}`;
}

/**
 * Spec fallback file id (transfer-protocol.md §5.1):
 *   "h:" + SHA-256(first 1 MiB ‖ size ‖ name)[:16]
 * Used by the reference sender, which — unlike a phone — has no stable
 * platform asset id.
 */
export function deriveFileId(opts: {
  name: string;
  size: number;
  firstMiB: Buffer | Uint8Array;
}): string {
  const h = createHash("sha256");
  h.update(new Uint8Array(toArrayBuffer(opts.firstMiB)));
  const tail = Buffer.alloc(8);
  tail.writeBigUInt64BE(BigInt(opts.size));
  h.update(tail);
  h.update(opts.name, "utf8");
  return "h:" + h.digest("hex").slice(0, 16);
}

/** 16-byte id carried in the CHUNK_DATA binary header. */
export function fileIdHash(fileId: string): Buffer {
  return createHash("blake2s256").update(fileId, "utf8").digest().subarray(0, FILE_ID_HASH_BYTES);
}
