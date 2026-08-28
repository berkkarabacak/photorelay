/**
 * Receiver-side RelaySync/1 session handler (transfer-protocol.md §4–§6).
 *
 * One instance per TLS connection. All state that matters lives in the
 * Journal (SQLite) — this class holds only per-connection caches, so a
 * dropped connection loses nothing.
 *
 * Ordering contract for every chunk (§5.4):
 *   validate → write to .part → fsync → journal commit → CHUNK_ACK
 */
import type { TLSSocket } from "node:tls";
import { ChunkMap } from "../protocol/chunkmap.js";
import { CHUNK_SIZE, ErrorCode, MAX_IN_FLIGHT, MsgType, PROTOCOL_VERSION } from "../protocol/constants.js";
import { encodeFrame, FrameDecoder, type DecodedChunk } from "../protocol/frames.js";
import { fingerprint, fileIdHash, sha256Hex, xxh64Hex } from "../protocol/hash.js";
import {
  isHello,
  isManifestItem,
  type ErrorMsg,
  type FileDoneMsg,
  type ManifestItem,
  type ManifestMsg,
  type PlanItem,
} from "../protocol/messages.js";
import { sanitizeRelPath } from "../protocol/paths.js";
import type { Journal } from "./journal.js";
import type { MediaStore } from "./store.js";

export type LogKind = "info" | "proto" | "ok" | "warn" | "err";
export type Logger = (kind: LogKind, msg: string) => void;

interface PlannedFile {
  item: ManifestItem;
  plan: PlanItem;
}

export interface ReceiverSessionOptions {
  socket: TLSSocket;
  journal: Journal;
  store: MediaStore;
  deviceId: string; // pinned fingerprint of the peer's TLS cert
  verifyFull: boolean; // Level-3 SHA-256 at finalize (default true)
  log: Logger;
}

export class ReceiverSession {
  private readonly socket: TLSSocket;
  private readonly journal: Journal;
  private readonly store: MediaStore;
  private readonly deviceId: string;
  private readonly verifyFull: boolean;
  private readonly log: Logger;

  private readonly decoder = new FrameDecoder();
  private sessionId = "";
  private deviceName = "phone";
  private pendingManifest: ManifestItem[] = [];
  private readonly planned = new Map<string, PlannedFile>();
  private readonly idHashToFileId = new Map<string, string>();
  private closed = false;

  constructor(opts: ReceiverSessionOptions) {
    this.socket = opts.socket;
    this.journal = opts.journal;
    this.store = opts.store;
    this.deviceId = opts.deviceId;
    this.verifyFull = opts.verifyFull;
    this.log = opts.log;
  }

  attach(): void {
    this.socket.on("data", (segment) => {
      try {
        for (const frame of this.decoder.feed(segment)) this.handleFrame(frame);
      } catch (err) {
        this.fail(`frame decode: ${(err as Error).message}`);
      }
    });
    this.socket.on("close", () => this.onClose());
    this.socket.on("error", () => this.onClose());
  }

  /* ------------------------------ frames ------------------------------ */

