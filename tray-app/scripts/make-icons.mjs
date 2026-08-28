// Generate the PhotoRelay tray/window icons as PNGs (no native deps).
// Emerald rounded square + dark up-arrow, matching the website favicon.
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function makeIcon(size) {
  const data = Buffer.alloc(size * size * 4);
  const m = size * 0.03;
  const r = size * 0.22;
  const arrowW = size * 0.05; // half-width
  const cx = size / 2;
  const top = size * 0.26;
  const bot = size * 0.74;
  const wingY = size * 0.5;
  const wingX = size * 0.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect test
      const inX = x >= m && x <= size - m;
      const inY = y >= m && y <= size - m;
      let inside = inX && inY;
      if (inside) {
        const cxs = x < m + r ? m + r : x > size - m - r ? size - m - r : x;
        const cys = y < m + r ? m + r : y > size - m - r ? size - m - r : y;
        inside = Math.hypot(x - cxs, y - cys) <= r;
      }
      if (!inside) continue; // transparent
      // arrow test
      const onShaft = distToSeg(x, y, cx, top, cx, bot) <= arrowW;
      const onLeftWing = distToSeg(x, y, cx, top, cx - wingX, wingY) <= arrowW;
      const onRightWing = distToSeg(x, y, cx, top, cx + wingX, wingY) <= arrowW;
      const arrow = onShaft || onLeftWing || onRightWing;
      const [rr, gg, bb] = arrow ? [5, 46, 34] : [52, 211, 153];
      data[i] = rr;
      data[i + 1] = gg;
      data[i + 2] = bb;
      data[i + 3] = 255;
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    data.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.resolve("assets");
fs.mkdirSync(outDir, { recursive: true });
for (const [size, name] of [
  [256, "icon-256.png"],
  [32, "tray-icon.png"],
]) {
  fs.writeFileSync(path.join(outDir, name), makeIcon(size));
  console.log("wrote assets/" + name);
}
