/**
 * PhotoRelay demo engine — a working, in-browser model of the RelaySync/1
 * protocol state machine (docs/transfer-protocol.md).
 *
 * It implements the same constants and concepts as the spec:
 *  - 256 KiB chunks with per-file chunk maps (the receiver journal)
 *  - manifest → PLAN (SKIP / RESUME / SEND) on every (re)connection
 *  - journal-first acknowledgements (a chunk only counts once journaled)
 *  - interruption as a first-class state, resume from journaled offsets
 *  - async full-file verification queue before promotion to "stored"
 *  - duplicate detection via the dedup index
 *
 * The transfer runs at an accelerated, simulated throughput so a ~24 GB
 * library completes in about a minute.
 */

export const CHUNK_SIZE = 262_144; // RelaySync/1 normative chunk size
export const PROTOCOL_VERSION = "RelaySync/1";
export const DEVICE_NAME = "Pixel 8 Pro";
export const LIBRARY_ITEMS = 3_061;
export const DUPLICATE_ITEMS = 214;
/** Simulated link throughput (bytes/sec). ~8× typical Wi-Fi 5 real speed. */
const BASE_SPEED = 340 * 1024 * 1024;
const MAX_IN_FLIGHT = 16; // chunks

export type SessionState =
  | "idle"
  | "pairing"
  | "manifest"
  | "transferring"
  | "waiting" // connection lost — waiting for phone…
  | "resuming" // connected — resuming transfer…
  | "complete";

export type FileStatus = "queued" | "sending" | "verifying" | "stored" | "skipped";

export interface SimFile {
  id: string;
  name: string;
  dir: string;
  size: number;
  mtime: number;
  media: "photo" | "video";
  chunksTotal: number;
  chunkMap: Uint8Array; // receiver journal: 1 = durably stored
  receivedChunks: number;
  duplicate: boolean;
  status: FileStatus;
}

export interface LogEntry {
  id: number;
  t: number;
  kind: "info" | "proto" | "ok" | "warn" | "err";
  msg: string;
}

export interface Snapshot {
  state: SessionState;
  filesTotal: number;
  filesStored: number;
  filesSkipped: number;
  bytesTotal: number; // excludes duplicates (they are never sent)
  bytesVerified: number;
  skippedBytes: number;
  retries: number;
  reconnects: number;
  speed: number; // current B/s (0 while waiting)
  history: number[]; // recent speed samples 0..1
  currentFile: SimFile | null;
  recentFiles: SimFile[];
  log: LogEntry[];
  elapsedSec: number;
  chaos: boolean;
}

/* ------------------------------------------------------------------ */
/* Deterministic library generation                                    */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHOTO_DIRS = ["DCIM/Camera", "DCIM/Camera", "DCIM/Camera", "Pictures/Screenshots", "DCIM/OpenCamera", "Pictures/WhatsApp"];
const VIDEO_DIRS = ["DCIM/Camera", "DCIM/Camera", "Movies", "DCIM/OpenCamera"];
const MONTHS = ["2024-09", "2024-11", "2025-01", "2025-03", "2025-06", "2025-08", "2025-10", "2026-01", "2026-04", "2026-07", "2026-08"];

