/**
 * Path safety for the receiver (security-model.md §2: "final paths are
 * receiver-computed, sender paths are advisory metadata only").
 *
 * sanitizeRelPath strips anything hostile and returns a safe relative
 * display path; final library paths are always computed by the store.
 */
import path from "node:path";

// Illegal in Windows filenames: < > : " \ | ? * and control chars 0x00-0x1F.
// Spaces and hyphens are legal on NTFS and must be preserved.
const ILLEGAL = /[<>:"\\|?*\x00-\x1f]/g;

/** Sanitize a sender-supplied relative path. Throws on traversal. */
export function sanitizeRelPath(relPath: string): string {
  // Normalize separators, drop drive letters and absolute markers.
  let p = relPath.replace(/\\/g, "/");
  p = p.replace(/^[a-zA-Z]:\//, "");
  p = p.replace(/^\/+/, "");

  const parts = p.split("/").filter((seg) => seg.length > 0 && seg !== ".");
  if (parts.some((seg) => seg === "..")) {
    throw new Error("PROTOCOL_VIOLATION: path traversal in rel_path");
  }
  const clean = parts.map((seg) => seg.replace(ILLEGAL, "_").slice(0, 120));
  return clean.join("/");
}

/** yyyy/yyyy-MM grouping used by the media store. */
export function storeSubdirs(mtimeSec: number): string {
  const d = new Date(mtimeSec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}/${y}-${m}`;
}

/** Ensure a filename is unique inside a directory: name (2).ext, name (3).ext, … */
export function uniqueName(existing: (candidate: string) => boolean, fileName: string): string {
  if (!existing(fileName)) return fileName;
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!existing(candidate)) return candidate;
  }
}
