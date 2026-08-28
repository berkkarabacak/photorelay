/**
 * Receiver CLI — the Windows-side entry point.
 *
 *   npm run receiver -- --root "D:\Photos" [--port 47822] [--pair]
 *
 * Status output uses the UX copy deck (docs/ux-design.md §4).
 */
import { parseArgs } from "node:util";
import os from "node:os";
import { createRequire } from "node:module";
import { pairingPayload } from "../pairing/certs.js";
import { Receiver } from "./server.js";
import type { LogKind } from "./session.js";

const require = createRequire(import.meta.url);
const qrcode = require("qrcode-terminal") as { generate: (text: string, opts: { small: boolean }) => void };

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    port: { type: "string", default: "47822" },
    pair: { type: "boolean", default: false },
    "no-verify-full": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.root) {
  console.log(`PhotoRelay receiver (RelaySync/1)

Usage:
  npm run receiver -- --root <library-dir> [options]

Options:
  --root <dir>        Where photos/videos are stored (required)
  --port <n>          Listen port (default 47822)
  --pair              Pairing mode: admit the next unknown device
  --no-verify-full    Skip Level-3 SHA-256 verification
  --help              This message
`);
  process.exit(values.help ? 0 : 1);
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

const receiver = await Receiver.start({
  rootDir: values.root!,
  port: Number(values.port),
  deviceName: os.hostname(),
  pair: values.pair,
  verifyFull: !values["no-verify-full"],
  log,
});

if (values.pair) {
  const { payload } = pairingPayload({
    host: os.hostname(),
    port: receiver.port,
    fingerprint: receiver.identity.fingerprint,
  });
  console.log("\nPoint your phone's camera at this code (valid 5 min):\n");
  qrcode.generate(payload, { small: true });
  console.log(`\n${payload}\n`);
  console.log("Pairing mode: the first unknown device to connect will be pinned.");
}

console.log("\nWaiting for phone…\n");

process.on("SIGINT", async () => {
  console.log("\nShutting down — state is journaled, transfers resume next launch.");
  await receiver.stop();
  process.exit(0);
});
