/**
 * UsbTransferEngine — fault-tolerant photo pull over a USB cable.
 *
 * Same promises as RelaySync/1, adapted to whole-file USB units (MTP gives
 * no reliable random access, so the resumable unit is one file; photos are
 * 2–8 MB, so per-file resume is exactly the right granularity):
 *
 *  - enumerate → fingerprint (name+size+mtime) → skip what's stored
 *  - copy into .photorelay/incoming as *.part — never mistaken for complete
 *  - size-verify → (optional SHA-256) → atomic rename into the library
 *  - every file journaled BEFORE it's marked done; cable pulls and app
 *    restarts resume from the journal — nothing re-copied, nothing lost
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sha256Hex } from "../../../../relay/src/protocol/hash.js";
import { sanitizeRelPath, storeSubdirs, uniqueName } from "../../../../relay/src/protocol/paths.js";
import type { UsbDevice, UsbFile, UsbSource } from "./source.js";

export interface EngineProgress {
  total: number;
  done: number;
  skipped: number;
  bytesTotal: number;
  bytesDone: number;
  currentFile: string | null;
}

export interface UsbEngineOptions {
  /** Library root, e.g. C:\\Users\\you\\Pictures\\PhotoRelay */
  libraryDir: string;
  source: UsbSource;
  /** Full-file SHA-256 of the staged copy (recorded for dedup/audit) */
  hashStaged?: boolean; // default true — local read, cheap
  onProgress?: (p: EngineProgress) => void;
  onFileStored?: (name: string, storedAs: string) => void;
}

interface FileRow {
  file_key: string;
  device_id: string;
  name: string;
  rel_path: string;
  size: number;
  mtime: number;
  fingerprint: string;
  sha256: string | null;
  status: "transferring" | "stored";
  stored_as: string | null;
}

export class CableRemovedError extends Error {
  constructor() {
    super("cable removed");
  }
}

export class UsbTransferEngine {
  private readonly db: DatabaseSync;
  private readonly source: UsbSource;
  readonly libraryDir: string;
  private readonly incomingDir: string;
  private readonly hashStaged: boolean;
  private readonly onProgress: (p: EngineProgress) => void;
  private readonly onFileStored: (name: string, storedAs: string) => void;
  private progress: EngineProgress = {
    total: 0,
    done: 0,
    skipped: 0,
    bytesTotal: 0,
    bytesDone: 0,
    currentFile: null,
  };

