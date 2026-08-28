/**
 * RelaySync/1 receiver server (transfer-protocol.md §3.1, security-model.md §4).
 *
 *  - TLS 1.3 only, self-signed per-device cert, mutual auth
 *  - peer certificates pinned by SHA-256 fingerprint (TOFU)
 *  - one active session per device (others get BUSY)
 *  - unknown devices are admitted only in pairing mode (--pair), which is
 *    the reference stand-in for the QR + SAS ceremony
 */
import tls from "node:tls";
import path from "node:path";
import { ErrorCode, MsgType } from "../protocol/constants.js";
import { encodeFrame } from "../protocol/frames.js";
import { loadOrCreateIdentity, peerFingerprint, type DeviceIdentity } from "../pairing/certs.js";
import { Journal } from "./journal.js";
import { MediaStore } from "./store.js";
import { ReceiverSession, type Logger } from "./session.js";

export interface ReceiverOptions {
  /** Library root, e.g. D:\\Photos (created if missing) */
  rootDir: string;
  port: number; // 0 = ephemeral (tests)
  deviceName?: string; // this PC's display name
  /** Pairing mode: admit and pin the next unknown device that connects */
  pair?: boolean;
  /** Pre-trusted sender fingerprints (simulates a completed SAS confirmation) */
  acceptFingerprints?: string[];
  /** Level-3 SHA-256 verification at finalize (default true) */
  verifyFull?: boolean;
  log?: Logger;
}

export class Receiver {
  readonly rootDir: string;
  readonly identity: DeviceIdentity;
  readonly journal: Journal;
  readonly store: MediaStore;
  private readonly server: tls.Server;
  private readonly opts: ReceiverOptions;
  private readonly log: Logger;
  private readonly activeByDevice = new Map<string, ReceiverSession>();
  private readonly sockets = new Set<tls.TLSSocket>();
  private pairedThisRun: string[] = [];

  private constructor(opts: ReceiverOptions) {
    this.opts = opts;
    this.rootDir = path.resolve(opts.rootDir);
    this.log = opts.log ?? (() => {});
    const stateDir = path.join(this.rootDir, ".photorelay");
    this.identity = loadOrCreateIdentity(stateDir, opts.deviceName ?? "pc");
    this.store = new MediaStore(this.rootDir);
    this.journal = new Journal(path.join(stateDir, "journal.db"));
    this.server = tls.createServer(
      {
        key: this.identity.key,
        cert: this.identity.cert,
        minVersion: "TLSv1.3",
        maxVersion: "TLSv1.3",
        requestCert: true,
        rejectUnauthorized: false, // we pin manually (TOFU)
      },
      (socket) => this.onConnection(socket)
    );
  }

  static async start(opts: ReceiverOptions): Promise<Receiver> {
    const r = new Receiver(opts);
    await new Promise<void>((resolve, reject) => {
      r.server.once("error", reject);
      r.server.listen(opts.port, () => resolve());
    });
    const addr = r.server.address();
    r.boundPort = typeof addr === "object" && addr ? addr.port : opts.port;
    r.log("info", `Receiver listening on port ${r.port} — library root ${r.rootDir}`);
    r.log("info", `This PC's fingerprint (pairing): ${r.identity.fingerprint}`);
    return r;
  }

  private boundPort = 0;

  get port(): number {
    return this.boundPort;
  }

  get pairedDevices(): string[] {
    const rows = this.journal.db.prepare(`SELECT device_id FROM devices`).all() as Array<{ device_id: string }>;
    return rows.map((r) => r.device_id);
  }

  private onConnection(socket: tls.TLSSocket): void {
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
    socket.on("error", () => {}); // handshake failures of rejected peers are noise
    // The connection callback fires after the TLS handshake completes, so the
    // peer certificate is already available here.
    {
      const fp = peerFingerprint(socket.getPeerCertificate());
      if (!fp) {
        socket.end(encodeFrame(MsgType.ERROR, { code: ErrorCode.UNPAIRED, retryable: false, message: "client certificate required" }));
        return;
      }
      const trusted =
        this.journal.isDevicePaired(fp) ||
        this.opts.acceptFingerprints?.includes(fp) ||
        this.pairedThisRun.includes(fp);

      if (!trusted) {
        if (this.opts.pair) {
          // Pairing mode: pin on first contact (stand-in for QR + SAS confirm).
          this.journal.upsertDevice(fp, "pairing-device", "unknown");
          this.pairedThisRun.push(fp);
          this.log("ok", `Paired new device: ${fp.slice(0, 23)}… (SAS confirmation assumed)`);
        } else {
          socket.end(
            encodeFrame(MsgType.ERROR, {
              code: ErrorCode.UNPAIRED,
              retryable: false,
              message: "device not paired — restart receiver with --pair",
            })
          );
          return;
        }
      }

      if (this.activeByDevice.has(fp)) {
        socket.end(
          encodeFrame(MsgType.ERROR, { code: ErrorCode.BUSY, retryable: true, message: "another session is active for this device" })
        );
        return;
      }

      const session = new ReceiverSession({
        socket,
        journal: this.journal,
        store: this.store,
        deviceId: fp,
        verifyFull: this.opts.verifyFull ?? true,
        log: this.log,
      });
      this.activeByDevice.set(fp, session);
      socket.once("close", () => this.activeByDevice.delete(fp));
      session.attach();
    }
  }

  /** Abrupt stop — sockets destroyed, no BYE. Simulates a crash/power loss. */
  destroy(): void {
    this.server.close();
    for (const s of this.sockets) s.destroy();
    // Let socket 'close' handlers journal the interruption before closing the db.
    setTimeout(() => {
      try {
        this.journal.close();
      } catch {
        /* already closed */
      }
    }, 50);
  }

  async stop(): Promise<void> {
    this.server.close();
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => this.server.once("close", resolve));
    this.journal.close();
  }
}
