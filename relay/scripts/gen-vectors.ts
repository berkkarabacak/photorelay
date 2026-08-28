/**
 * Regenerate the golden test vectors in tests/vectors/.
 *
 * Vectors are produced by the reference implementation and frozen in JSON.
 * Tests assert the implementation keeps matching them byte-for-byte, so any
 * accidental wire-format drift breaks CI loudly.
 *
 *   npm run gen-vectors
 */
import fs from "node:fs";
import path from "node:path";
import { encodeChunkFrame, encodeFrame } from "../src/protocol/frames.js";
import { ChunkMap } from "../src/protocol/chunkmap.js";
import { MsgType, PROTOCOL_VERSION, CHUNK_SIZE } from "../src/protocol/constants.js";
import { fileIdHash, fingerprint, sha256Hex, xxh64Hex } from "../src/protocol/hash.js";
import { computeSas } from "../src/pairing/sas.js";

const outDir = path.resolve("tests/vectors");
fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", name);
};

/* ------------------------------ frames ------------------------------ */

const helloPayload = {
  protocol: PROTOCOL_VERSION,
  session_id: "8f3a2c10-0000-4000-8000-00000000c21",
  device_name: "Pixel 8 Pro",
  platform: "android",
};
const planPayload = {
  items: [
    { file_id: "h:0a1b2c3d4e5f6071", action: "SEND" },
    {
      file_id: "h:1122334455667788",
      action: "RESUME",
      have_bytes: 2 * CHUNK_SIZE,
      chunk_map: new ChunkMap(5, new Uint8Array([0b00000111])).toBase64(),
    },
    { file_id: "h:99aabbccddeeff00", action: "SKIP", reason: "duplicate", stored_as: "2026/2026-08/IMG_1.jpg" },
  ],
};
const errorPayload = {
  code: "CHUNK_MISMATCH",
  retryable: true,
  message: "xxHash64 mismatch — re-send chunk",
  file_id: "h:0a1b2c3d4e5f6071",
  offset: CHUNK_SIZE,
};

// Deterministic 300-byte chunk payload
const chunkData = Buffer.alloc(300);
for (let i = 0; i < chunkData.length; i++) chunkData[i] = (i * 7 + 13) % 256;
const chunkFileId = "h:0a1b2c3d4e5f6071";

write("frames.json", {
  note: "RelaySync/1 golden frames. length prefix is big-endian and includes the type byte.",
  hello: { payload: helloPayload, frame_hex: encodeFrame(MsgType.HELLO, helloPayload).toString("hex") },
  plan: { payload: planPayload, frame_hex: encodeFrame(MsgType.PLAN, planPayload).toString("hex") },
  error: { payload: errorPayload, frame_hex: encodeFrame(MsgType.ERROR, errorPayload).toString("hex") },
  chunk_data: {
    file_id: chunkFileId,
    file_id_hash_hex: fileIdHash(chunkFileId).toString("hex"),
    offset: CHUNK_SIZE,
    data_hex: chunkData.toString("hex"),
    xxh64_hex: xxh64Hex(chunkData),
    frame_hex: encodeChunkFrame({
      fileIdHash: fileIdHash(chunkFileId),
      offset: CHUNK_SIZE,
      data: chunkData,
      xxh64: BigInt("0x" + xxh64Hex(chunkData)),
    }).toString("hex"),
  },
});

/* ------------------------------ chunk map ------------------------------ */

const map = new ChunkMap(19);
for (const i of [0, 1, 2, 5, 11, 18]) map.set(i);
write("chunkmap.json", {
  note: "LSB-first bit order: chunk i -> byte (i>>3), bit (i&7).",
  total_chunks: 19,
  set_indices: [0, 1, 2, 5, 11, 18],
  bytes_hex: Buffer.from(map.serialize()).toString("hex"),
  base64: map.toBase64(),
  received_chunks: map.receivedChunks,
  first_missing: map.firstMissing(),
  missing: map.missing(),
});

/* ------------------------------ hashes ------------------------------ */

write("hashes.json", {
  note: "xxHash64 seed 0; fingerprint = size:mtime:xxh64(first 1 MiB).",
  xxh64_empty: xxh64Hex(Buffer.alloc(0)),
  xxh64_photorelay: xxh64Hex(Buffer.from("PhotoRelay", "utf8")),
  sha256_empty: sha256Hex(Buffer.alloc(0)),
  sha256_photorelay: sha256Hex(Buffer.from("PhotoRelay", "utf8")),
  fingerprint_example: fingerprint({ size: 4_201_187, mtime: 1_723_459_822, firstMiB: Buffer.from("PhotoRelay", "utf8") }),
});

/* ------------------------------ SAS ------------------------------ */

const fpA = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const fpB = "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00";
const nonce = "AQIDBAUGBwgJCgsMDQ4PEA";
write("sas.json", {
  note: "SAS = first 30 bits of SHA-256(sorted(fpA,fpB)|nonce), 6 words x 5 bits.",
  fp_a: fpA,
  fp_b: fpB,
  nonce,
  words: computeSas(fpA, fpB, nonce),
  words_reversed_inputs: computeSas(fpB, fpA, nonce),
});

console.log("vectors regenerated.");
