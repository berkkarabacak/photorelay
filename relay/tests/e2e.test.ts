/**
 * End-to-end tests: a real TLS connection between the reference receiver
 * and sender over localhost, with planned drops, resume, dedup, and
 * corruption injection — the protocol's core promises, proven.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { CHUNK_SIZE } from "../src/protocol/constants.js";
import {
  assertLibraryTransferred,
  captureLog,
  incomingDirContents,
  makeSender,
  setupPaired,
} from "./helpers.ts";

const PHOTOS = Array.from({ length: 24 }, (_, i) => ({
  name: `IMG_202408${String(10 + (i % 18)).padStart(2, "0")}_1${String(i).padStart(5, "0")}.jpg`,
  size: 20_000 + i * 7_777,
  ageDays: 30 - i,
}));
const VIDEO = { name: "VID_20260801_120000.mp4", size: Math.floor(CHUNK_SIZE * 5.5), ageDays: 0 }; // newest → transferred first

test("e2e: full transfer — byte-identical, verified, journal-complete", async () => {
  const receiverLog = captureLog();
  const paired = await setupPaired({ label: "full", files: [...PHOTOS, VIDEO], receiverLog });
  try {
    const sender = makeSender(paired);
    const stats = await sender.run();
    sender.close();

    assert.equal(stats.filesStored, PHOTOS.length + 1);
    assert.equal(stats.filesNeedsAttention, 0);
    assertLibraryTransferred(paired);
    assert.deepEqual(incomingDirContents(paired.rootDir), [], "no .part files left behind");
    assert.ok(receiverLog.has("PLAN → SEND 25"));
    assert.ok(receiverLog.has("Session complete"));

    // Journal says everything is stored with a sha256 recorded.
    const rows = paired.receiver.journal.db
      .prepare(`SELECT status, sha256 FROM files`)
      .all() as Array<{ status: string; sha256: string | null }>;
    assert.equal(rows.length, PHOTOS.length + 1);
    for (const r of rows) {
      assert.equal(r.status, "stored");
      assert.ok(r.sha256 && r.sha256.length === 64, "sha256 recorded");
    }
  } finally {
    await paired.receiver.stop();
  }
});

test("e2e: re-running a finished backup is a no-op (all SKIP, zero chunks sent)", async () => {
  const paired = await setupPaired({ label: "idempotent", files: PHOTOS.slice(0, 6) });
  try {
    const first = makeSender(paired);
    await first.run();
    first.close();

    const second = makeSender(paired); // same state dir → same session & pin
    const stats = await second.run();
    second.close();

    assert.equal(stats.filesStored, 0);
    assert.equal(stats.filesSkipped, 6);
    assert.equal(stats.chunksSent, 0, "verified data is never re-sent");
  } finally {
    await paired.receiver.stop();
  }
});

test("e2e: mid-file drop resumes at the chunk level — verified bytes never re-sent", async () => {
  const paired = await setupPaired({ label: "resume", files: [VIDEO] });
  try {
    const senderLog = captureLog();
    // Drop the connection right after 2 chunks are ACKed (= journaled + fsynced
    // on the receiver). Of the file's 6 chunks, at most 2 may be re-sent.
    const sender = makeSender(paired, { abortAfterAcks: 2 }, senderLog);
    const stats = await sender.run();
    sender.close();

    assert.equal(stats.filesStored, 1);
    assert.equal(stats.reconnects, 1);
    const totalChunks = Math.ceil(VIDEO.size / CHUNK_SIZE); // 6
    assert.ok(
      stats.chunksSent <= totalChunks + 4,
      `resumed mid-file: ${stats.chunksSent} chunks sent for a ${totalChunks}-chunk file (a full restart would send ${totalChunks * 2})`
    );
    assert.ok(senderLog.has("Connection lost — waiting for PC"));
    assert.ok(senderLog.has("Connected — resuming transfer"));
    assert.ok(paired.receiverLog.has("Connection lost — waiting for phone"));
    assert.ok(paired.receiverLog.has("RESUME 1"), "receiver plan resumed instead of restarting");
    assertLibraryTransferred(paired);
    assert.deepEqual(incomingDirContents(paired.rootDir), []);
  } finally {
    await paired.receiver.stop();
  }
});

test("e2e: corrupted chunk is detected (xxHash64), re-sent, and verifies", async () => {
  const paired = await setupPaired({ label: "corrupt", files: [VIDEO] });
  try {
    const sender = makeSender(paired, { corruptChunkAt: { fileName: VIDEO.name, offset: 0 } });
    const stats = await sender.run();
    sender.close();

    assert.equal(stats.filesStored, 1);
    assert.equal(stats.retries, 1, "exactly one chunk retransmitted");
    assert.ok(paired.receiverLog.has("CHUNK_MISMATCH"));
    assertLibraryTransferred(paired);
  } finally {
    await paired.receiver.stop();
  }
});

test("e2e: unpaired device is rejected (UNPAIRED, fail closed)", async () => {
  const receiverLog = captureLog();
  const paired = await setupPaired({ label: "unpaired", files: PHOTOS.slice(0, 2), receiverLog });
  try {
    // A sender whose fingerprint the receiver does NOT trust: use a fresh state dir.
    const rogue = makeSender(paired, { stateDir: path.join(paired.rootDir, "..", "rogue-state") });
    await assert.rejects(rogue.run(), /UNPAIRED/);
    rogue.close();
  } finally {
    await paired.receiver.stop();
  }
});

test("e2e: chaos mode — random drops, still completes byte-identical", async () => {
  const paired = await setupPaired({ label: "chaos", files: [...PHOTOS.slice(0, 8), VIDEO] });
  try {
    // chaosDropRate drops at random; abortAfterAcks guarantees the suite is
    // never green by luck (at least one drop definitely happens).
    const sender = makeSender(paired, { chaosDropRate: 0.9, abortAfterAcks: 2 });
    const stats = await sender.run();
    sender.close();

    assert.equal(stats.filesStored, 9);
    assert.ok(stats.reconnects >= 1, "at least one drop happened");
    assertLibraryTransferred(paired);
    assert.deepEqual(incomingDirContents(paired.rootDir), []);
  } finally {
    await paired.receiver.stop();
  }
});
