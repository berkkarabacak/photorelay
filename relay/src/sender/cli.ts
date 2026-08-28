/**
 * Sender CLI — the reference phone-side client.
 *
 *   npm run sender -- --from "D:\FakePhone" --to 192.168.1.20:47822 [--trust <fingerprint>]
 *
 * Status output uses the UX copy deck (docs/ux-design.md §4).
 */
import { parseArgs } from "node:util";
import { Sender, type SenderStats } from "./client.js";
import type { LogKind } from "../receiver/session.js";
import { loadOrCreateIdentity, parsePairingPayload } from "../pairing/certs.js";
import { computeSas, formatSas } from "../pairing/sas.js";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    "pair-uri": { type: "string" },
    trust: { type: "string" },
    state: { type: "string" },
    name: { type: "string", default: "cli-sender" },
    chaos: { type: "string", default: "0" },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.from || (!values.to && !values["pair-uri"])) {
  console.log(`PhotoRelay reference sender (RelaySync/1)

Usage:
  npm run sender -- --from <media-dir> --to <host:port> [options]
  npm run sender -- --from <media-dir> --pair-uri "relaysync://pair?..."   ← what the QR contains

Options:
  --from <dir>        Folder acting as the phone library (required)
  --to <host:port>    Receiver address
  --pair-uri <uri>    Pairing payload from the PC's QR code (sets address + trust)
  --trust <fp>        Expected receiver fingerprint (TOFU pairing)
  --state <dir>       Sender state dir (default: <from>/.photorelay-sender)
  --name <name>       Device name shown on the PC (default: cli-sender)
  --chaos <p>         Random drop probability per second, 0–1 (testing)
  --help              This message
`);
  process.exit(values.help ? 0 : 1);
}

let host: string, port: number, trust: string | undefined, nonce: string | undefined;
if (values["pair-uri"]) {
  const p = parsePairingPayload(values["pair-uri"]);
  host = p.host;
  port = p.port;
  trust = p.fingerprint;
  nonce = p.nonce;
} else {
  const [h, portStr] = values.to!.split(":");
  host = h;
  port = Number(portStr);
  trust = values.trust;
}
const COLORS: Record<LogKind, string> = {
  info: "\x1b[37m",
  proto: "\x1b[36m",
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  err: "\x1b[31m",
};
const log = (kind: LogKind, msg: string) => {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`${"\x1b[90m"}${t}${"\x1b[0m"} ${COLORS[kind]}${msg}${"\x1b[0m"}`);
};

const stateDir = values.state ?? `${values.from}/.photorelay-sender`;
const sender = new Sender({
  host,
  port,
  libraryDir: values.from!,
  stateDir,
  deviceName: values.name,
  trustFingerprint: trust,
  chaosDropRate: Number(values.chaos),
  log,
});

// When pairing via QR payload, show the short authentication string so the
// user can confirm both screens show the same 6 words (security-model §3.5).
if (nonce && trust) {
  const identity = loadOrCreateIdentity(stateDir, values.name ?? "cli-sender");
  console.log(`\nSecurity check — the computer screen should show the same 6 words:`);
  console.log(`\n    ${formatSas(computeSas(trust, identity.fingerprint, nonce))}\n`);
}

try {
  const stats: SenderStats = await sender.run();
  console.log("");
  if (stats.filesNeedsAttention > 0) {
    console.log(`⚠ ${stats.filesNeedsAttention} file(s) need attention — re-run to retry them.`);
  }
  console.log(
    `Done. ${stats.filesStored.toLocaleString("en-US")} items backed up and verified.` +
      (stats.filesSkipped ? ` ${stats.filesSkipped} were already backed up — skipped automatically.` : "")
  );
  console.log(
    `    ${stats.chunksSent.toLocaleString("en-US")} chunks sent (${(stats.bytesSent / 1048576).toFixed(1)} MiB on the wire), ` +
      `${stats.retries} retries, ${stats.reconnects} reconnects.`
  );
} catch (err) {
  console.error(`\nFatal: ${(err as Error).message}`);
  process.exitCode = 2;
} finally {
  sender.close();
}
