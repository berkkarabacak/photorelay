// One-shot site screenshot: serves website/dist, captures the page, quits.
// Usage: node node_modules/electron/cli.js --no-sandbox scripts/shoot-site.mjs
import { app, BrowserWindow } from "electron";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "..", "website", "dist");
const OUT = path.resolve(HERE, "..", "site-shot.png");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end("nf");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

function die(msg, code) {
  console.error(msg);
  try { server.close(); } catch {}
  app.exit(code);
}

server.listen(0, () => {
  const port = server.address().port;
  app.whenReady().then(async () => {
    try {
      const win = new BrowserWindow({
        width: 1280,
        height: 1000,
        x: -3000,
        y: 0,
        webPreferences: { contextIsolation: true },
      });
      await win.loadURL(`http://127.0.0.1:${port}/`);
      await new Promise((r) => setTimeout(r, 1600));
      const height = await win.webContents.executeJavaScript(
        "Math.min(document.documentElement.scrollHeight, 8000)"
      );
      // Tall offscreen windows exceed the GPU surface — capture viewport slices.
      const slices = Math.ceil(height / 1000);
      for (let i = 0; i < slices; i++) {
        await win.webContents.executeJavaScript(`window.scrollTo(0, ${i * 1000})`);
        await new Promise((r) => setTimeout(r, 450));
        const img = await win.webContents.capturePage();
        const out = OUT.replace(".png", `-${i}.png`);
        fs.writeFileSync(out, img.toPNG());
        console.log("SHOT OK:", out);
      }
      console.log("page height:", height + "px,", slices, "slices");
      server.close();
      app.exit(0);
    } catch (err) {
      die("SHOT FAILED: " + (err && err.message ? err.message : String(err)), 2);
    }
  });
});
