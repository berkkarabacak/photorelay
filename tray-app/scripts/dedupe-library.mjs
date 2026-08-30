// Dedupe the library: each photo may exist as "name.jpg" (from the repair
// pass) and "name (2).jpg" (from the re-copy). Keep one, delete the rest,
// repoint the journal, and normalize fingerprints to name:size.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const LIB = process.env.USERPROFILE + "\\Pictures\\PhotoRelay";
const db = new DatabaseSync(path.join(LIB, ".photorelay", "usb-journal.db"));
const rows = db.prepare("SELECT file_key, name, size, fingerprint, stored_as FROM usb_files WHERE status='stored'").all();

const base = (n) => n.replace(/ \(\d+\)(\.[^.]+)$/, "$1");
let deleted = 0, repointed = 0, fpFixed = 0, missing = 0;
for (const r of rows) {
  const dir = path.dirname(path.join(LIB, r.stored_as));
  if (!fs.existsSync(dir)) { missing++; continue; }
  const cands = fs.readdirSync(dir).filter((f) => base(f) === base(r.name) && fs.statSync(path.join(dir, f)).size === r.size);
  if (!cands.length) { missing++; continue; }
  cands.sort((a, b) => (a === base(a) ? 0 : 1) - (b === base(b) ? 0 : 1)); // unsuffixed first
  const keep = cands[0];
  for (const extra of cands.slice(1)) { fs.rmSync(path.join(dir, extra)); deleted++; }
  const newStoredAs = path.relative(LIB, path.join(dir, keep)).split(path.sep).join("/");
  if (newStoredAs !== r.stored_as) {
    db.prepare("UPDATE usb_files SET stored_as=? WHERE file_key=?").run(newStoredAs, r.file_key);
    repointed++;
  }
  const newFp = r.fingerprint.split(":").slice(0, 2).join(":");
  if (newFp !== r.fingerprint) {
    db.prepare("UPDATE usb_files SET fingerprint=? WHERE file_key=?").run(newFp, r.file_key);
    fpFixed++;
  }
}
db.close();
let n = 0, b = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; b += fs.statSync(p).size; } } };
walk(path.join(LIB, "Redmi K60 Ultra"));
console.log({ deleted, repointed, fpFixed, missing });
console.log("on disk now:", n, "files,", (b / 1048576).toFixed(1), "MB");
