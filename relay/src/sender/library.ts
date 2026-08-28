/**
 * Sender-side library scanner — the CLI stand-in for MediaStore (Android)
 * and PhotoKit (iOS) enumeration (architecture.md §4).
 *
 * The reference sender scans a directory tree and produces manifest items.
 * File ids use the spec fallback form (transfer-protocol.md §5.1):
 *   "h:" + SHA-256(first 1 MiB ‖ size ‖ name)[:16]
 * because a directory has no stable platform asset id.
 */
import fs from "node:fs";
import path from "node:path";
import { deriveFileId, fingerprint } from "../protocol/hash.js";
import type { ManifestItem } from "../protocol/messages.js";

const PHOTO_EXT = new Set([".jpg", ".jpeg", ".heic", ".png", ".webp", ".gif", ".dng", ".raw"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"]);

export function mediaKind(fileName: string): "photo" | "video" | null {
  const ext = path.extname(fileName).toLowerCase();
  if (PHOTO_EXT.has(ext)) return "photo";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

function firstBytes(filePath: string, n: number): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(Math.min(n, fs.fstatSync(fd).size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/** Recursively scan a directory into manifest items, newest first. */
export function scanLibrary(rootDir: string): ManifestItem[] {
  const root = path.resolve(rootDir);
  const items: ManifestItem[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".photorelay") continue; // never scan receiver internals
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const media = mediaKind(entry.name);
      if (!media) continue;

      const st = fs.statSync(full);
      const first = firstBytes(full, 1024 * 1024);
      const mtime = Math.floor(st.mtimeMs / 1000);
      const rel = path.relative(root, full).split(path.sep).join("/");
      items.push({
        file_id: deriveFileId({ name: entry.name, size: st.size, firstMiB: first }),
        rel_path: rel,
        name: entry.name,
        size: st.size,
        mtime,
        media,
        fingerprint: fingerprint({ size: st.size, mtime, firstMiB: first }),
        hash_sha256: null, // computed lazily — Level 3 is on-demand
      });
    }
  };
  walk(root);
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}
