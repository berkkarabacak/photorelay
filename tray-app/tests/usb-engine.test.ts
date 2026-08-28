/**
 * UsbTransferEngine tests — the cable-mode promises, proven against a
 * directory-backed fake phone (FolderSource):
 *  - full sync lands byte-identical in <Library>/<Device>/<yyyy>/<yyyy-MM>
 *  - re-plugging copies nothing twice
 *  - mid-copy failure → .part removed → next run resumes, stored files kept
 *  - leftover .part on startup is cleaned (never mistaken for complete)
 *  - non-media files are ignored
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CableRemovedError, UsbTransferEngine } from "../src/main/usb/engine.js";
import { FolderSource } from "../src/main/usb/source.js";
import { makeLibrary, sha256File } from "../../relay/tests/helpers.ts";

const FILES = [
  { name: "IMG_20240101_100000.jpg", size: 120_000, ageDays: 400 },
  { name: "IMG_20240202_110000.jpg", size: 95_000, ageDays: 300 },
  { name: "IMG_20240303_120000.heic", size: 210_000, ageDays: 200 },
  { name: "VID_20240404_130000.mp4", size: 900_000, ageDays: 100 },
];

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "photorelay-usb-"));
  const phoneDir = path.join(base, "phone");
  const pcDir = path.join(base, "pc");
  makeLibrary(phoneDir, FILES);
  const source = new FolderSource(phoneDir, "Test Phone");
  return { base, phoneDir, pcDir, source };
}

function storedFiles(pcDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".photorelay") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  if (fs.existsSync(pcDir)) walk(pcDir);
  return out;
}

test("usb: full sync lands byte-identical in the library layout", async () => {
  const { phoneDir, pcDir, source } = setup();
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  const [device] = await source.listDevices();
  const res = await engine.sync(device);

  assert.equal(res.stored, 4);
  assert.equal(res.skipped, 0);

  const stored = storedFiles(pcDir);
  assert.equal(stored.length, 4);
  for (const p of stored) {
    // Layout: <pcDir>/Test Phone/<yyyy>/<yyyy-MM>/<name>
    const rel = path.relative(pcDir, p).split(path.sep);
    assert.equal(rel[0], "Test Phone");
    assert.match(rel[1], /^\d{4}$/);
    assert.match(rel[2], /^\d{4}-\d{2}$/);
    assert.equal(sha256File(p), sha256File(path.join(phoneDir, "DCIM/Camera", rel[3])));
  }
  // No staging leftovers
  assert.deepEqual(fs.readdirSync(path.join(pcDir, ".photorelay", "incoming")), []);
  assert.equal(engine.libraryStats().stored, 4);
  engine.close();
});

test("usb: re-plugging copies nothing twice", async () => {
  const { pcDir, source } = setup();
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  const [device] = await source.listDevices();
  await engine.sync(device);
  const res2 = await engine.sync(device);
  assert.equal(res2.stored, 0);
  assert.equal(res2.skipped, 4);
  assert.equal(storedFiles(pcDir).length, 4);
  engine.close();
});

test("usb: mid-copy failure resumes — stored files kept, failed file re-copied", async () => {
  const { base, phoneDir, pcDir, source } = setup();
  // Add a big file whose copy stalls halfway on the first attempt.
  makeLibrary(phoneDir, [{ name: "VID_big.mp4", size: 2_000_000, ageDays: 0 }]);
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  const [device] = await source.listDevices();

  source.failCopyAfterBytes = 800_000; // stalls during VID_big.mp4
  await assert.rejects(engine.sync(device), CableRemovedError);
  const afterFirst = storedFiles(pcDir).length;
  assert.ok(afterFirst >= 3, `some files stored before the failure (got ${afterFirst})`);
  assert.deepEqual(fs.readdirSync(path.join(pcDir, ".photorelay", "incoming")), [], "no .part left");

  // Cable is back: resume completes; already-stored files are skipped.
  const res = await engine.sync(device);
  assert.equal(storedFiles(pcDir).length, 5);
  assert.ok(res.skipped >= afterFirst, "stored files were skipped, not re-copied");
  const big = storedFiles(pcDir).find((p) => p.endsWith("VID_big.mp4"))!;
  assert.equal(sha256File(big), sha256File(path.join(phoneDir, "DCIM/Camera", "VID_big.mp4")));
  engine.close();
  void base;
});

test("usb: cable out during enumeration raises CableRemovedError", async () => {
  const { pcDir, source } = setup();
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  const [device] = await source.listDevices();
  source.connected = false;
  await assert.rejects(engine.sync(device), CableRemovedError);
  engine.close();
});

test("usb: leftover .part files are removed at startup", async () => {
  const { pcDir, source } = setup();
  const incoming = path.join(pcDir, ".photorelay", "incoming");
  fs.mkdirSync(incoming, { recursive: true });
  fs.writeFileSync(path.join(incoming, "orphan.part"), Buffer.alloc(5000));
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  assert.deepEqual(fs.readdirSync(incoming), []);
  engine.close();
});

test("usb: non-media files are ignored", async () => {
  const { phoneDir, pcDir, source } = setup();
  fs.writeFileSync(path.join(phoneDir, "DCIM", "Camera", "notes.txt"), "not a photo");
  fs.writeFileSync(path.join(phoneDir, "DCIM", "Camera", "doc.pdf"), "nope");
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  const [device] = await source.listDevices();
  const res = await engine.sync(device);
  assert.equal(res.stored, 4);
  assert.equal(storedFiles(pcDir).length, 4);
  engine.close();
});
