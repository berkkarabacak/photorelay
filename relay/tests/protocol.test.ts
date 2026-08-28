/**
 * Protocol unit tests: golden vectors (wire format freeze), chunk map
 * semantics, path safety, and SAS properties.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { encodeChunkFrame, encodeFrame, FrameDecoder } from "../src/protocol/frames.js";
import { ChunkMap } from "../src/protocol/chunkmap.js";
import { MsgType, CHUNK_SIZE, ErrorCode } from "../src/protocol/constants.js";
import { fileIdHash, fingerprint, sha256Hex, xxh64Hex } from "../src/protocol/hash.js";
import { sanitizeRelPath, uniqueName } from "../src/protocol/paths.js";
import { computeSas, SAS_WORDS } from "../src/pairing/sas.js";

const vectors = (name: string) =>
  JSON.parse(fs.readFileSync(path.resolve("tests/vectors", name), "utf8"));

/* ------------------------------ golden frames ------------------------------ */

test("HELLO frame matches golden vector", () => {
  const v = vectors("frames.json");
  const hex = encodeFrame(MsgType.HELLO, v.hello.payload).toString("hex");
  assert.equal(hex, v.hello.frame_hex);
});

test("PLAN frame matches golden vector", () => {
  const v = vectors("frames.json");
  const hex = encodeFrame(MsgType.PLAN, v.plan.payload).toString("hex");
  assert.equal(hex, v.plan.frame_hex);
});

test("ERROR frame matches golden vector", () => {
  const v = vectors("frames.json");
  const hex = encodeFrame(MsgType.ERROR, v.error.payload).toString("hex");
  assert.equal(hex, v.error.frame_hex);
});

test("CHUNK_DATA binary frame matches golden vector", () => {
  const v = vectors("frames.json").chunk_data;
  const frame = encodeChunkFrame({
    fileIdHash: fileIdHash(v.file_id),
    offset: v.offset,
    data: Buffer.from(v.data_hex, "hex"),
    xxh64: BigInt("0x" + v.xxh64_hex),
  });
  assert.equal(frame.toString("hex"), v.frame_hex);
  assert.equal(fileIdHash(v.file_id).toString("hex"), v.file_id_hash_hex);
});

test("frame decoder round-trips CBOR and binary frames, incl. fragmentation", () => {
  const v = vectors("frames.json");
  const a = encodeFrame(MsgType.HELLO, v.hello.payload);
  const b = encodeChunkFrame({
    fileIdHash: fileIdHash(v.chunk_data.file_id),
    offset: v.chunk_data.offset,
    data: Buffer.from(v.chunk_data.data_hex, "hex"),
    xxh64: BigInt("0x" + v.chunk_data.xxh64_hex),
  });
  const wire = Buffer.concat([a, b]);
  const dec = new FrameDecoder();

  // Feed in 7-byte crumbs to prove TCP-segmentation safety.
  const frames = [];
  for (let i = 0; i < wire.length; i += 7) {
    frames.push(...dec.feed(wire.subarray(i, i + 7)));
  }
  assert.equal(frames.length, 2);
  const [hello, chunk] = frames;
  assert.equal(hello.type, MsgType.HELLO);
  assert.deepEqual((hello as { payload: unknown }).payload, v.hello.payload);
  assert.equal(chunk.type, MsgType.CHUNK_DATA);
  const c = chunk as { offset: number; data: Buffer; xxh64: bigint };
  assert.equal(c.offset, v.chunk_data.offset);
  assert.equal(c.data.toString("hex"), v.chunk_data.data_hex);
  assert.equal(c.xxh64, BigInt("0x" + v.chunk_data.xxh64_hex));
});

test("decoder rejects oversize frames", () => {
  const dec = new FrameDecoder();
  const evil = Buffer.alloc(4);
  evil.writeUInt32BE(5 * 1024 * 1024); // > MAX_FRAME_SIZE
  assert.throws(() => dec.feed(evil), /PROTOCOL_VIOLATION/);
});

/* ------------------------------ chunk map ------------------------------ */

