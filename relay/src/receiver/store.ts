/**
 * Receiver media store (data-model.md §5).
 *
 *   <LibraryRoot>/
 *     <DeviceName>/<yyyy>/<yyyy-MM>/<final files>
 *     .photorelay/incoming/<id>.part   ← in-flight only
 *     .photorelay/quarantine/          ← failed verification
 *
 * Invariants:
 *  - a file exists outside incoming/ only after verification + atomic rename
 *  - journal-first: callers record the chunk in the journal BEFORE acking
 */
import fs from "node:fs";
import path from "node:path";
import { fileIdHash } from "../protocol/hash.js";
import { storeSubdirs, uniqueName } from "../protocol/paths.js";

export class MediaStore {
  readonly root: string;
  readonly incomingDir: string;
  readonly quarantineDir: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.incomingDir = path.join(this.root, ".photorelay", "incoming");
    this.quarantineDir = path.join(this.root, ".photorelay", "quarantine");
    fs.mkdirSync(this.incomingDir, { recursive: true });
    fs.mkdirSync(this.quarantineDir, { recursive: true });
  }

  /** Path of the staging file for a file id (file ids contain characters like ':'). */
  partPath(fileId: string): string {
    return path.join(this.incomingDir, fileIdHash(fileId).toString("hex") + ".part");
  }

  /**
   * Write chunk bytes at offset and fsync — durability before the journal
   * commits and the ACK goes out. Sparse-safe, idempotent for retransmits.
   */
  writeChunk(fileId: string, offset: number, data: Buffer): void {
    const p = this.partPath(fileId);
    const fd = fs.openSync(p, fs.existsSync(p) ? "r+" : "w");
    try {
      fs.writeSync(fd, data, 0, data.length, offset);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  /** Bytes currently on disk for a staging file (0 if absent). */
  stagedBytes(fileId: string): number {
    const p = this.partPath(fileId);
    return fs.existsSync(p) ? fs.statSync(p).size : 0;
  }

  /** Crash reconciliation: shrink a staging file to what the journal claims. */
  truncateToJournaled(fileId: string, journaledBytes: number): void {
    const p = this.partPath(fileId);
    if (fs.existsSync(p) && fs.statSync(p).size > journaledBytes) {
      fs.truncateSync(p, journaledBytes);
    }
  }

  readStaged(fileId: string): Buffer {
    return fs.readFileSync(this.partPath(fileId));
  }

  /**
   * Verify → compute final path → atomic rename → restore mtime.
   * Returns the library-relative stored path (forward slashes).
   */
  finalize(opts: {
    fileId: string;
    deviceName: string;
    fileName: string;
    mtime: number; // unix seconds
  }): string {
    const { fileId, deviceName, fileName, mtime } = opts;
    const sub = storeSubdirs(mtime);
    const dir = path.join(this.root, deviceName, sub);
    fs.mkdirSync(dir, { recursive: true });

    const finalName = uniqueName((c) => fs.existsSync(path.join(dir, c)), fileName);
    const finalPath = path.join(dir, finalName);
    fs.renameSync(this.partPath(fileId), finalPath); // atomic, same volume
    const t = new Date(mtime * 1000);
    fs.utimesSync(finalPath, t, t);
    return path.relative(this.root, finalPath).split(path.sep).join("/");
  }

  /** Failed verification: keep the bytes for forensics, out of the library. */
  quarantine(fileId: string, reason: string): void {
    const p = this.partPath(fileId);
    if (!fs.existsSync(p)) return;
    const dest = path.join(
      this.quarantineDir,
      `${fileIdHash(fileId).toString("hex")}-${Date.now()}-${reason.replace(/[^a-z0-9_-]/gi, "_")}.part`
    );
    fs.renameSync(p, dest);
  }
}
