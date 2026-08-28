/**
 * Reference RelaySync/1 sender (transfer-protocol.md §4–§6).
 *
 * A CLI stand-in for the Android/iOS apps. It implements:
 *  - TOFU certificate pinning of the receiver
 *  - manifest paging → PLAN → windowed chunk streaming (max 16 in flight)
 *  - mid-file resume from the receiver's chunk map
 *  - chunk re-send on CHUNK_MISMATCH (per-chunk retry limit)
 *  - reconnect with the normative backoff ladder; RESUME_REQ replays the
 *    receiver's plan without re-sending the manifest
 *  - a tiny SQLite journal (sender side of data-model.md §4)
 *
 * Test hooks: abortAfterBytes, chaosDropRate, corruptChunkAt, abort().
 */
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { DatabaseSync } from "node:sqlite";
import { ChunkMap } from "../protocol/chunkmap.js";
import {
  CHUNK_RETRY_LIMIT,
  CHUNK_SIZE,
  ErrorCode,
  HEARTBEAT_INTERVAL_MS,
  MANIFEST_PAGE_SIZE,
  MAX_IN_FLIGHT,
  MsgType,
  PROTOCOL_VERSION,
  RECONNECT_BACKOFF_MS,
} from "../protocol/constants.js";
import { encodeChunkFrame, encodeFrame, FrameDecoder, type DecodedMessage } from "../protocol/frames.js";
import { fileIdHash, xxh64BigInt } from "../protocol/hash.js";
import type {
  ChunkAckMsg,
  ErrorMsg,
  FileVerifiedMsg,
  HelloAckMsg,
  ManifestItem,
  PlanItem,
  PlanMsg,
} from "../protocol/messages.js";
import { loadOrCreateIdentity, peerFingerprint } from "../pairing/certs.js";
import { scanLibrary } from "./library.js";
import type { Logger } from "../receiver/session.js";

export interface SenderOptions {
  host: string;
  port: number;
  libraryDir: string;
  stateDir: string;
  deviceName?: string;
  /** Expected receiver fingerprint; pinned on first connect (TOFU) */
  trustFingerprint?: string;
  /** Testing: destroy the connection after N bytes sent (once) */
  abortAfterBytes?: number;
  /** Testing: destroy the connection after N chunk ACKs received (once).
   *  An ACK implies the receiver journaled + fsynced the chunk. */
  abortAfterAcks?: number;
  /** Testing: probability per second of a random drop (0–1) */
  chaosDropRate?: number;
  /** Testing: corrupt the chunk at this offset of the named file (once) */
  corruptChunkAt?: { fileName: string; offset: number };
  log?: Logger;
}

export interface SenderStats {
  filesStored: number;
  filesSkipped: number;
  filesNeedsAttention: number;
  bytesSent: number;
  chunksSent: number;
  retries: number;
  reconnects: number;
}

interface FileTask {
  item: ManifestItem;
  absPath: string;
  pendingChunks: number[]; // chunk indices still to send
}

export class Sender {
  private readonly opts: SenderOptions;
  private readonly log: Logger;
  private readonly db: DatabaseSync;
  private socket: tls.TLSSocket | null = null;
  private readonly decoder = new FrameDecoder();
  private sessionId = "";
  private maxInFlight = MAX_IN_FLIGHT;
  private heartbeat: NodeJS.Timeout | null = null;
  private chaosTimer: NodeJS.Timeout | null = null;

  // transfer state
  private readonly manifestById = new Map<string, ManifestItem>();
  private queue: FileTask[] = [];
  private active: FileTask | null = null;
  private activeFailed = false;
  private inFlight = new Set<number>(); // offsets sent, awaiting CHUNK_ACK
  private acksReceived = 0;
  private chunkRetries = new Map<string, number>(); // "fileId:offset" -> attempts
  private dropped = false;
  private intentionallyClosed = false;
  private corruptedOnce = false;
  private bytesThisConnection = 0;

