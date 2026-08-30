// One-off repair: the first real transfer got mtime=1899 from MTP.
// Re-derive dates from filenames (IMG_20240815_..., Screenshot_2026-08-15-...,
// mmexport<epoch-ms>) and move files into the proper yyyy/yyyy-MM layout.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const LIB = process.env.USERPROFILE + "\\Pictures\\PhotoRelay";
const db = new DatabaseSync(path.join(LIB, ".photorelay", "usb-journal.db"));

function dateFromName(name) {
  let m = name.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = name.match(/(20\d{2})(\d{2})(\d{2})/);
  if (m && +m[2] <= 12 && +m[3] <= 31) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = name.match(/mmexport(\d{13})/);
  if (m) return new Date(+m[1]);
  return null;
}

const rows = db.prepare("SELECT file_key, name, stored_as FROM usb_files WHERE status='stored'").all();
let moved = 0, kept = 0, missing = 0;
for (const r of rows) {
  const d = dateFromName(r.name);
  if (!d) { kept++; continue; }
  const yyyy = String(d.getFullYear());
  const ym = `${yyyy}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(LIB, "Redmi K60 Ultra", yyyy, ym);
  const src = path.join(LIB, r.stored_as);
  if (!fs.existsSync(src)) { missing++; continue; }
  fs.mkdirSync(dir, { recursive: true });
  let target = path.join(dir, r.name);
  let i = 1;
  while (fs.existsSync(target)) target = path.join(dir, r.name.replace(/(\.[^.]+)$/, ` (${i++})$1`));
  fs.renameSync(src, target);
  fs.utimesSync(target, d, d);
  const storedAs = path.relative(LIB, target).split(path.sep).join("/");
  db.prepare("UPDATE usb_files SET stored_as=? WHERE file_key=?").run(storedAs, r.file_key);
  moved++;
}
db.close();
// Clean now-empty 1899 tree.
const old = path.join(LIB, "Redmi K60 Ultra", "1899");
if (fs.existsSync(old)) fs.rmSync(old, { recursive: true, force: true });
console.log(`moved=${moved} undated(kept in place)=${kept} missing=${missing}`);
console.log("folders now:", fs.readdirSync(path.join(LIB, "Redmi K60 Ultra")));