function buildLibrary(): SimFile[] {
  const rnd = mulberry32(0x5eed);
  const files: SimFile[] = [];
  const photoCount = 2_614;
  const videoCount = LIBRARY_ITEMS - photoCount; // 447

  const pad = (n: number, w = 2) => String(n).padStart(w, "0");

  for (let i = 0; i < LIBRARY_ITEMS; i++) {
    const isVideo = i >= photoCount;
    const month = MONTHS[Math.floor(rnd() * MONTHS.length)];
    const [y, m] = month.split("-");
    const day = pad(1 + Math.floor(rnd() * 28));
    const hh = pad(Math.floor(rnd() * 24));
    const mm = pad(Math.floor(rnd() * 60));
    const ss = pad(Math.floor(rnd() * 60));
    const stamp = `${y}${m}${day}_${hh}${mm}${ss}`;

    let name: string, size: number, dir: string, media: "photo" | "video";
    if (!isVideo) {
      const roll = rnd();
      const ext = roll < 0.82 ? "jpg" : roll < 0.9 ? "heic" : "png";
      const prefix = ext === "png" ? "Screenshot" : "IMG";
      name = `${prefix}_${stamp}.${ext}`;
      size = Math.floor(1.8 * 1024 * 1024 + rnd() * 6.5 * 1024 * 1024); // 1.8–8.3 MB
      dir = PHOTO_DIRS[Math.floor(rnd() * PHOTO_DIRS.length)];
      media = "photo";
    } else {
      const ext = rnd() < 0.9 ? "mp4" : "mov";
      name = `VID_${stamp}.${ext}`;
      const big = rnd() < 0.12; // a handful of very large videos
      size = big
        ? Math.floor(900 * 1024 * 1024 + rnd() * 1.6 * 1024 * 1024 * 1024) // 0.9–2.5 GB
        : Math.floor(18 * 1024 * 1024 + rnd() * 220 * 1024 * 1024); // 18–238 MB
      dir = VIDEO_DIRS[Math.floor(rnd() * VIDEO_DIRS.length)];
      media = "video";
    }

    const chunksTotal = Math.max(1, Math.ceil(size / CHUNK_SIZE));
    const duplicate = i < DUPLICATE_ITEMS; // first N items were already backed up

    files.push({
      id: `ms:${10_000_000 + i}:1`,
      name,
      dir,
      size,
      mtime: Date.parse(`${y}-${m}-${day}T${hh}:${mm}:${ss}Z`),
      media,
      chunksTotal,
      chunkMap: new Uint8Array(chunksTotal),
      receivedChunks: 0,
      duplicate,
      status: "queued",
    });
  }
  return files;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

type Listener = (snap: Snapshot) => void;

export class TransferSim {
  private files: SimFile[] = [];
  private state: SessionState = "idle";
  private cursor = 0; // index of file currently sending
  private verifyQueue: SimFile[] = [];
  private verifyProgress = 0; // seconds spent verifying queue head
  private bytesVerified = 0;
  private skippedBytes = 0;
  private retries = 0;
  private reconnects = 0;
  private speed = 0;
  private history: number[] = [];
  private log: LogEntry[] = [];
  private logId = 0;
  private listeners = new Set<Listener>();
  private startedAt: number | null = null;
  private stateUntil = 0; // timestamp when transient state ends
  private rnd = mulberry32(0xc0ffee);
  chaos = false;

  constructor() {
    this.files = buildLibrary();
    this.pushLog("info", `${DEVICE_NAME} paired — library: ${LIBRARY_ITEMS.toLocaleString("en-US")} items`);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private pushLog(kind: LogEntry["kind"], msg: string) {
    this.log = [...this.log.slice(-79), { id: ++this.logId, t: Date.now(), kind, msg }];
  }

  start() {
    if (this.state !== "idle") return;
    this.startedAt = Date.now();
    this.state = "pairing";
    this.stateUntil = Date.now() + 1100;
    this.pushLog("proto", `HELLO → session 8f3a…c21 (${PROTOCOL_VERSION})`);
    this.emit();
  }

  reset() {
    this.files = buildLibrary();
    this.state = "idle";
    this.cursor = 0;
    this.verifyQueue = [];
    this.verifyProgress = 0;
    this.bytesVerified = 0;
    this.skippedBytes = 0;
    this.retries = 0;
    this.reconnects = 0;
    this.speed = 0;
    this.history = [];
    this.startedAt = null;
    this.pushLog("info", "Session reset — ready to transfer");
    this.emit();
  }

  /** Pull the plug: Wi-Fi drop, phone out of pocket range, etc. */
  disconnect(reason?: string) {
    if (this.state !== "transferring" && this.state !== "resuming") return;
    this.state = "waiting";
    this.speed = 0;
    this.pushLog("err", reason ?? "Connection lost — waiting for phone…");
    this.emit();
  }

  /** Phone came back: HELLO → journal replay → PLAN resume. */
  reconnect() {
    if (this.state !== "waiting") return;
    this.state = "resuming";
    this.stateUntil = Date.now() + 900;
    this.reconnects++;
    this.pushLog("proto", "Phone rediscovered via mDNS — TLS 1.3 resumed");
    this.pushLog("proto", "HELLO → receiver replays journal, rebuilds chunk maps");
    this.emit();
  }

  /** PC app crash/restart: state restored purely from the journal. */
  crashReceiver() {
    if (this.state !== "transferring" && this.state !== "resuming" && this.state !== "waiting") return;
    this.state = "resuming";
    this.stateUntil = Date.now() + 1400;
    this.reconnects++;
    this.pushLog("warn", "Receiver restarted unexpectedly — replaying journal…");
    this.pushLog("proto", ".part files reconciled against chunk maps — no data lost");
    this.emit();
  }

  toggleChaos() {
    this.chaos = !this.chaos;
    this.pushLog("info", this.chaos ? "Chaos mode on — random Wi-Fi drops ahead" : "Chaos mode off");
    this.emit();
  }

  /* ------------------------- tick loop --------------------------- */

  tick(dtMs: number) {
    const now = Date.now();

    // Transient states that advance on a timer
    if (this.state === "pairing" && now >= this.stateUntil) {
      this.state = "manifest";
      this.stateUntil = now + 1300;
      this.pushLog("proto", "MANIFEST → 7 pages × 500 items");
      this.emit();
      return;
    }
    if (this.state === "manifest" && now >= this.stateUntil) {
      const skipped = this.files.filter((f) => f.duplicate);
      skipped.forEach((f) => (f.status = "skipped"));
      this.skippedBytes = skipped.reduce((a, f) => a + f.size, 0);
      this.state = "transferring";
      this.pushLog("proto", `PLAN → SKIP ${DUPLICATE_ITEMS} duplicates · SEND ${(LIBRARY_ITEMS - DUPLICATE_ITEMS).toLocaleString("en-US")}`);
      this.pushLog("ok", `${DUPLICATE_ITEMS} were already backed up — skipped automatically`);
      this.emit();
      return;
    }
    if (this.state === "resuming" && now >= this.stateUntil) {
      const f = this.files[this.cursor];
      this.state = "transferring";
      if (f && f.receivedChunks > 0) {
        this.pushLog("proto", `PLAN → RESUME ${f.name} @ ${(f.receivedChunks * CHUNK_SIZE / 1048576).toFixed(1)} MB — verified data never re-sent`);
      }
      this.pushLog("ok", "Connected — resuming transfer…");
      this.emit();
      return;
    }
    if (this.state === "waiting") {
      if (this.chaos && this.rnd() < 0.02) this.reconnect();
      this.emit();
      return;
    }
    if (this.state !== "transferring") return;

    // Chaos: random drops while transferring
    if (this.chaos && this.rnd() < 0.006) {
      this.disconnect("Wi-Fi dropped — waiting for phone… (chaos mode)");
      return;
    }

    // Throughput with jitter
    const target = BASE_SPEED * (0.72 + this.rnd() * 0.5);
    this.speed = this.speed * 0.75 + target * 0.25;
    this.history = [...this.history.slice(-119), Math.min(1, this.speed / (BASE_SPEED * 1.25))];

    let budget = (this.speed * dtMs) / 1000;

    while (budget > 0 && this.cursor < this.files.length) {
      const f = this.files[this.cursor];
      if (f.status === "skipped") {
        this.cursor++;
        continue;
      }
      if (f.status === "queued") {
        f.status = "sending";
      }

      // fill remaining chunks of this file
      const remainingBytes = f.size - f.receivedChunks * CHUNK_SIZE;
      const take = Math.min(budget, remainingBytes);
      const chunksBefore = f.receivedChunks;
      const absoluteBytes = f.receivedChunks * CHUNK_SIZE + take;
      f.receivedChunks = Math.min(f.chunksTotal, Math.floor(absoluteBytes / CHUNK_SIZE));
      for (let c = chunksBefore; c < f.receivedChunks; c++) {
        // chunk corruption → retry (rare; more in chaos mode)
        const corruptP = this.chaos ? 0.004 : 0.0006;
        if (this.rnd() < corruptP) {
          this.retries++;
          this.pushLog("warn", `CHUNK_MISMATCH on ${f.name} — chunk re-requested (xxHash64)`);
        }
        f.chunkMap[c] = 1; // journaled → acked
      }
      budget -= take;

      if (f.receivedChunks >= f.chunksTotal) {
        f.status = "verifying";
        this.verifyQueue.push(f);
        this.pushLog("proto", `FILE_DONE ${f.name}`);
        this.cursor++;
      } else {
        break; // budget exhausted mid-file
      }
    }

    // Async verification queue (SHA-256 spot: simulated as a short delay)
    if (this.verifyQueue.length > 0) {
      const head = this.verifyQueue[0];
      this.verifyProgress += dtMs / 1000;
      const need = Math.min(0.55, 0.06 + head.size / (8 * 1024 * 1024 * 1024)); // big files verify "longer"
      if (this.verifyProgress >= need) {
        this.verifyProgress = 0;
        this.verifyQueue.shift();
        head.status = "stored";
        this.bytesVerified += head.size;
        this.pushLog("ok", `FILE_VERIFIED ${head.name} → stored`);
      }
    }

    // Complete?
    if (this.cursor >= this.files.length && this.verifyQueue.length === 0) {
      this.state = "complete";
      this.speed = 0;
      this.pushLog("ok", `Done. ${(LIBRARY_ITEMS - DUPLICATE_ITEMS).toLocaleString("en-US")} items backed up and verified.`);
    }

    this.emit();
  }

  private snapshot(): Snapshot {
    const recent: SimFile[] = [];
    // last few stored + verifying + current + next queued
    const cur = this.files[this.cursor] ?? null;
    for (let i = Math.max(0, this.cursor - 7); i <= Math.min(this.files.length - 1, this.cursor + 3); i++) {
      const f = this.files[i];
      if (f.status !== "skipped") recent.push(f);
    }
    return {
      state: this.state,
      filesTotal: LIBRARY_ITEMS,
      filesStored: this.files.reduce((a, f) => a + (f.status === "stored" ? 1 : 0), 0),
      filesSkipped: DUPLICATE_ITEMS,
      bytesTotal: this.files.reduce((a, f) => a + (f.duplicate ? 0 : f.size), 0),
      bytesVerified: this.bytesVerified,
      skippedBytes: this.skippedBytes,
      retries: this.retries,
      reconnects: this.reconnects,
      speed: this.speed,
      history: this.history,
      currentFile: cur && cur.status !== "skipped" ? cur : null,
      recentFiles: recent,
      log: this.log,
      elapsedSec: this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0,
      chaos: this.chaos,
    };
  }
}

export { MAX_IN_FLIGHT };