  constructor(opts: UsbEngineOptions) {
    this.source = opts.source;
    this.libraryDir = path.resolve(opts.libraryDir);
    this.incomingDir = path.join(this.libraryDir, ".photorelay", "incoming");
    fs.mkdirSync(this.incomingDir, { recursive: true });
    this.hashStaged = opts.hashStaged ?? true;
    this.onProgress = opts.onProgress ?? (() => {});
    this.onFileStored = opts.onFileStored ?? (() => {});
    this.db = new DatabaseSync(path.join(this.libraryDir, ".photorelay", "usb-journal.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS usb_files (
        file_key     TEXT PRIMARY KEY,   -- deviceId + relPath
        device_id    TEXT NOT NULL,
        name         TEXT NOT NULL,
        rel_path     TEXT NOT NULL,
        size         INTEGER NOT NULL,
        mtime        INTEGER NOT NULL,
        fingerprint  TEXT NOT NULL,      -- name:size:mtime
        sha256       TEXT,
        status       TEXT NOT NULL,      -- transferring | stored
        stored_as    TEXT,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS usb_files_fp_idx ON usb_files(fingerprint);
    `);
    this.reconcileStaging();
  }

  /** On startup: any leftover .part was never verified — remove it. */
  private reconcileStaging(): void {
    for (const f of fs.readdirSync(this.incomingDir)) {
      if (f.endsWith(".part")) fs.rmSync(path.join(this.incomingDir, f), { force: true });
    }
  }

  /** Fingerprint: cheap metadata identity (Level 1). */
  private fingerprint(f: UsbFile): string {
    return `${f.name}:${f.size}:${Math.floor(f.mtime)}`;
  }

  private isStored(fileKey: string, fp: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM usb_files WHERE file_key = ? AND fingerprint = ? AND status = 'stored'`)
      .get(fileKey, fp);
    return !!row;
  }

  /** Duplicate anywhere in this library (e.g. same photo in two albums). */
  private fingerprintStored(fp: string): string | null {
    const row = this.db
      .prepare(`SELECT stored_as FROM usb_files WHERE fingerprint = ? AND status = 'stored' LIMIT 1`)
      .get(fp) as { stored_as: string } | undefined;
    return row?.stored_as ?? null;
  }

  get currentProgress(): EngineProgress {
    return this.progress;
  }

  /**
   * Sync one device. Resumable: stored files are skipped before any copy.
   * Throws CableRemovedError when the device vanishes mid-sync.
   */
  async sync(device: UsbDevice): Promise<{ stored: number; skipped: number }> {
    // 1. Enumerate
    let files: UsbFile[];
    try {
      files = await this.source.listFiles(device.id);
    } catch {
      throw new CableRemovedError();
    }

    // 2. Plan: skip stored (same fingerprint) and library duplicates
    const todo: UsbFile[] = [];
    let skipped = 0;
    for (const f of files) {
      const key = `${device.id}:${f.relPath}`;
      const fp = this.fingerprint(f);
      if (this.isStored(key, fp) || this.fingerprintStored(fp)) skipped++;
      else todo.push(f);
    }

    this.progress = {
      total: files.length,
      done: skipped,
      skipped,
      bytesTotal: todo.reduce((a, f) => a + f.size, 0),
      bytesDone: 0,
      currentFile: null,
    };
    this.onProgress(this.progress);

    // 3. Copy each file: stage → verify → journal → atomic promote
    let stored = 0;
    for (const f of todo) {
      const key = `${device.id}:${f.relPath}`;
      const fp = this.fingerprint(f);
      const stagePath = path.join(this.incomingDir, `${sha256Hex(Buffer.from(key, "utf8")).slice(0, 24)}.part`);

      this.progress.currentFile = f.name;
      this.onProgress(this.progress);

      try {
        await this.source.copyTo(device.id, f, stagePath);
      } catch (err) {
        fs.rmSync(stagePath, { force: true });
        if (String((err as Error).message).match(/disconnect|stalled/i)) throw new CableRemovedError();
        throw err;
      }

      // Verify: size must match exactly (Level 1). A .part that fails is
      // deleted and will be re-copied next run — never mistaken for done.
      const stagedSize = fs.statSync(stagePath).size;
      if (stagedSize !== f.size) {
        fs.rmSync(stagePath, { force: true });
        throw new CableRemovedError(); // truncated read = flaky cable; resume handles it
      }
      const sha = this.hashStaged ? sha256Hex(fs.readFileSync(stagePath)) : null;

      // Journal BEFORE promotion.
      this.db
        .prepare(
          `INSERT INTO usb_files (file_key, device_id, name, rel_path, size, mtime, fingerprint, sha256, status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transferring', ?)
           ON CONFLICT(file_key) DO UPDATE SET
             name = excluded.name, size = excluded.size, mtime = excluded.mtime,
             fingerprint = excluded.fingerprint, sha256 = excluded.sha256,
             status = 'transferring', updated_at = excluded.updated_at`
        )
        .run(key, device.id, f.name, f.relPath, f.size, f.mtime, fp, sha, Date.now());

      // Atomic promote into <Library>/<Device>/<yyyy>/<yyyy-MM>/<name>
      const sub = storeSubdirs(f.mtime);
      const dir = path.join(this.libraryDir, device.name, sub);
      fs.mkdirSync(dir, { recursive: true });
      const finalName = uniqueName((c) => fs.existsSync(path.join(dir, c)), sanitizeRelPath(f.name));
      const finalPath = path.join(dir, finalName);
      fs.renameSync(stagePath, finalPath);
      const t = new Date(f.mtime * 1000);
      fs.utimesSync(finalPath, t, t);
      const storedAs = path.relative(this.libraryDir, finalPath).split(path.sep).join("/");

      this.db
        .prepare(`UPDATE usb_files SET status = 'stored', stored_as = ?, updated_at = ? WHERE file_key = ?`)
        .run(storedAs, Date.now(), key);

      stored++;
      this.progress.done++;
      this.progress.bytesDone += f.size;
      this.progress.currentFile = null;
      this.onProgress(this.progress);
      this.onFileStored(f.name, storedAs);
    }

    return { stored, skipped };
  }

  /** Totals across all sessions (for the UI). */
  libraryStats(): { stored: number; bytes: number } {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM usb_files WHERE status = 'stored'`)
      .get() as { n: number; bytes: number };
    return { stored: Number(row.n), bytes: Number(row.bytes) };
  }

  close(): void {
    this.db.close();
  }
}