  // coordination primitives
  private signal: (() => void) | null = null;
  private awaiters = new Map<string, () => void>();
  private planResolve: ((items: PlanItem[]) => void) | null = null;
  private earlyPlan: PlanItem[] | null = null;
  private helloResolve: ((msg: HelloAckMsg) => void) | null = null;
  private helloReject: ((err: Error) => void) | null = null;
  private verifiedResolve: ((msg: FileVerifiedMsg) => void) | null = null;
  private gapResolve: ((item: PlanItem) => void) | null = null;
  private dropResolve: (() => void) | null = null;
  private fatalError: Error | null = null;

  readonly stats: SenderStats = {
    filesStored: 0,
    filesSkipped: 0,
    filesNeedsAttention: 0,
    bytesSent: 0,
    chunksSent: 0,
    retries: 0,
    reconnects: 0,
  };

  constructor(opts: SenderOptions) {
    this.opts = opts;
    this.log = opts.log ?? (() => {});
    fs.mkdirSync(opts.stateDir, { recursive: true });
    this.db = new DatabaseSync(path.join(opts.stateDir, "sender.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS transfers (
        file_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, size INTEGER NOT NULL,
        mtime INTEGER NOT NULL, fingerprint TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  /* ------------------------------ public API ------------------------------ */

  /**
   * Run a full transfer to completion, reconnecting automatically through
   * any number of drops. Resolves when every item is stored or skipped.
   */
  async run(): Promise<SenderStats> {
    const items = scanLibrary(this.opts.libraryDir);
    this.log("info", `Library scan: ${items.length} items in ${path.resolve(this.opts.libraryDir)}`);
    for (const item of items) this.manifestById.set(item.file_id, item);
    if (items.length === 0) return this.stats;

    let attempt = 0;
    for (;;) {
      this.dropped = false;
      try {
        const reconnecting = attempt > 0;
        await this.connect(reconnecting);
        if (reconnecting) {
          // The receiver replays its journal — no manifest needed (§6.2).
          this.send(MsgType.RESUME_REQ, {});
          this.log("ok", "Connected — resuming transfer…");
        } else {
          await this.sendManifest(items);
        }
        await this.drain();
        return this.stats; // COMPLETE
      } catch (err) {
        if (this.fatalError) throw this.fatalError;
        if (!this.dropped) throw err;
        const base = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
        const wait = base * (0.75 + Math.random() * 0.5); // ±25% jitter
        this.stats.reconnects++;
        this.log("warn", `Connection lost — waiting for PC… (retry in ${(wait / 1000).toFixed(1)}s)`);
        await sleep(wait);
        attempt++;
      }
    }
  }

  /** Testing hook: simulate the network disappearing mid-transfer. */
  abort(): void {
    this.dropped = true;
    this.socket?.destroy();
    this.poke();
  }

  close(): void {
    this.intentionallyClosed = true;
    this.stopTimers();
    this.socket?.end();
    this.db.close();
  }

  /* ------------------------------ connection ------------------------------ */

  private connect(reconnecting: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const identity = loadOrCreateIdentity(this.opts.stateDir, this.opts.deviceName ?? "cli-sender");
      const socket = tls.connect({
        host: this.opts.host,
        port: this.opts.port,
        key: identity.key,
        cert: identity.cert,
        minVersion: "TLSv1.3",
        maxVersion: "TLSv1.3",
        rejectUnauthorized: false, // TOFU pinning — verified manually below
      });
      this.socket = socket;
      this.bytesThisConnection = 0;
      this.inFlight.clear();

      socket.once("secureConnect", () => {
        const fp = peerFingerprint(socket.getPeerCertificate());
        if (!fp) return reject(new Error("receiver presented no certificate"));

        // TOFU pin check (security-model.md §3)
        const pinKey = `pin:${this.opts.host}:${this.opts.port}`;
        const pinned = this.kvGet(pinKey);
        if (pinned && pinned !== fp) {
          return reject(new Error(`SECURITY: receiver fingerprint changed (was ${pinned.slice(0, 23)}…, got ${fp.slice(0, 23)}…) — refusing to connect`));
        }
        if (!pinned) {
          if (this.opts.trustFingerprint && this.opts.trustFingerprint !== fp) {
            return reject(new Error(`SECURITY: --trust fingerprint does not match receiver (${fp})`));
          }
          this.kvSet(pinKey, fp);
          this.log("ok", `Paired with PC ${fp.slice(0, 23)}… (fingerprint pinned, TOFU)`);
        } else if (!reconnecting) {
          this.log("info", `Peer fingerprint verified against pin ${fp.slice(0, 23)}…`);
        }

        this.attachHandlers(socket);
        this.startTimers();
        this.sessionId = this.kvGet("sessionId") ?? "";
        this.send(MsgType.HELLO, {
          protocol: PROTOCOL_VERSION,
          session_id: this.sessionId,
          device_name: this.opts.deviceName ?? "cli-sender",
          platform: "cli",
        });
      });
      socket.once("error", (err) => {
        this.dropped = true; // refused/reset — treated as a drop, backoff applies
        this.log("warn", `connection error: ${(err as Error)?.message ?? err}`);
        reject(err instanceof Error ? err : new Error("connection failed"));
      });

      this.helloResolve = (ack) => {
        this.sessionId = ack.session_id;
        this.kvSet("sessionId", ack.session_id);
        this.maxInFlight = ack.max_in_flight;
        resolve();
      };
      this.helloReject = (err) => reject(err);
    });
  }

  private attachHandlers(socket: tls.TLSSocket): void {
    socket.on("data", (segment) => {
      let frames: DecodedMessage[];
      try {
        frames = this.decoder.feed(segment) as DecodedMessage[];
      } catch (err) {
        this.fatalError = err as Error;
        this.abort();
        return;
      }
      for (const f of frames) this.handleFrame(f);
    });
    socket.on("close", () => {
      this.stopTimers();
      if (this.helloResolve || this.helloReject) {
        // Closed during handshake (e.g. UNPAIRED rejection).
        const err = this.fatalError ?? new Error("connection closed during handshake");
        this.helloResolve = null;
        const reject = this.helloReject;
        this.helloReject = null;
        reject?.(err);
        return;
      }
      if (!this.intentionallyClosed) {
        this.dropped = true;
        this.inFlight.clear();
        this.active = null; // a drop invalidates the in-flight file task
        this.activeFailed = false;
        this.verifiedResolve = null;
        this.gapResolve = null;
        this.dropResolve?.();
        this.poke();
      }
    });
    socket.on("error", () => {});
  }

  private handleFrame(frame: DecodedMessage): void {
    const payload = frame.payload as Record<string, unknown>;
    switch (frame.type) {
      case MsgType.HELLO_ACK:
        this.helloResolve?.(payload as unknown as HelloAckMsg);
        this.helloResolve = null;
        this.helloReject = null;
        break;
      case MsgType.MANIFEST_ACK:
        this.awaiters.get(`manifest:${payload.page}`)?.();
        break;
      case MsgType.PLAN: {
        const items = (payload as unknown as PlanMsg).items;
        this.log(
          "proto",
          `PLAN received: ${items.map((i) => i.action).join(", ") || "empty"}`
        );
        // A PLAN naming the active file while we await FILE_VERIFIED is a
        // gap-fill request. (gapResolve is armed only in that window, so a
        // resumed session-level PLAN can never be hijacked by a stale task.)
        if (
          this.active &&
          this.gapResolve &&
          items.length === 1 &&
          items[0].file_id === this.active.item.file_id &&
          items[0].action === "RESUME"
        ) {
          const r = this.gapResolve;
          this.gapResolve = null;
          r(items[0]);
        } else if (this.planResolve) {
          const r = this.planResolve;
          this.planResolve = null;
          r(items);
        } else {
          // PLAN arrived before drain() registered its awaiter (reconnect
          // path sends RESUME_REQ first) — stash it.
          this.earlyPlan = items;
        }
        this.poke();
        break;
      }
      case MsgType.CHUNK_ACK: {
        const ack = payload as unknown as ChunkAckMsg;
        this.inFlight.delete(ack.offset);
        this.acksReceived++;
        if (this.opts.abortAfterAcks && this.acksReceived >= this.opts.abortAfterAcks) {
          this.opts.abortAfterAcks = 0; // fire once
          this.abort();
          return;
        }
        this.poke();
        break;
      }
      case MsgType.FILE_VERIFIED:
        this.verifiedResolve?.(payload as unknown as FileVerifiedMsg);
        this.verifiedResolve = null;
        this.poke();
        break;
      case MsgType.ERROR: {
        const e = payload as unknown as ErrorMsg;
        if (e.code === ErrorCode.CHUNK_MISMATCH && e.offset !== undefined && this.active) {
          this.inFlight.delete(e.offset);
          this.stats.retries++;
          const key = `${this.active.item.file_id}:${e.offset}`;
          const tries = (this.chunkRetries.get(key) ?? 0) + 1;
          this.chunkRetries.set(key, tries);
          if (tries > CHUNK_RETRY_LIMIT) {
            this.log("err", `chunk retry limit reached for ${this.active.item.name} — file needs attention`);
            this.active.pendingChunks = [];
            this.activeFailed = true;
          } else {
            this.log("warn", `CHUNK_MISMATCH at offset ${e.offset} — re-sending chunk (${tries}/${CHUNK_RETRY_LIMIT})`);
            this.active.pendingChunks.unshift(e.offset / CHUNK_SIZE);
          }
          this.poke();
        } else if (e.code === ErrorCode.VERIFY_FAILED) {
          this.log("err", `${e.code}: ${e.message}`);
          this.activeFailed = true;
          this.verifiedResolve?.({ file_id: e.file_id ?? "", stored_as: "", sha256: "" });
          this.verifiedResolve = null;
          this.poke();
        } else if (!e.retryable) {
          this.fatalError = new Error(`${e.code}: ${e.message}`);
          this.abort();
        } else {
          this.log("warn", `${e.code}: ${e.message}`);
        }
        break;
      }
      case MsgType.HEARTBEAT:
      case MsgType.BYE:
        this.poke();
        break;
    }
  }

  /* ------------------------------ manifest ------------------------------ */

  private async sendManifest(items: ManifestItem[]): Promise<void> {
    const pages = Math.max(1, Math.ceil(items.length / MANIFEST_PAGE_SIZE));
    for (let p = 0; p < pages; p++) {
      const slice = items.slice(p * MANIFEST_PAGE_SIZE, (p + 1) * MANIFEST_PAGE_SIZE);
      const acked = new Promise<void>((res) => this.awaiters.set(`manifest:${p}`, res));
      this.send(MsgType.MANIFEST, { page: p, pages, selection: "all", items: slice });
      await acked;
    }
    this.log("proto", `MANIFEST → ${pages} page(s) of ≤${MANIFEST_PAGE_SIZE} items`);
  }

  /* ------------------------------ transfer ------------------------------ */

  private async drain(): Promise<void> {
    const plan =
      this.earlyPlan ?? (await new Promise<PlanItem[]>((res) => (this.planResolve = res)));
    this.earlyPlan = null;
    this.active = null; // a fresh plan supersedes any task state from a dropped connection
    this.queue = [];
    let skipped = 0;
    for (const p of plan) {
      if (p.action === "SKIP") {
        skipped++;
        this.stats.filesSkipped++;
        continue;
      }
      const item = this.manifestById.get(p.file_id);
      if (!item) continue; // not in this library scan (e.g. re-planned row) — receiver owns it
      const totalChunks = Math.max(1, Math.ceil(item.size / CHUNK_SIZE));
      const pendingChunks =
        p.action === "RESUME" && p.chunk_map
          ? ChunkMap.fromBase64(totalChunks, p.chunk_map).missing()
          : Array.from({ length: totalChunks }, (_, i) => i);
      this.queue.push({ item, absPath: path.join(path.resolve(this.opts.libraryDir), item.rel_path), pendingChunks });
    }
    if (skipped > 0) this.log("ok", `${skipped} were already backed up — skipped automatically`);

    while (this.queue.length > 0) {
      const task = this.queue[0];
      this.active = task;
      this.activeFailed = false;
      await this.transferFile(task);
      if (this.dropped) throw new Error("dropped mid-transfer");
      this.queue.shift();
      this.active = null;
    }

    this.send(MsgType.BYE, {});
    this.intentionallyClosed = true;
    // The receiver ends the socket after journaling the BYE — awaiting the
    // close guarantees its final state (COMPLETE) is on disk when run()
    // resolves.
    await new Promise<void>((res) => {
      const s = this.socket;
      if (!s || s.destroyed) return res();
      const timer = setTimeout(res, 2_000);
      timer.unref(); // never keep the process alive for this safety net
      s.once("close", () => {
        clearTimeout(timer);
        res();
      });
      s.end();
    });
  }

  private async transferFile(task: FileTask): Promise<void> {
    const { item } = task;
    this.log("info", `→ ${item.name} (${task.pendingChunks.length} chunk(s) to send)`);

    // Windowed chunk stream
    while (task.pendingChunks.length > 0 || this.inFlight.size > 0) {
      if (this.dropped) throw new Error("dropped");
      while (this.inFlight.size < this.maxInFlight && task.pendingChunks.length > 0 && !this.dropped) {
        const index = task.pendingChunks.shift()!;
        this.sendChunk(task, index);
      }
      if (task.pendingChunks.length > 0 || this.inFlight.size > 0) await this.wait();
    }
    if (this.activeFailed) {
      this.stats.filesNeedsAttention++;
      this.log("warn", `${item.name}: needs attention (chunk retry limit reached)`);
      return;
    }

    // FILE_DONE → wait for verification or a gap-fill plan (§5.5)
    for (;;) {
      if (this.dropped) throw new Error("dropped");
      this.send(MsgType.FILE_DONE, { file_id: item.file_id, size: item.size });
      const result = await Promise.race([
        new Promise<{ kind: "verified"; v: FileVerifiedMsg }>((res) => {
          this.verifiedResolve = (v) => res({ kind: "verified", v });
        }),
        new Promise<{ kind: "gaps"; g: PlanItem }>((res) => {
          this.gapResolve = (g) => res({ kind: "gaps", g });
        }),
        new Promise<{ kind: "dropped" }>((res) => {
          this.dropResolve = () => res({ kind: "dropped" });
        }),
      ]);
      this.verifiedResolve = null;
      this.gapResolve = null;
      this.dropResolve = null;
      if (result.kind === "dropped" || this.dropped) throw new Error("dropped");
      if (result.kind === "gaps") {
        const totalChunks = Math.max(1, Math.ceil(item.size / CHUNK_SIZE));
        task.pendingChunks = ChunkMap.fromBase64(totalChunks, result.g.chunk_map!).missing();
        this.log("warn", `${item.name}: receiver missing ${task.pendingChunks.length} chunk(s) — filling gaps`);
        while (task.pendingChunks.length > 0 || this.inFlight.size > 0) {
          if (this.dropped) throw new Error("dropped");
          while (this.inFlight.size < this.maxInFlight && task.pendingChunks.length > 0 && !this.dropped) {
            this.sendChunk(task, task.pendingChunks.shift()!);
          }
          if (task.pendingChunks.length > 0 || this.inFlight.size > 0) await this.wait();
        }
        continue;
      }
      const v = result.v;
      if (v.stored_as) {
        this.stats.filesStored++;
        this.markVerified(item.file_id);
        this.log("ok", `FILE_VERIFIED ${item.name} → ${v.stored_as}`);
      } else {
        this.stats.filesNeedsAttention++;
        this.log("warn", `${item.name}: needs attention (verification failed)`);
      }
      return;
    }
  }

  private sendChunk(task: FileTask, index: number): void {
    const { item, absPath } = task;
    const offset = index * CHUNK_SIZE;
    const data = this.readChunk(absPath, offset, item.size);
    let wire = data;
    const want = this.opts.corruptChunkAt;
    if (want && !this.corruptedOnce && want.fileName === item.name && want.offset === offset) {
      // Corrupt the bytes in flight but keep the original hash — exactly what
      // a network glitch looks like to the receiver's xxHash64 check.
      wire = Buffer.from(data);
      wire[0] = wire[0] ^ 0xff;
      this.corruptedOnce = true;
    }
    this.inFlight.add(offset);
    this.writeRaw(
      encodeChunkFrame({ fileIdHash: fileIdHash(item.file_id), offset, data: wire, xxh64: xxh64BigInt(data) })
    );
    this.stats.chunksSent++;
    this.stats.bytesSent += wire.length;
  }

  private readChunk(absPath: string, offset: number, fileSize: number): Buffer {
    const len = Math.min(CHUNK_SIZE, fileSize - offset);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(absPath, "r");
    try {
      fs.readSync(fd, buf, 0, len, offset);
    } finally {
      fs.closeSync(fd);
    }
    return buf;
  }

  /* ------------------------------ plumbing ------------------------------ */

  private markVerified(fileId: string): void {
    this.db
      .prepare(
        `INSERT INTO transfers (file_id, session_id, size, mtime, fingerprint, verified, updated_at)
         VALUES (?, ?, 0, 0, '', 1, ?)
         ON CONFLICT(file_id) DO UPDATE SET verified = 1, updated_at = excluded.updated_at`
      )
      .run(fileId, this.sessionId, Date.now());
  }

  private kvGet(key: string): string | undefined {
    const row = this.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value;
  }

  private kvSet(key: string, value: string): void {
    this.db
      .prepare(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }

  private send(type: number, payload: Record<string, unknown>): void {
    this.writeRaw(encodeFrame(type as never, payload));
  }

  private writeRaw(buf: Buffer): void {
    if (!this.socket || this.socket.destroyed || this.dropped) {
      this.dropped = true;
      this.poke();
      return;
    }
    // Test hook: sever the link once N bytes have gone out. Checked before
    // writing so the crossing chunk never reaches the receiver.
    if (this.opts.abortAfterBytes && this.bytesThisConnection + buf.length >= this.opts.abortAfterBytes) {
      this.opts.abortAfterBytes = 0; // fire once
      this.abort();
      return;
    }
    this.bytesThisConnection += buf.length;
    this.socket.write(buf);
  }

  private startTimers(): void {
    this.stopTimers();
    this.heartbeat = setInterval(() => {
      if (!this.dropped) this.send(MsgType.HEARTBEAT, { t: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
    if (this.opts.chaosDropRate && this.opts.chaosDropRate > 0) {
      const perTick = this.opts.chaosDropRate / 4; // 4 ticks per second
      this.chaosTimer = setInterval(() => {
        if (Math.random() < perTick) this.abort();
      }, 250);
    }
  }

  private stopTimers(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.chaosTimer) clearInterval(this.chaosTimer);
    this.heartbeat = null;
    this.chaosTimer = null;
  }

  private poke(): void {
    const s = this.signal;
    this.signal = null;
    s?.();
  }

  private wait(): Promise<void> {
    // If the drop already happened before we started waiting, resolve
    // immediately — otherwise the poke was missed and we'd hang forever.
    if (this.dropped) return Promise.resolve();
    return new Promise((r) => (this.signal = r));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
