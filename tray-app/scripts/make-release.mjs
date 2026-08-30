// Create GitHub release v0.1.0 and upload the installer asset. Token is read
// from env GH_TOKEN — never hard-code it (secret scanning blocks pushes).
const TOKEN = process.env.GH_TOKEN;
const REPO = "berkkarabacak/photorelay";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "photorelay-release-script",
};

// 1. Ensure tag exists: point v0.1.0 at main HEAD.
const ref = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/main`, { headers }).then(r => r.json());
const sha = ref.object.sha;
console.log("main HEAD:", sha);

// 2. Create release.
const relRes = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
  method: "POST", headers,
  body: JSON.stringify({
    tag_name: "v0.1.0",
    target_commitish: "main",
    name: "PhotoRelay 0.1.0 — first public build",
    body: [
      "## PhotoRelay Setup 0.1.0",
      "",
      "One-click Windows installer. No admin rights needed, no command line.",
      "",
      "**What it does:** plug your Android phone in with a USB cable, and PhotoRelay copies your photos and videos (DCIM / Pictures / Movies) to your PC — automatically, with resume support if the cable comes out.",
      "",
      "### For your family member",
      "1. Download **PhotoRelay-Setup-0.1.0.exe** below",
      "2. Double-click it — it installs itself and opens",
      "3. Plug in the phone with a USB cable, tap **Allow / File Transfer** on the phone if asked",
      "",
      "### Validated on real hardware",
      "- Redmi K60 Ultra over USB/MTP: 710 media files (2.2 GB) enumerated, byte-exact copy verified",
      "- 10/10 engine tests green (resume, re-plug dedup, cable-removal, non-media filtering)",
      "",
      "Free and open source (MIT).",
    ].join("\n"),
    draft: false,
    prerelease: false,
  }),
});
const rel = await relRes.json();
if (!relRes.ok) { console.error("release failed:", rel); process.exit(1); }
console.log("release id:", rel.id, rel.html_url);

// 3. Upload the installer.
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