test("chunk map matches golden vector", () => {
  const v = vectors("chunkmap.json");
  const map = new ChunkMap(v.total_chunks);
  for (const i of v.set_indices) assert.equal(map.set(i), true);
  assert.equal(Buffer.from(map.serialize()).toString("hex"), v.bytes_hex);
  assert.equal(map.toBase64(), v.base64);
  assert.equal(map.receivedChunks, v.received_chunks);
  assert.equal(map.firstMissing(), v.first_missing);
  assert.deepEqual(map.missing(), v.missing);
});

test("chunk map is idempotent and survives a serialize round-trip", () => {
  const map = new ChunkMap(5);
  assert.equal(map.set(2), true);
  assert.equal(map.set(2), false); // duplicate retransmission is a no-op
  const restored = ChunkMap.fromBase64(5, map.toBase64());
  assert.equal(restored.has(2), true);
  assert.equal(restored.complete, false);
  restored.set(0);
  restored.set(1);
  restored.set(3);
  restored.set(4);
  assert.equal(restored.complete, true);
});

/* ------------------------------ hashes ------------------------------ */

test("hash golden vectors", () => {
  const v = vectors("hashes.json");
  assert.equal(xxh64Hex(Buffer.alloc(0)), v.xxh64_empty);
  assert.equal(xxh64Hex(Buffer.from("PhotoRelay", "utf8")), v.xxh64_photorelay);
  assert.equal(sha256Hex(Buffer.alloc(0)), v.sha256_empty);
  assert.equal(sha256Hex(Buffer.from("PhotoRelay", "utf8")), v.sha256_photorelay);
  assert.equal(
    fingerprint({ size: 4_201_187, mtime: 1_723_459_822, firstMiB: Buffer.from("PhotoRelay", "utf8") }),
    v.fingerprint_example
  );
});

// Reference values from the xxHash spec — guards against a broken xxh64 impl
// silently producing self-consistent garbage.
test("xxh64 matches the published reference for the empty input", () => {
  assert.equal(xxh64Hex(Buffer.alloc(0)), "ef46db3751d8e999");
});

test("sha256 matches the published reference for the empty input", () => {
  assert.equal(sha256Hex(Buffer.alloc(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

/* ------------------------------ path safety ------------------------------ */

test("sanitizeRelPath blocks traversal and hostile names", () => {
  assert.equal(sanitizeRelPath("DCIM/Camera/IMG_1.jpg"), "DCIM/Camera/IMG_1.jpg");
  assert.equal(sanitizeRelPath("DCIM\\Camera\\IMG 1.jpg"), "DCIM/Camera/IMG 1.jpg"); // spaces kept
  assert.equal(sanitizeRelPath("C:/DCIM/IMG_1.jpg"), "DCIM/IMG_1.jpg");
  assert.equal(sanitizeRelPath("/etc/passwd"), "etc/passwd");
  assert.throws(() => sanitizeRelPath("../../windows/system32/evil.dll"), /PROTOCOL_VIOLATION/);
  assert.throws(() => sanitizeRelPath("a/../b"), /PROTOCOL_VIOLATION/);
  assert.equal(sanitizeRelPath('bad<>:"|?*name.jpg'), "bad_______name.jpg");
});

test("uniqueName collides politely", () => {
  const taken = new Set(["a.jpg", "a (2).jpg"]);
  const existing = (c: string) => taken.has(c);
  assert.equal(uniqueName(existing, "b.jpg"), "b.jpg");
  assert.equal(uniqueName(existing, "a.jpg"), "a (3).jpg");
});

/* ------------------------------ SAS ------------------------------ */

test("SAS matches golden vector and is input-order independent", () => {
  const v = vectors("sas.json");
  assert.deepEqual(computeSas(v.fp_a, v.fp_b, v.nonce), v.words);
  assert.deepEqual(computeSas(v.fp_b, v.fp_a, v.nonce), v.words);
});

test("SAS words come from the fixed list and are 6 in number", () => {
  const words = computeSas("A", "B", "nonce");
  assert.equal(words.length, 6);
  for (const w of words) assert.ok((SAS_WORDS as readonly string[]).includes(w));
});

/* ------------------------------ constants sanity ------------------------------ */

test("normative constants", () => {
  assert.equal(CHUNK_SIZE, 262_144);
  assert.equal(ErrorCode.CHUNK_MISMATCH, "CHUNK_MISMATCH");
});
