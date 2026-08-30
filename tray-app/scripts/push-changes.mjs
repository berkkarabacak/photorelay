// Push selected changed files to main via GitHub API (incremental tree).
const TOKEN = process.env.GH_TOKEN;
const REPO = "berkkarabacak/photorelay";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "photorelay-push",
  "Content-Type": "application/json",
};
const api = async (path, opts = {}) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers, ...opts });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};

import { readFileSync } from "node:fs";
const FILES = [
  "tray-app/src/main/usb/wpd.ts",
  "tray-app/package.json",
  "tray-app/package-lock.json",
  "tray-app/scripts/check-phone.mjs",
  "tray-app/scripts/diag-shell.mjs",
  "tray-app/scripts/hw-test.mts",
  "tray-app/scripts/make-release.mjs",
  "tray-app/scripts/push-changes.mjs",
];

const head = await api("/git/ref/heads/main");
const commit = await api(`/git/commits/${head.object.sha}`);
console.log("base tree:", commit.tree.sha.slice(0, 8));

const tree = [];
for (const f of FILES) {
  const content = readFileSync(f.slice("tray-app/".length), "utf8");
  const blob = await api("/git/blobs", { method: "POST", body: JSON.stringify({ content: Buffer.from(content).toString("base64"), encoding: "base64" }) });
  tree.push({ path: f, mode: "100644", type: "blob", sha: blob.sha });
  console.log("blob:", f);
}
const newTree = await api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
const newCommit = await api("/git/commits", { method: "POST", body: JSON.stringify({
  message: "tray-app: real-hardware WPD fixes + one-click installer config\n\n- Resolve PowerShell via SystemRoot (tray/installer contexts lack PATH)\n- Fix device filter: portable devices have shell paths, not filesystem roots\n- Fix JS template-literal backslash mangling in the drive filter\n- Enumerate only DCIM/Pictures/Movies at storage root (16s vs timeout)\n- Skip hidden cache folders (.thumbnails)\n- electron-builder NSIS one-click config; validated on Redmi K60 Ultra\n  (710 media files, 2.2 GB, byte-exact copy verified)",
  tree: newTree.sha, parents: [head.object.sha],
})});
await api("/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
console.log("pushed:", newCommit.sha);
