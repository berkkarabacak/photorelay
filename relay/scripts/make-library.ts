/**
 * Synthetic phone-library generator for demos and manual testing.
 *
 *   npm run mklibrary -- --out demo/phone --count 500 --videos 25
 *
 * Files are random bytes with realistic names/sizes — the protocol only
 * cares about bytes, sizes, and mtimes.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    count: { type: "string", default: "300" },
    videos: { type: "string", default: "12" },
    "max-mb": { type: "string", default: "6" },
    "video-max-mb": { type: "string", default: "60" },
  },
});

if (!values.out) {
  console.error("Usage: npm run mklibrary -- --out <dir> [--count 300] [--videos 12]");
  process.exit(1);
}

const out = path.resolve(values.out);
const count = Number(values.count);
const videos = Number(values.videos);
const maxPhoto = Number(values["max-mb"]) * 1024 * 1024;
const maxVideo = Number(values["video-max-mb"]) * 1024 * 1024;

const dirs = ["DCIM/Camera", "DCIM/Camera", "Pictures/Screenshots", "Movies"];
let rndState = 0x5eed;
const rnd = () => {
  // deterministic PRNG so demo libraries are reproducible
  rndState = (rndState * 1103515245 + 12345) & 0x7fffffff;
  return rndState / 0x7fffffff;
};
const pad = (n: number) => String(n).padStart(2, "0");

let made = 0;
for (let i = 0; i < count; i++) {
  const isVideo = i >= count - videos;
  const y = 2024 + Math.floor(rnd() * 3);
  const mo = pad(1 + Math.floor(rnd() * 12));
  const d = pad(1 + Math.floor(rnd() * 28));
  const stamp = `${y}${mo}${d}_${pad(Math.floor(rnd() * 24))}${pad(Math.floor(rnd() * 60))}${pad(Math.floor(rnd() * 60))}`;
  const name = isVideo ? `VID_${stamp}.mp4` : `IMG_${stamp}.jpg`;
  const size = isVideo
    ? Math.floor(10 * 1024 * 1024 + rnd() * maxVideo)
    : Math.floor(1.5 * 1024 * 1024 + rnd() * maxPhoto);
  const dir = path.join(out, dirs[Math.floor(rnd() * dirs.length)]);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, randomBytes(size));
  const t = new Date(`${y}-${mo}-${d}T12:00:00Z`);
  fs.utimesSync(filePath, t, t);
  made++;
}
console.log(`Created ${made} synthetic media files under ${out}`);
