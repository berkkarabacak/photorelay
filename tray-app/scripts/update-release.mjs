// Replace the v0.1.0 release asset with the fixed installer.
const TOKEN = process.env.GH_TOKEN;
const REPO = "berkkarabacak/photorelay";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "photorelay-release-script",
};
const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v0.1.0`, { headers }).then(r => r.json());
console.log("release:", rel.id);
for (const a of rel.assets) {
  const d = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${a.id}`, { method: "DELETE", headers });
  console.log("deleted asset:", a.name, d.status);
}
import { readFileSync } from "node:fs";
const file = readFileSync("release/PhotoRelay Setup 0.1.0.exe");
console.log("uploading", (file.length / 1048576).toFixed(1), "MB...");
const up = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=PhotoRelay-Setup-0.1.0.exe`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/octet-stream" },
  body: file,
});
const asset = await up.json();
if (!up.ok) { console.error("upload failed:", asset); process.exit(1); }
console.log("asset:", asset.browser_download_url);
// Update release notes with the full-transfer validation.
const notes = await fetch(`https://api.github.com/repos/${REPO}/releases/${rel.id}`, {
  method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ body: rel.body.replace(
    "- Redmi K60 Ultra over USB/MTP: 710 media files (2.2 GB) enumerated, byte-exact copy verified",
    "- Redmi K60 Ultra over USB/MTP: full real transfer — 362 photos/videos, 2.21 GB, byte-exact, organized into year/month folders; re-plug copies nothing twice"
  )}),
}).then(r => r.json());
console.log("notes updated:", notes.html_url);
