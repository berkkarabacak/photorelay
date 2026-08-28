/**
 * Tray-host USB journey — the elderly-user flow, automated:
 *   open app → "plug the cable in" → phone found → copies itself →
 *   cable bumped → "plug it back in" → continues by itself → "All done!"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TrayHost, type TrayState } from "../src/main/host.js";
import { FolderSource } from "../src/main/usb/source.js";
import { parsePairingPayload } from "../../relay/src/pairing/certs.js";
import { makeLibrary } from "../../relay/tests/helpers.ts";

function setup(label: string) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `photorelay-trayusb-${label}-`));
  const phoneDir = path.join(base, "phone");
  const pcDir = path.join(base, "pc");
  makeLibrary(phoneDir, [
    { name: "IMG_1.jpg", size: 120_000, ageDays: 3 },
    { name: "IMG_2.jpg", size: 95_000, ageDays: 2 },
    { name: "IMG_3.heic", size: 210_000, ageDays: 1 },
    { name: "VID_1.mp4", size: 900_000, ageDays: 0 },
  ]);
  return { base, phoneDir, pcDir };
}

async function waitForPhase(host: TrayHost, phase: string, ms = 10_000): Promise<TrayState> {
  const deadline = Date.now() + ms;
  while (host.current.phase !== phase && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return host.current;
}

test("tray usb: plug in → copies itself → all done", async () => {
  const { phoneDir, pcDir } = setup("journey");
  const source = new FolderSource(phoneDir, "Mum's Phone");
  const host = new TrayHost({ libraryDir: pcDir, source, devicePollMs: 60 });
  const phases = new Set<string>();
  host.subscribe((s) => phases.add(s.phase));

  await host.start();
  const done = await waitForPhase(host, "done");

  assert.equal(done.phase, "done");
  assert.ok(done.headline.startsWith("All done!"));
  assert.ok(done.headline.includes("unplug the cable"));
  assert.equal(done.deviceName, "Mum's Phone");
  assert.equal(done.doneItems, 4);
  assert.ok(phases.has("transferring"));

  // Unplug → back to the plug screen, ready for next time.
  source.connected = false;
  const plug = await waitForPhase(host, "plug");
  assert.equal(plug.headline, "Plug the phone into this computer with its USB cable");

  await host.stop();
});

test("tray usb: cable bump mid-copy → waiting → continues by itself", async () => {
  const { phoneDir, pcDir } = setup("bump");
  makeLibrary(phoneDir, [{ name: "VID_big.mp4", size: 2_500_000, ageDays: 0 }]);
  const source = new FolderSource(phoneDir, "Test Phone");
  const host = new TrayHost({ libraryDir: pcDir, source, devicePollMs: 60 });
  const phases: string[] = [];
  host.subscribe((s) => {
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
  });

  source.failCopyAfterBytes = 1_000_000; // cable bump during the big video
  await host.start();
  const waiting = await waitForPhase(host, "waiting");
  assert.equal(waiting.phase, "waiting");
  assert.ok(waiting.headline.includes("plug it back in"));

  // Cable back in (engine retries by itself on the next poll)
  const done = await waitForPhase(host, "done");
  assert.equal(done.phase, "done");
  assert.equal(done.doneItems, 5);
  assert.ok(phases.includes("waiting"));
  assert.ok(phases.indexOf("waiting") < phases.indexOf("done"));

  await host.stop();
});

test("tray usb: new photos on re-plug are picked up incrementally", async () => {
  const { phoneDir, pcDir } = setup("incremental");
  const source = new FolderSource(phoneDir, "Test Phone");
  const host = new TrayHost({ libraryDir: pcDir, source, devicePollMs: 60, idleRescanMs: 200 });
  await host.start();
  await waitForPhase(host, "done");

  // She takes two new photos while the phone is plugged in.
  makeLibrary(phoneDir, [
    { name: "IMG_new1.jpg", size: 50_000, ageDays: 0 },
    { name: "IMG_new2.jpg", size: 60_000, ageDays: 0 },
  ]);
  const deadline = Date.now() + 10_000;
  while (host.current.doneItems < 6 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(host.current.doneItems, 6, "new photos were copied without any taps");
  await host.stop();
});

test("pairing payload validation still holds (future companion-app mode)", () => {
  assert.throws(() => parsePairingPayload("https://example.com/?v=1"), /not a RelaySync/);
  assert.throws(() => parsePairingPayload("relaysync://pair?v=1&host=192.168.1.2"), /incomplete/);
  const expired = `relaysync://pair?v=1&host=192.168.1.2&port=47822&pk=AA:BB&nonce=abc&exp=1000`;
  assert.throws(() => parsePairingPayload(expired), /expired/);
});
