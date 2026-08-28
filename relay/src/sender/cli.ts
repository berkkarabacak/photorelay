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

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    trust: { type: "string" },
    state: { type: "string" },
    name: { type: "string", default: "cli-sender" },
    chaos: { type: "string", default: "0" },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.from || !values.to) {
  console.log(`PhotoRelay reference sender (RelaySync/1)

Usage:
  npm run sender -- --from <media-dir> --to <host:port> [options]

Options:
  --from <dir>        Folder acting as the phone library (required)
  --to <host:port>    Receiver address (required)
  --trust <fp>        Expected receiver fingerprint (TOFU pairing)
  --state <dir>       Sender state dir (default: <from>/.photorelay-sender)
  --name <name>       Device name shown on the PC (default: cli-sender)
  --chaos <p>         Random drop probability per second, 0–1 (testing)
  --help              This message
`);
  process.exit(values.help ? 0 : 1);
}

const [host, portStr] = values.to!.split(":");
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

const sender = new Sender({
  host,
  port: Number(portStr),
  libraryDir: values.from!,
  stateDir: values.state ?? `${values.from}/.photorelay-sender`,
  deviceName: values.name,
  trustFingerprint: values.trust,
  chaosDropRate: Number(values.chaos),
  log,
});

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
