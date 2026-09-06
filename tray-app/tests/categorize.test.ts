/**
 * Categorize tests — the two library promises:
 *  - screenshots never mix with camera photos (Screenshots/<yyyy-mm>/)
 *  - GPS photos land under Places/<City, CC>/<yyyy-mm>/ — fully offline
 *  - everything else keeps the plain date layout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { UsbTransferEngine } from "../src/main/usb/engine.js";
import { FolderSource } from "../src/main/usb/source.js";
import { isScreenshot, nearestPlace } from "../src/main/usb/categorize.js";
import { makeLibrary } from "../../relay/tests/helpers.ts";

test("isScreenshot: names and folders", () => {
  assert.ok(isScreenshot("Screenshot_2026-08-15-00-09-11.jpg", "Internal shared storage/Pictures/Screenshots/x"));
  assert.ok(isScreenshot("photo.jpg", "Internal shared storage/Pictures/Screenshots/photo.jpg"));
  assert.ok(!isScreenshot("IMG_20240101_100000.jpg", "Internal shared storage/DCIM/Camera/IMG_20240101_100000.jpg"));
});

test("nearestPlace: offline city lookup", () => {
  // Istanbul — Sultanahmet
  const place = nearestPlace(41.0082, 28.9784);
  assert.ok(place && /Istanbul, TR/.test(place), `got ${place}`);
  // Middle of the ocean → no place
  assert.equal(nearestPlace(0, -160), null);
});

function setup(files: { name: string; size: number; ageDays: number }[], subdir = "") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "photorelay-cat-"));
  const phoneDir = path.join(base, "phone");
  const pcDir = path.join(base, "pc");
  makeLibrary(subdir ? path.join(phoneDir, subdir) : phoneDir, files);
  const source = new FolderSource(phoneDir, "Test Phone");
  return { pcDir, source };
}

test("usb: screenshots are filed under Screenshots/, camera photos under dates", async () => {
  const { pcDir, source } = setup([
    { name: "Screenshot_2026-08-15-00-09-11-594_com.maps.jpg", size: 50_000, ageDays: 10 },
    { name: "IMG_20260101_100000.jpg", size: 60_000, ageDays: 10 },
  ]);
  const engine = new UsbTransferEngine({ libraryDir: pcDir, source });
  const [device] = await source.listDevices();
  const res = await engine.sync(device);
  assert.equal(res.stored, 2);
  engine.close();

  const shot = path.join(pcDir, "Test Phone", "Screenshots");
  assert.ok(fs.existsSync(shot), "Screenshots folder exists");
  const shotFile = fs.readdirSync(shot, { recursive: true }).map(String).find((f) => f.includes("Screenshot_"));
  assert.ok(shotFile, "screenshot stored under Screenshots/");

  // Camera photo must NOT be in Screenshots/
  const all = fs.readdirSync(path.join(pcDir, "Test Phone"), { recursive: true }).map(String);
  const cam = all.find((f) => f.includes("IMG_20260101"));
  assert.ok(cam && !cam.includes("Screenshots"), `camera photo at ${cam}`);
});

test("usb: engine honors an injected categorize (GPS routing seam)", async () => {
  const { pcDir, source } = setup([{ name: "IMG_gps.jpg", size: 10_000, ageDays: 5 }]);
  const engine = new UsbTransferEngine({
    libraryDir: pcDir,
    source,
    categorize: async (i) => path.join("Places", "Istanbul, TR", "2026-09"),
  });
  const [device] = await source.listDevices();
  await engine.sync(device);
  engine.close();
  assert.ok(fs.existsSync(path.join(pcDir, "Test Phone", "Places", "Istanbul, TR", "2026-09", "IMG_gps.jpg")));
});
