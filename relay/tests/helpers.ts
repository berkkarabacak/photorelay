/**
 * Shared test helpers: temp dirs, synthetic libraries, hash comparison,
 * log capture, and a paired receiver/sender factory.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { loadOrCreateIdentity } from "../src/pairing/certs.js";
import { Receiver } from "../src/receiver/server.js";
import { Sender, type SenderOptions } from "../src/sender/client.js";
import type { LogKind } from "../src/receiver/session.js";

export interface CapturedLog {
  entries: Array<{ kind: LogKind; msg: string }>;
  logger: (kind: LogKind, msg: string) => void;
  has: (substr: string) => boolean;
}

export function captureLog(): CapturedLog {
  const entries: Array<{ kind: LogKind; msg: string }> = [];
  return {
    entries,
    logger: (kind, msg) => entries.push({ kind, msg }),
    has: (substr) => entries.some((e) => e.msg.includes(substr)),
  };
}

export function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `photorelay-${prefix}-`));
}

export interface SyntheticFileSpec {
  name: string;
  size: number;
  ageDays?: number; // mtime days in the past (controls newest-first order)
  subdir?: string;
}

/** Write synthetic media files with deterministic content. */
export function makeLibrary(dir: string, specs: SyntheticFileSpec[]): void {
  for (const spec of specs) {
    const sub = spec.subdir ?? "DCIM/Camera";
    const target = path.join(dir, sub);
    fs.mkdirSync(target, { recursive: true });
    // Deterministic content derived from the name (so tests can reason).
    const seed = createHash("sha256").update(spec.name).digest();
    const buf = Buffer.alloc(spec.size);
    for (let i = 0; i < spec.size; i++) buf[i] = seed[i % 32] ^ (i & 0xff);
    const p = path.join(target, spec.name);
    fs.writeFileSync(p, buf);
    const t = new Date(Date.now() - (spec.ageDays ?? 0) * 86_400_000);
    fs.utimesSync(p, t, t);
  }
}

export function sha256File(p: string): string {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** Locate the stored copy of a file inside the receiver library root. */
export function findStored(root: string, fileName: string): string | null {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".photorelay") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name === fileName) hits.push(full);
    }
  };
  walk(root);
  if (hits.length > 1) throw new Error(`duplicate stored copies of ${fileName}: ${hits.join(", ")}`);
  return hits[0] ?? null;
}

export function incomingDirContents(root: string): string[] {
  const dir = path.join(root, ".photorelay", "incoming");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

export interface Paired {
  receiver: Receiver;
  receiverLog: CapturedLog;
  senderFp: string;
  senderStateDir: string;
  libraryDir: string;
  rootDir: string;
}

/** Create a library, a receiver, and a pre-paired sender identity. */
export async function setupPaired(opts: {
  label: string;
  files: SyntheticFileSpec[];
  receiverLog?: CapturedLog;
}): Promise<Paired> {
  const base = tmpDir(opts.label);
  const libraryDir = path.join(base, "phone");
  const rootDir = path.join(base, "pc");
  const senderStateDir = path.join(base, "sender-state");
  fs.mkdirSync(libraryDir, { recursive: true });
  makeLibrary(libraryDir, opts.files);

  // Pre-create the sender identity so the receiver can pre-trust it
  // (stand-in for the QR + SAS ceremony in tests).
  const senderIdentity = loadOrCreateIdentity(senderStateDir, "test-phone");

  const receiverLog = opts.receiverLog ?? captureLog();
  const receiver = await Receiver.start({
    rootDir,
    port: 0,
    deviceName: "test-pc",
    acceptFingerprints: [senderIdentity.fingerprint],
    log: receiverLog.logger,
  });
  return { receiver, receiverLog, senderFp: senderIdentity.fingerprint, senderStateDir, libraryDir, rootDir };
}

export function makeSender(paired: Paired, extra?: Partial<SenderOptions>, log?: CapturedLog): Sender {
  return new Sender({
    host: "127.0.0.1",
    port: paired.receiver.port,
    libraryDir: paired.libraryDir,
    stateDir: paired.senderStateDir,
    deviceName: "test-phone",
    log: log?.logger,
    ...extra,
  });
}

/** Assert every library file landed byte-identical exactly once. */
export function assertLibraryTransferred(paired: Paired): void {
  const walk = (dir: string, out: string[] = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.isFile()) out.push(full);
    }
    return out;
  };
  const sources = walk(paired.libraryDir).filter((p) => !p.includes(".photorelay-sender"));
  for (const src of sources) {
    const stored = findStored(paired.rootDir, path.basename(src));
    if (!stored) throw new Error(`missing stored copy of ${path.basename(src)}`);
    const a = sha256File(src);
    const b = sha256File(stored);
    if (a !== b) throw new Error(`content mismatch for ${path.basename(src)}`);
  }
}
