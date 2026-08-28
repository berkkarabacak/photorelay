/**
 * TrayHost — the pure-Node brain of the Windows tray app.
 *
 * Electron's main process is a thin shell around this class; everything here
 * is testable without a display. It wraps the proven relay/ receiver and
 * translates protocol events into a tiny, elderly-friendly state model:
 *
 *   pairing  →  show the big QR code (nothing paired yet)
 *   ready    →  phone paired; transfers start automatically
 *   transferring → copying now (progress as "N of M photos")
 *   waiting  →  "Connection lost — waiting for phone…" (copy deck)
 *   done     →  everything verified
 *
 * Copy strings follow docs/ux-design.md §4 verbatim.
 */
import os from "node:os";
import { Receiver } from "../../../relay/src/receiver/server.js";
import type { ReceiverEvent } from "../../../relay/src/receiver/session.js";
import { pairingPayload } from "../../../relay/src/pairing/certs.js";
import { computeSas } from "../../../relay/src/pairing/sas.js";
import type { TrayPhase, TrayState } from "../shared/state.js";

export type { TrayPhase, TrayState };

export interface TrayHostOptions {
  libraryDir: string;
  port?: number; // 0 = ephemeral (tests)
  deviceName?: string;
}

function lanAddress(): string {
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

export class TrayHost {
  private receiver: Receiver | null = null;
  private listeners = new Set<(s: TrayState) => void>();
  private pairNonce: string | null = null;

  private state: TrayState;

  constructor(private readonly opts: TrayHostOptions) {
    this.state = {
      phase: "pairing",
      pairUri: null,
      sasWords: null,
      deviceName: null,
      headline: "Starting…",
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

  get port(): number {
    return this.receiver?.port ?? 0;
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
    this.receiver = await Receiver.start({
      rootDir: this.opts.libraryDir,
      port: this.opts.port ?? 47822,
      deviceName: this.opts.deviceName ?? os.hostname(),
      // Pairing mode only until at least one device is paired (fail closed).
      pair: false,
      verifyFull: true,
      log: () => {},
      events: (e) => this.onEvent(e),
    });
    this.setState({ receiverFingerprint: this.receiver.identity.fingerprint });

    if (this.receiver.pairedDevices.length === 0) {
      await this.enterPairingMode();
    } else {
      this.setState({ phase: "ready", headline: "Ready. Open PhotoRelay on your phone." });
    }
  }

  /** Show the big QR code and admit the next unknown device that connects. */
  async enterPairingMode(): Promise<void> {
    if (!this.receiver) throw new Error("receiver not started");
    this.receiver.setPairMode(true);
    const { payload, nonce } = pairingPayload({
      host: lanAddress(),
      port: this.receiver.port,
      fingerprint: this.receiver.identity.fingerprint,
    });
    this.pairNonce = nonce;
    this.setState({
      phase: "pairing",
      pairUri: payload,
      sasWords: null,
      headline: "Point your phone's camera at this picture",
    });
  }

  private onEvent(e: ReceiverEvent): void {
    switch (e.type) {
      case "connected": {
        // Phone connected: show the SAS words for one-tap confirmation.
        const sas = this.pairNonce
          ? computeSas(this.state.receiverFingerprint, e.deviceId, this.pairNonce)
          : null;
        this.setState({
          deviceName: e.deviceName,
          sasWords: sas,
          headline: "Check the 6 words match your phone",
        });
        break;
      }
      case "plan": {
        // Pairing succeeded → pairing mode closes (fail closed again).
        this.receiver?.setPairMode(false);
        if (e.send + e.resume === 0) {
          this.setState({
            phase: "done",
            sasWords: null,
            totalItems: e.totalItems,
            skipped: e.skip,
            doneItems: e.skip,
            bytesTotal: e.totalBytes,
            bytesDone: 0,
            headline: `All done. Everything was already backed up.`,
          });
        } else {
          this.setState({
            phase: "transferring",
            sasWords: null,
            totalItems: e.totalItems,
            skipped: e.skip,
            doneItems: e.skip,
            bytesTotal: e.totalBytes,
            bytesDone: 0,
            headline: "Copying your photos…",
          });
        }
        break;
      }
      case "progress": {
        if (this.state.phase !== "transferring" && this.state.phase !== "waiting") break;
        this.refreshProgress();
        break;
      }
      case "file_verified": {
        this.refreshProgress();
        break;
      }
      case "interrupted": {
        this.setState({
          phase: "waiting",
          headline: "Connection lost — waiting for phone…",
        });
        break;
      }
      case "complete": {
        this.setState({
          phase: "done",
          headline: `All done! ${e.stored.toLocaleString("en-US")} photos and videos are safe on this computer.`,
        });
        this.refreshProgress();
        break;
      }
    }
  }

  /** Recompute item/byte progress from the journal (single source of truth). */
  private refreshProgress(): void {
    if (!this.receiver) return;
    const row = this.receiver.journal.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'stored' THEN 1 ELSE 0 END) AS stored,
           SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
           SUM(CASE WHEN status != 'skipped' THEN size ELSE 0 END) AS bytes_total,
           SUM(CASE WHEN status = 'stored' THEN size
                    WHEN status IN ('transferring','interrupted','verifying') THEN have_bytes
                    ELSE 0 END) AS bytes_done
         FROM files`
      )
      .get() as { total: number; stored: number; skipped: number; bytes_total: number; bytes_done: number };
    const totalItems = Number(row.total) || 0;
    const doneItems = (Number(row.stored) || 0) + (Number(row.skipped) || 0);
    this.setState({
      totalItems,
      doneItems,
      skipped: Number(row.skipped) || 0,
      bytesTotal: Number(row.bytes_total) || 0,
      bytesDone: Number(row.bytes_done) || 0,
      headline:
        this.state.phase === "transferring"
          ? `Copying your photos… ${doneItems.toLocaleString("en-US")} of ${totalItems.toLocaleString("en-US")}`
          : this.state.headline,
    });
  }

  async stop(): Promise<void> {
    await this.receiver?.stop();
    this.receiver = null;
  }
}
