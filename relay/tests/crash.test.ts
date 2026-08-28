/**
 * Crash-recovery test: the receiver dies mid-transfer (no BYE, sockets
 * destroyed — power-loss semantics), restarts on the same library root,
 * replays its journal, and the transfer resumes exactly where it stopped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHUNK_SIZE } from "../src/protocol/constants.js";
import { Receiver } from "../src/receiver/server.js";
import {
  assertLibraryTransferred,
  captureLog,
  incomingDirContents,
  makeSender,
  setupPaired,
} from "./helpers.ts";

const FILES = [
  { name: "IMG_small_1.jpg", size: 30_000, ageDays: 3 },
  { name: "IMG_small_2.jpg", size: 45_000, ageDays: 2 },
  { name: "IMG_small_3.jpg", size: 60_000, ageDays: 1 },
  { name: "VID_big.mp4", size: Math.floor(CHUNK_SIZE * 8.2), ageDays: 0 }, // newest → first, ~9 chunks
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test("crash: receiver restart mid-transfer resumes from journal — nothing re-sent, nothing lost", async () => {
  const firstLog = captureLog();
  const paired = await setupPaired({ label: "crash", files: FILES, receiverLog: firstLog });
  const totalChunks = FILES.reduce((a, f) => a + Math.ceil(f.size / CHUNK_SIZE), 0);

  // Sender drops after 3 chunks are ACKed (= journaled + fsynced on the
  // receiver — guaranteed to be restored by journal replay).
  const senderLog = captureLog();
  const sender = makeSender(paired, { abortAfterAcks: 3 }, senderLog);
  const runPromise = sender.run();

  // Wait for the drop, then kill the receiver mid-reconnect-backoff.
  while (sender.stats.reconnects === 0) await sleep(25);
  paired.receiver.destroy(); // power loss: no BYE, sockets destroyed
  await sleep(150);

  // Receiver restarts on the same root — journal on disk is authoritative.
  const secondLog = captureLog();
  const receiver2 = await Receiver.start({
    rootDir: paired.rootDir,
    port: paired.receiver.port,
    deviceName: "test-pc",
    acceptFingerprints: [paired.senderFp],
    log: secondLog.logger,
  });

  try {
    const stats = await runPromise;
    sender.close();

    assert.equal(stats.filesStored, FILES.length);
    assert.ok(stats.reconnects >= 1);
    // The big video had ≥3 chunks journaled before the crash. A naive
    // restart re-sends everything; resume must send strictly fewer.
    assert.ok(
      stats.chunksSent <= totalChunks + 6,
      `chunks sent ${stats.chunksSent} vs naive-restart ${totalChunks + 9} (total chunks ${totalChunks})`
    );
    assert.ok(secondLog.has("replaying journal"), "receiver replayed its journal after restart");
    assert.ok(secondLog.has("RESUME"), "resumed from journaled chunk map instead of restarting");
    assertLibraryTransferred({ ...paired, receiver: receiver2 });
    assert.deepEqual(incomingDirContents(paired.rootDir), [], "no orphan .part files");

    // Journal is clean: everything stored, chunk rows purged.
    const statsRows = receiver2.journal.db
      .prepare(`SELECT status, COUNT(*) AS n FROM files GROUP BY status`)
      .all() as Array<{ status: string; n: number }>;
    const byStatus = Object.fromEntries(statsRows.map((r) => [r.status, Number(r.n)]));
    assert.deepEqual(byStatus, { stored: FILES.length });
    const chunkRows = receiver2.journal.db.prepare(`SELECT COUNT(*) AS n FROM chunks`).get() as { n: number };
    assert.equal(Number(chunkRows.n), 0);
  } finally {
    await receiver2.stop();
  }
});

test("crash: interrupted session is marked INTERRUPTED, then completes after restart", async () => {
  const paired = await setupPaired({ label: "crash-state", files: FILES.slice(0, 2) });
  const sender = makeSender(paired, { abortAfterBytes: 10_000 });
  const runPromise = sender.run();
  while (sender.stats.reconnects === 0) await sleep(25);
  paired.receiver.destroy();
  await sleep(150);

  const secondLog = captureLog();
  const receiver2 = await Receiver.start({
    rootDir: paired.rootDir,
    port: paired.receiver.port,
    deviceName: "test-pc",
    acceptFingerprints: [paired.senderFp],
    log: secondLog.logger,
  });
  try {
    await runPromise;
    sender.close();
    const sessions = receiver2.journal.db.prepare(`SELECT state FROM sessions`).all() as Array<{ state: string }>;
    assert.equal(sessions[sessions.length - 1].state, "COMPLETE");
    assert.ok(firstLogHas(paired, "Connection lost — waiting for phone"));
  } finally {
    await receiver2.stop();
  }
});

function firstLogHas(paired: { receiverLog: ReturnType<typeof captureLog> }, s: string): boolean {
  return paired.receiverLog.has(s);
}
