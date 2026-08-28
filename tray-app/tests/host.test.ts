/**
 * Tray-app end-to-end: the exact elderly-user journey, automated.
 *
 *   open app → big QR appears → "phone" (reference sender) consumes the
 *   pairing payload → SAS words show → transfer runs → "All done!"
 *
 * Plus pairing-payload validation unit tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TrayHost, type TrayState } from "../src/main/host.js";
import { parsePairingPayload } from "../../relay/src/pairing/certs.js";
import { Sender } from "../../relay/src/sender/client.js";
import { makeLibrary, sha256File } from "../../relay/tests/helpers.ts";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `photorelay-tray-${prefix}-`));
}

test("tray: QR pairing → SAS → automatic transfer → done", async () => {
  const base = tmpDir("e2e");
  const phoneDir = path.join(base, "phone");
  const pcDir = path.join(base, "pc");
  makeLibrary(phoneDir, [
    { name: "IMG_20240101_100000.jpg", size: 120_000, ageDays: 3 },
    { name: "IMG_20240202_110000.jpg", size: 95_000, ageDays: 2 },
    { name: "IMG_20240303_120000.heic", size: 210_000, ageDays: 1 },
    { name: "VID_20240404_130000.mp4", size: 900_000, ageDays: 0 },
  ]);

  const host = new TrayHost({ libraryDir: pcDir, port: 0 });
  await host.start();
  const seen: TrayState[] = [];
  host.subscribe((s) => seen.push(s));

  // The app opens straight into pairing with a QR payload.
  assert.equal(host.current.phase, "pairing");
  assert.ok(host.current.pairUri, "QR payload present");
  assert.equal(host.current.headline, "Point your phone's camera at this picture");

  // The phone "scans the QR": consumes the pairing payload verbatim.
  const pair = parsePairingPayload(host.current.pairUri!);
  assert.equal(pair.port, host.port);
  assert.equal(pair.fingerprint, host.current.receiverFingerprint);

  const sender = new Sender({
    host: "127.0.0.1", // same machine in the test; the QR carries the LAN IP
    port: pair.port,
    libraryDir: phoneDir,
    stateDir: path.join(base, "sender-state"),
    deviceName: "aunts-iphone",
    trustFingerprint: pair.fingerprint, // what the QR pinned
  });

  const stats = await sender.run();
  sender.close();

  assert.equal(stats.filesStored, 4);

  // Host reached "done" with the copy-deck headline.
  const deadline = Date.now() + 5_000;
  while (host.current.phase !== "done" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(host.current.phase, "done");
  assert.ok(host.current.headline.startsWith("All done!"));
  assert.equal(host.current.doneItems, 4);
  assert.equal(host.current.deviceName, "aunts-iphone");

  // The SAS words were shown at pairing time.
  const withSas = seen.find((s) => s.sasWords);
  assert.ok(withSas, "SAS words were displayed");
  assert.equal(withSas!.sasWords!.length, 6);

  // Pairing mode closed itself after pairing (fail closed).
  const rogue = new Sender({
    host: "127.0.0.1",
    port: pair.port,
    libraryDir: phoneDir,
    stateDir: path.join(base, "rogue-state"),
    deviceName: "rogue",
  });
  await assert.rejects(rogue.run(), /UNPAIRED/);
  rogue.close();

  // Every file landed byte-identical in the library folder.
  for (const name of ["IMG_20240101_100000.jpg", "IMG_20240202_110000.jpg", "IMG_20240303_120000.heic", "VID_20240404_130000.mp4"]) {
    const stored = path.join(pcDir, "aunts-iphone");
    let found: string | null = null;
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name === name) found = full;
      }
    };
    walk(stored);
    assert.ok(found, `${name} stored under aunts-iphone/`);
    assert.equal(sha256File(found!), sha256File(path.join(phoneDir, "DCIM/Camera", name)));
  }

  await host.stop();
});

test("tray: second launch skips pairing when a device is already paired", async () => {
  const base = tmpDir("relaunch");
  const pcDir = path.join(base, "pc");
  const host1 = new TrayHost({ libraryDir: pcDir, port: 0 });
  await host1.start();
  assert.equal(host1.current.phase, "pairing");
  // Simulate a completed pairing by registering a device directly.
  host1["receiver"]!.journal.upsertDevice("fp:existing", "aunts-iphone", "ios");
  await host1.stop();

  const host2 = new TrayHost({ libraryDir: pcDir, port: 0 });
  await host2.start();
  assert.equal(host2.current.phase, "ready");
  assert.equal(host2.current.pairUri, null);
  await host2.stop();
});

test("pairing payload validation: bad scheme, missing fields, expiry", () => {
  assert.throws(() => parsePairingPayload("https://example.com/?v=1"), /not a RelaySync/);
  assert.throws(
    () => parsePairingPayload("relaysync://pair?v=1&host=192.168.1.2"),
    /incomplete/
  );
  const expired = `relaysync://pair?v=1&host=192.168.1.2&port=47822&pk=AA:BB&nonce=abc&exp=1000`;
  assert.throws(() => parsePairingPayload(expired), /expired/);
});
