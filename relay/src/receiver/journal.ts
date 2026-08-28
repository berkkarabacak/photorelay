/**
 * Receiver journal — the authoritative, crash-safe record of what has been
 * stored (data-model.md §3). SQLite in WAL mode; every chunk is recorded in
 * the same transaction that acknowledges it, and a chunk is ACKed on the
 * wire only after the journal commit (journal-first ordering).
 */
import { DatabaseSync } from "node:sqlite";
import { ChunkMap } from "../protocol/chunkmap.js";
import { CHUNK_SIZE } from "../protocol/constants.js";
import type { ManifestItem, PlanAction, PlanItem, SessionState } from "../protocol/messages.js";

export type FileStatus =
  | "planned"
  | "transferring"
  | "verifying"
  | "stored"
  | "skipped"
  | "needs_attention"
  | "interrupted";

export interface FileRow {
  file_id: string;
  session_id: string;
  name: string;
  rel_path: string;
  size: number;
  mtime: number;
  media: string;
  fingerprint: string;
  sha256: string | null;
  status: FileStatus;
  stored_as: string | null;
  have_bytes: number;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS devices (
  device_id        TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  platform         TEXT NOT NULL,
  pubkey_ed25519   BLOB,
  paired_at        INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id       TEXT PRIMARY KEY,
  device_id        TEXT NOT NULL REFERENCES devices(device_id),
  library_root     TEXT NOT NULL,
  state            TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  file_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL REFERENCES sessions(session_id),
  name             TEXT NOT NULL,
  rel_path         TEXT NOT NULL,
  size             INTEGER NOT NULL,
  mtime            INTEGER NOT NULL,
  media            TEXT NOT NULL,
  fingerprint      TEXT NOT NULL,
  sha256           TEXT,
  status           TEXT NOT NULL,
  stored_as        TEXT,
  have_bytes       INTEGER NOT NULL DEFAULT 0,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (session_id, file_id)
);
CREATE INDEX IF NOT EXISTS files_fingerprint_idx ON files(fingerprint);
CREATE INDEX IF NOT EXISTS files_sha256_idx ON files(sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS chunks (
  file_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  chunk_index      INTEGER NOT NULL,
  offset           INTEGER NOT NULL,
  length           INTEGER NOT NULL,
  xxh64            TEXT NOT NULL,
  received_at      INTEGER NOT NULL,
  PRIMARY KEY (session_id, file_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS verifications (
  file_id          TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  level            TEXT NOT NULL,
  result           TEXT NOT NULL,
  detail           TEXT,
  verified_at      INTEGER NOT NULL,
  PRIMARY KEY (session_id, file_id, level)
);

CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       TEXT NOT NULL,
  kind             TEXT NOT NULL,
  detail_json      TEXT,
  at               INTEGER NOT NULL
);
`;

export class Journal {
  readonly db: DatabaseSync;

  constructor(journalPath: string) {
    this.db = new DatabaseSync(journalPath);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /* ------------------------------ devices ------------------------------ */

  upsertDevice(deviceId: string, name: string, platform: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO devices (device_id, name, platform, paired_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET name = excluded.name,
           platform = excluded.platform, last_seen_at = excluded.last_seen_at`
      )
      .run(deviceId, name, platform, now, now);
  }

