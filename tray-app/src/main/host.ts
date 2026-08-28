/**
 * TrayHost — the pure-Node brain of the Windows tray app.
 *
 * USB-first: no phone app, ever. The elderly-user journey is:
 *   plug in the cable → everything copies itself → unplug when it says so.
 *
 * The host polls for a portable device, runs the fault-tolerant
 * UsbTransferEngine against it, and translates progress into a tiny state
 * model with copy-deck headlines (docs/ux-design.md §0/§4). Interruption is
 * a first-class state: "The cable came loose — plug it back in."
 *
 * The receiver-based Wi-Fi/QR path in relay/ remains available for the
 * future companion apps, but the tray UI is cable-only.
 */
import os from "node:os";
import path from "node:path";
import { CableRemovedError, UsbTransferEngine, type EngineProgress } from "./usb/engine.js";
import { WpdSource } from "./usb/wpd.js";
import type { UsbDevice, UsbSource } from "./usb/source.js";
import type { TrayPhase, TrayState } from "../shared/state.js";

export type { TrayPhase, TrayState };

export interface TrayHostOptions {
  libraryDir: string;
  /** Injectable source — tests and demo mode use FolderSource */
  source?: UsbSource;
  /** Device poll cadence (default 2500 ms) */
  devicePollMs?: number;
  /** Idle rescan cadence while a synced phone stays plugged in (default 30 s) */
  idleRescanMs?: number;
}

const COPY = {
  plug: "Plug the phone into this computer with its USB cable",
  plugHint: "Use the phone's own charging cable. The very first time, the phone may ask — tap “Allow” or “Trust” once.",
  transferring: (done: number, total: number) =>
    `Copying your photos… ${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`,
  waiting: "The cable came loose — plug it back in. It will continue by itself.",
  done: (n: number) =>
    `All done! ${n.toLocaleString("en-US")} photos and videos are safe on this computer. You can unplug the cable now.`,
};

export class TrayHost {
  private engine: UsbTransferEngine | null = null;
  private readonly source: UsbSource;
  private readonly pollMs: number;
  private readonly idleRescanMs: number;
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private lastSyncAt = 0;
  private listeners = new Set<(s: TrayState) => void>();
  private state: TrayState;

  constructor(private readonly opts: TrayHostOptions) {
    this.source = opts.source ?? new WpdSource();
    this.pollMs = opts.devicePollMs ?? 2500;
    this.idleRescanMs = opts.idleRescanMs ?? 30_000;
    this.state = {
      phase: "plug",
      pairUri: null,
      sasWords: null,
      deviceName: null,
      headline: COPY.plug,
      doneItems: 0,
      totalItems: 0,
      bytesDone: 0,
      bytesTotal: 0,
      skipped: 0,
      libraryDir: opts.libraryDir,
      receiverFingerprint: "",
    };
  }

  get current(): TrayState {
    return this.state;
  }

  subscribe(fn: (s: TrayState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private setState(patch: Partial<TrayState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  async start(): Promise<void> {
    this.engine = new UsbTransferEngine({
      libraryDir: this.opts.libraryDir,
      source: this.source,
      onProgress: (p) => this.onProgress(p),
    });
    await this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.pollMs);
  }

  private onProgress(p: EngineProgress): void {
    this.setState({
      totalItems: p.total,
      doneItems: p.done,
      skipped: p.skipped,
      bytesTotal: p.bytesTotal,
      bytesDone: p.bytesDone,
      headline:
        this.state.phase === "transferring" ? COPY.transferring(p.done, p.total) : this.state.headline,
    });
  }

  /** One device poll + maybe a sync. Single-flight via this.syncing. */
  private async pollOnce(): Promise<void> {
    if (!this.engine || this.syncing) return;

    let devices: UsbDevice[] = [];
    try {
      devices = await this.source.listDevices();
    } catch {
      devices = []; // a flaky enumerator looks exactly like "no phone"
    }

    if (devices.length === 0) {
      if (this.state.phase !== "transferring" && this.state.phase !== "waiting") {
        this.setState({ phase: "plug", deviceName: null, headline: COPY.plug });
      }
      // If a sync was in flight, its copy error path already set "waiting".
      return;
    }

    const device = devices[0];
    const idleLongEnough = Date.now() - this.lastSyncAt > this.idleRescanMs;
    const shouldSync =
      this.state.phase === "plug" ||
      this.state.phase === "waiting" ||
      (this.state.phase === "done" && idleLongEnough);

    if (!shouldSync) return;

    this.syncing = true;
    this.setState({
      phase: "transferring",
      deviceName: device.name,
      headline: "Phone found. Getting your photos ready…",
    });
    try {
      const res = await this.engine.sync(device);
      this.lastSyncAt = Date.now();
      const total = this.engine.libraryStats().stored;
      this.setState({
        phase: "done",
        headline: COPY.done(total),
        doneItems: this.state.doneItems,
        totalItems: this.state.totalItems,
      });
      void res;
    } catch (err) {
      if (err instanceof CableRemovedError) {
        this.setState({ phase: "waiting", headline: COPY.waiting });
      } else {
        // Unexpected engine error: surface plainly, stay recoverable.
        this.setState({ phase: "waiting", headline: COPY.waiting });
      }
    } finally {
      this.syncing = false;
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.engine?.close();
    this.engine = null;
  }

  /** Library directory displayed to the user on the Done screen. */
  get libraryDir(): string {
    return path.resolve(this.opts.libraryDir);
  }
}