  private handleFrame(frame: DecodedChunk | { type: number; payload: Record<string, unknown> }): void {
    switch (frame.type) {
      case MsgType.HELLO:
        return this.onHello(frame.payload);
      case MsgType.MANIFEST:
        return this.onManifest(frame.payload as unknown as ManifestMsg);
      case MsgType.CHUNK_DATA:
        return this.onChunkData(frame as DecodedChunk);
      case MsgType.FILE_DONE:
        return this.onFileDone(frame.payload as unknown as FileDoneMsg);
      case MsgType.RESUME_REQ:
        return this.onResumeReq();
      case MsgType.HEARTBEAT:
        this.send(MsgType.HEARTBEAT, { t: Date.now() });
        return;
      case MsgType.PAUSE:
        if (this.sessionId) this.journal.setSessionState(this.sessionId, "PAUSED");
        this.log("info", "Paused by sender");
        return;
      case MsgType.ERROR: {
        const e = frame.payload as unknown as ErrorMsg;
        this.log("warn", `sender reported ${e.code}: ${e.message}`);
        return;
      }
      case MsgType.BYE:
        this.onBye();
        return;
      default:
        // 0x10–0x6F is the reserved extension range — ignore; anything else
        // is a protocol violation.
        if (frame.type >= 0x10 && frame.type <= 0x6f) return;
        this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, `unknown frame type ${frame.type}`);
    }
  }

  /* ------------------------------ handshake ------------------------------ */

  private onHello(payload: Record<string, unknown>): void {
    if (!isHello(payload)) {
      return this.fail("malformed HELLO");
    }
    this.deviceName = payload.device_name;
    this.journal.upsertDevice(this.deviceId, payload.device_name, payload.platform);
    const { sessionId } = this.journal.getOrCreateSession(
      payload.session_id,
      this.deviceId,
      this.store.root
    );
    this.sessionId = sessionId;

    // Crash/interruption reconciliation (§6.2): journal is authoritative;
    // staging files are truncated back to journaled bytes.
    const interrupted = this.journal.markInflightInterrupted(sessionId);
    if (interrupted > 0) {
      const rows = this.journal.db
        .prepare(`SELECT file_id, have_bytes FROM files WHERE session_id = ? AND status = 'interrupted'`)
        .all(sessionId) as Array<{ file_id: string; have_bytes: number }>;
      for (const r of rows) this.store.truncateToJournaled(r.file_id, r.have_bytes);
      this.log("warn", `Receiver restarted — replaying journal (${interrupted} file(s) restored from state)`);
    }

    this.journal.setSessionState(sessionId, "MANIFEST_EXCHANGE");
    this.journal.addEvent(sessionId, "connect", { device: payload.device_name });
    this.send(MsgType.HELLO_ACK, {
      protocol: PROTOCOL_VERSION,
      session_id: sessionId,
      state: "MANIFEST_EXCHANGE",
      max_in_flight: MAX_IN_FLIGHT,
    });
  }

  /* ------------------------------ manifest & plan ------------------------------ */

  private onManifest(msg: ManifestMsg): void {
    if (!Array.isArray(msg.items) || !msg.items.every(isManifestItem)) {
      return this.fail("malformed MANIFEST");
    }
    for (const item of msg.items) {
      try {
        item.rel_path = sanitizeRelPath(item.rel_path);
        item.name = sanitizeRelPath(item.name);
      } catch (err) {
        return this.fail((err as Error).message);
      }
      this.journal.upsertPlannedFile(this.sessionId, item);
      this.pendingManifest.push(item);
    }
    this.send(MsgType.MANIFEST_ACK, { page: msg.page });

    if (msg.page === msg.pages - 1) {
      this.journal.setSessionState(this.sessionId, "PLANNING");
      const items = this.pendingManifest;
      this.pendingManifest = [];
      this.sendPlan(items);
    }
  }

  /** Compute and send the PLAN for a set of manifest items. */
  private sendPlan(items: ManifestItem[]): void {
    const plans: PlanItem[] = [];
    let send = 0;
    let resume = 0;
    let skip = 0;
    for (const item of items) {
      const plan = this.journal.planFor(this.sessionId, item, this.store.root);
      plans.push(plan);
      if (plan.action === "SEND") send++;
      else if (plan.action === "RESUME") resume++;
      else skip++;
      if (plan.action !== "SKIP") {
        this.planned.set(item.file_id, { item, plan });
        this.idHashToFileId.set(idHashHex(item.file_id), item.file_id);
      }
    }
    this.journal.addEvent(this.sessionId, "plan", { send, resume, skip });
    if (resume > 0) this.log("proto", `PLAN → SEND ${send} · RESUME ${resume} (verified data never re-sent) · SKIP ${skip}`);
    else this.log("proto", `PLAN → SEND ${send} · SKIP ${skip} (already backed up)`);
    if (plans.length > 0 && send + resume === 0) {
      this.journal.setSessionState(this.sessionId, "COMPLETE");
    } else {
      this.journal.setSessionState(this.sessionId, "TRANSFERRING");
    }
    this.send(MsgType.PLAN, { items: plans });
  }

  private onResumeReq(): void {
    // Rebuild the plan from the journal alone — the sender need not
    // re-send the manifest after a transient drop.
    const rows = this.journal.db
      .prepare(
        `SELECT * FROM files WHERE session_id = ? AND status IN ('planned','transferring','interrupted','needs_attention')`
      )
      .all(this.sessionId) as Array<Record<string, unknown>>;
    const items: ManifestItem[] = rows.map((r) => ({
      file_id: r.file_id as string,
      rel_path: r.rel_path as string,
      name: r.name as string,
      size: r.size as number,
      mtime: r.mtime as number,
      media: r.media as "photo" | "video",
      fingerprint: r.fingerprint as string,
      hash_sha256: (r.sha256 as string) ?? null,
    }));
    this.log("proto", "RESUME_REQ → journal replay, rebuilding plan");
    this.sendPlan(items);
  }

  /* ------------------------------ chunks ------------------------------ */

  private onChunkData(frame: DecodedChunk): void {
    const fileId = this.idHashToFileId.get(frame.fileIdHash.toString("hex"));
    if (!fileId) {
      return this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, "chunk for unknown file", undefined, frame.offset);
    }
    const pf = this.planned.get(fileId);
    if (!pf) {
      return this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, "chunk outside plan", fileId, frame.offset);
    }

    const { item } = pf;
    const totalChunks = Math.max(1, Math.ceil(item.size / CHUNK_SIZE));

    // Validate geometry
    if (frame.offset % CHUNK_SIZE !== 0) {
      return this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, "misaligned chunk offset", fileId, frame.offset);
    }
    const index = frame.offset / CHUNK_SIZE;
    const expectedLen = index === totalChunks - 1 ? item.size - index * CHUNK_SIZE : CHUNK_SIZE;
    if (index >= totalChunks || frame.data.length !== expectedLen) {
      return this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, "bad chunk length", fileId, frame.offset);
    }

    // Level-2 verification: inline xxHash64 before anything is persisted.
    const actualXxh64 = xxh64Hex(frame.data);
    if (BigInt("0x" + actualXxh64) !== frame.xxh64) {
      this.journal.addEvent(this.sessionId, "chunk_mismatch", { file_id: fileId, offset: frame.offset });
      return this.sendError(ErrorCode.CHUNK_MISMATCH, true, "xxHash64 mismatch — re-send chunk", fileId, frame.offset);
    }

    // Idempotent: chunk already journaled → re-ack without rewriting.
    const map = this.journal.chunkMapFor(this.sessionId, fileId, item.size);
    if (!map.has(index)) {
      try {
        this.store.writeChunk(fileId, frame.offset, frame.data);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOSPC") {
          return this.sendError(ErrorCode.DISK_FULL, true, "receiver disk full", fileId, frame.offset);
        }
        throw err;
      }
      this.journal.recordChunk(this.sessionId, fileId, index, frame.offset, frame.data.length, actualXxh64);
    }
    this.send(MsgType.CHUNK_ACK, { file_id: fileId, offset: frame.offset });
  }

  /* ------------------------------ completion ------------------------------ */

  private onFileDone(msg: FileDoneMsg): void {
    const pf = this.planned.get(msg.file_id);
    if (!pf) {
      return this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, "FILE_DONE for unplanned file", msg.file_id);
    }
    const { item } = pf;
    const map: ChunkMap = this.journal.chunkMapFor(this.sessionId, item.file_id, item.size);
    if (!map.complete || this.store.stagedBytes(item.file_id) !== item.size) {
      // Sender finished but we're missing chunks — ask for the gaps.
      this.log("warn", `${item.name}: FILE_DONE with gaps — requesting ${map.missing().length} missing chunk(s)`);
      const plan: PlanItem = {
        file_id: item.file_id,
        action: "RESUME",
        chunk_map: map.toBase64(),
        have_bytes: map.receivedChunks * CHUNK_SIZE,
      };
      this.send(MsgType.PLAN, { items: [plan] });
      return;
    }

    this.journal.markVerifying(this.sessionId, item.file_id);

    // Level-1 re-check: fingerprint of the staged bytes.
    const staged = this.store.readStaged(item.file_id);
    const fp = fingerprint({ size: staged.length, mtime: item.mtime, firstMiB: staged.subarray(0, 1024 * 1024) });
    if (fp !== item.fingerprint) {
      this.journal.recordVerification(this.sessionId, item.file_id, "metadata", "fail", `staged ${fp} != manifest ${item.fingerprint}`);
      this.journal.markNeedsAttention(this.sessionId, item.file_id, "fingerprint mismatch after transfer");
      this.store.quarantine(item.file_id, "fingerprint-mismatch");
      this.planned.delete(item.file_id);
      return this.sendError(ErrorCode.VERIFY_FAILED, true, "metadata fingerprint mismatch — file quarantined, will re-transfer", item.file_id);
    }
    this.journal.recordVerification(this.sessionId, item.file_id, "metadata", "pass");

    // Level-3: full-file SHA-256 (policy: verify everything).
    let sha = "";
    if (this.verifyFull) {
      sha = sha256Hex(staged);
      const expected = item.hash_sha256;
      if (expected && expected !== sha) {
        this.journal.recordVerification(this.sessionId, item.file_id, "sha256", "fail", `${sha} != ${expected}`);
        this.journal.markNeedsAttention(this.sessionId, item.file_id, "sha256 mismatch");
        this.store.quarantine(item.file_id, "sha256-mismatch");
        this.planned.delete(item.file_id);
        return this.sendError(ErrorCode.VERIFY_FAILED, true, "SHA-256 mismatch — file quarantined, will re-transfer", item.file_id);
      }
      this.journal.recordVerification(this.sessionId, item.file_id, "sha256", "pass");
    } else {
      sha = sha256Hex(staged); // still recorded as the content key for dedup
    }

    // Promote: atomic rename into the library.
    const storedAs = this.store.finalize({
      fileId: item.file_id,
      deviceName: this.deviceName,
      fileName: item.name,
      mtime: item.mtime,
    });
    this.journal.markStored(this.sessionId, item.file_id, storedAs, sha);
    this.planned.delete(item.file_id);
    this.log("ok", `FILE_VERIFIED ${item.name} → ${storedAs}`);
    this.send(MsgType.FILE_VERIFIED, { file_id: item.file_id, stored_as: storedAs, sha256: sha });

    const stats = this.journal.stats(this.sessionId);
    const remaining = (stats.planned ?? 0) + (stats.transferring ?? 0) + (stats.verifying ?? 0) + (stats.interrupted ?? 0);
    if (remaining === 0) {
      this.journal.setSessionState(this.sessionId, "COMPLETE");
    }
  }

  private onBye(): void {
    if (!this.sessionId) {
      this.socket.end();
      return;
    }
    const stats = this.journal.stats(this.sessionId);
    const stored = stats.stored ?? 0;
    const skipped = stats.skipped ?? 0;
    this.journal.addEvent(this.sessionId, "bye", { stored, skipped });
    this.log("ok", `Session complete — ${stored} stored, ${skipped} skipped (already backed up)`);
    this.socket.end();
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.sessionId) return;
    try {
      const stats = this.journal.stats(this.sessionId);
      const remaining =
        (stats.planned ?? 0) + (stats.transferring ?? 0) + (stats.verifying ?? 0) + (stats.interrupted ?? 0);
      if (remaining > 0) {
        this.journal.setSessionState(this.sessionId, "INTERRUPTED");
        this.log("err", "Connection lost — waiting for phone…");
      }
    } catch {
      // Journal already closed (receiver process is going down) — the
      // on-disk state is durable; the in-flight files remain 'transferring'
      // and are reconciled on the next HELLO.
    }
  }

  /* ------------------------------ plumbing ------------------------------ */

  private send(type: number, payload: Record<string, unknown>): void {
    if (!this.socket.destroyed) this.socket.write(encodeFrame(type as never, payload));
  }

  private sendError(code: string, retryable: boolean, message: string, fileId?: string, offset?: number): void {
    this.log(retryable ? "warn" : "err", `${code}: ${message}`);
    this.send(MsgType.ERROR, { code, retryable, message, file_id: fileId, offset });
    if (!retryable) this.socket.end();
  }

  private fail(message: string): void {
    this.sendError(ErrorCode.PROTOCOL_VIOLATION, false, message);
  }
}

function idHashHex(fileId: string): string {
  return fileIdHash(fileId).toString("hex");
}