  isDevicePaired(deviceId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM devices WHERE device_id = ?`).get(deviceId);
  }

  /* ------------------------------ sessions ------------------------------ */

  getOrCreateSession(sessionId: string, deviceId: string, libraryRoot: string): {
    sessionId: string;
    state: SessionState;
  } {
    const now = Date.now();
    if (sessionId) {
      const row = this.db
        .prepare(`SELECT session_id, state FROM sessions WHERE session_id = ? AND device_id = ?`)
        .get(sessionId, deviceId) as { session_id: string; state: SessionState } | undefined;
      if (row) {
        this.db.prepare(`UPDATE sessions SET updated_at = ? WHERE session_id = ?`).run(now, sessionId);
        return { sessionId: row.session_id, state: row.state };
      }
    }
    // UUIDv7-ish: time-ordered; good enough for the reference (random uuid v4 suffix)
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO sessions (session_id, device_id, library_root, state, created_at, updated_at)
         VALUES (?, ?, ?, 'PAIRED', ?, ?)`
      )
      .run(id, deviceId, libraryRoot, now, now);
    return { sessionId: id, state: "PAIRED" };
  }

  setSessionState(sessionId: string, state: SessionState): void {
    this.db
      .prepare(`UPDATE sessions SET state = ?, updated_at = ? WHERE session_id = ?`)
      .run(state, Date.now(), sessionId);
    this.addEvent(sessionId, "state_change", { state });
  }

  /* ------------------------------ files & plan ------------------------------ */

  /** Insert a manifest item as planned; never resets existing progress. */
  upsertPlannedFile(sessionId: string, item: ManifestItem): void {
    this.db
      .prepare(
        `INSERT INTO files (file_id, session_id, name, rel_path, size, mtime, media, fingerprint, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)
         ON CONFLICT(session_id, file_id) DO UPDATE SET
           name = excluded.name, rel_path = excluded.rel_path,
           updated_at = excluded.updated_at`
      )
      .run(
        item.file_id,
        sessionId,
        item.name,
        item.rel_path,
        item.size,
        item.mtime,
        item.media,
        item.fingerprint,
        Date.now()
      );
  }

  fileEntry(sessionId: string, fileId: string): FileRow | undefined {
    return this.db
      .prepare(`SELECT * FROM files WHERE session_id = ? AND file_id = ?`)
      .get(sessionId, fileId) as FileRow | undefined;
  }

  /**
   * PLAN decision for one manifest item (transfer-protocol.md §5.3):
   *   1. verified entry with matching fingerprint      → SKIP (already_stored)
   *   2. in-flight entry with journaled chunks         → RESUME + chunk map
   *   3. fingerprint match in the dedup index          → SKIP (duplicate)
   *   4. otherwise                                     → SEND
   */
  planFor(sessionId: string, item: ManifestItem, libraryRoot: string): PlanItem {
    const existing = this.fileEntry(sessionId, item.file_id);
    if (existing?.status === "stored" && existing.fingerprint === item.fingerprint) {
      return { file_id: item.file_id, action: "SKIP", reason: "already_stored", stored_as: existing.stored_as ?? undefined };
    }
    if (existing && existing.have_bytes > 0 && existing.status !== "stored" && existing.status !== "skipped") {
      const map = this.chunkMapFor(sessionId, item.file_id, item.size);
      return {
        file_id: item.file_id,
        action: "RESUME",
        chunk_map: map.toBase64(),
        have_bytes: existing.have_bytes,
      };
    }
    const dup = this.db
      .prepare(
        `SELECT f.stored_as FROM files f
         JOIN sessions s ON s.session_id = f.session_id
         WHERE f.fingerprint = ? AND f.status = 'stored' AND s.library_root = ? LIMIT 1`
      )
      .get(item.fingerprint, libraryRoot) as { stored_as: string } | undefined;
    if (dup) {
      this.db
        .prepare(
          `UPDATE files SET status = 'skipped', stored_as = ?, updated_at = ?
           WHERE session_id = ? AND file_id = ?`
        )
        .run(dup.stored_as, Date.now(), sessionId, item.file_id);
      return { file_id: item.file_id, action: "SKIP", reason: "duplicate", stored_as: dup.stored_as };
    }
    this.db
      .prepare(
        `UPDATE files SET status = 'transferring', updated_at = ? WHERE session_id = ? AND file_id = ?`
      )
      .run(Date.now(), sessionId, item.file_id);
    return { file_id: item.file_id, action: "SEND" };
  }

  /* ------------------------------ chunks ------------------------------ */

  chunkMapFor(sessionId: string, fileId: string, size: number): ChunkMap {
    const map = new ChunkMap(Math.max(1, Math.ceil(size / CHUNK_SIZE)));
    const rows = this.db
      .prepare(`SELECT chunk_index FROM chunks WHERE session_id = ? AND file_id = ? ORDER BY chunk_index`)
      .all(sessionId, fileId) as Array<{ chunk_index: number }>;
    for (const r of rows) map.set(r.chunk_index);
    return map;
  }

  /**
   * Journal one received chunk and refresh have_bytes — one transaction,
   * committed before the CHUNK_ACK is sent. Idempotent by primary key.
   */
  recordChunk(
    sessionId: string,
    fileId: string,
    chunkIndex: number,
    offset: number,
    length: number,
    xxh64: string
  ): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO chunks (file_id, session_id, chunk_index, offset, length, xxh64, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(fileId, sessionId, chunkIndex, offset, length, xxh64, Date.now());
      this.db
        .prepare(
          `UPDATE files SET
             have_bytes = COALESCE((SELECT SUM(length) FROM chunks WHERE session_id = ? AND file_id = ?), 0),
             status = 'transferring',
             updated_at = ?
           WHERE session_id = ? AND file_id = ?`
        )
        .run(sessionId, fileId, Date.now(), sessionId, fileId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /* ------------------------------ verification & promotion ------------------------------ */

  markVerifying(sessionId: string, fileId: string): void {
    this.db
      .prepare(`UPDATE files SET status = 'verifying', updated_at = ? WHERE session_id = ? AND file_id = ?`)
      .run(Date.now(), sessionId, fileId);
  }

  recordVerification(sessionId: string, fileId: string, level: string, result: "pass" | "fail", detail?: string): void {
    this.db
      .prepare(
        `INSERT INTO verifications (file_id, session_id, level, result, detail, verified_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id, file_id, level) DO UPDATE SET
           result = excluded.result, detail = excluded.detail, verified_at = excluded.verified_at`
      )
      .run(fileId, sessionId, level, result, detail ?? null, Date.now());
  }

  /** Promote to stored; chunk rows are purged (data-model.md §7). */
  markStored(sessionId: string, fileId: string, storedAs: string, sha256: string): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `UPDATE files SET status = 'stored', stored_as = ?, sha256 = ?, updated_at = ?
           WHERE session_id = ? AND file_id = ?`
        )
        .run(storedAs, sha256, Date.now(), sessionId, fileId);
      this.db.prepare(`DELETE FROM chunks WHERE session_id = ? AND file_id = ?`).run(sessionId, fileId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  markNeedsAttention(sessionId: string, fileId: string, reason: string): void {
    this.db
      .prepare(`UPDATE files SET status = 'needs_attention', updated_at = ? WHERE session_id = ? AND file_id = ?`)
      .run(Date.now(), sessionId, fileId);
    this.addEvent(sessionId, "needs_attention", { file_id: fileId, reason });
  }

  /** After a crash: any file mid-flight is marked interrupted (UI copy state). */
  markInflightInterrupted(sessionId: string): number {
    const res = this.db
      .prepare(
        `UPDATE files SET status = 'interrupted', updated_at = ?
         WHERE session_id = ? AND status IN ('transferring', 'verifying')`
      )
      .run(Date.now(), sessionId);
    return Number(res.changes);
  }

  /* ------------------------------ events & stats ------------------------------ */

  addEvent(sessionId: string, kind: string, detail?: Record<string, unknown>): void {
    this.db
      .prepare(`INSERT INTO events (session_id, kind, detail_json, at) VALUES (?, ?, ?, ?)`)
      .run(sessionId, kind, detail ? JSON.stringify(detail) : null, Date.now());
  }

  stats(sessionId: string): Record<FileStatus, number> {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS n FROM files WHERE session_id = ? GROUP BY status`)
      .all(sessionId) as Array<{ status: FileStatus; n: number }>;
    const out = {} as Record<FileStatus, number>;
    for (const r of rows) out[r.status] = Number(r.n);
    return out;
  }
}
