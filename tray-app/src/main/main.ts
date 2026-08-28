/**
 * PhotoRelay tray app — Electron main process.
 *
 * This file is deliberately thin: all logic lives in the pure-Node TrayHost
 * (src/main/host.ts), which wraps the proven relay/ receiver. Electron only
 * provides the window, the tray icon, and IPC plumbing.
 *
 * UX contract (docs/ux-design.md §0): one screen, one job, giant text.
 */
import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { TrayHost, type TrayState } from "./host.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SMOKE = process.argv.includes("--smoke");
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

const libraryDir =
  process.env.PHOTORELAY_LIBRARY ?? path.join(os.homedir(), "Pictures", "PhotoRelay");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let host: TrayHost | null = null;

function asset(name: string) {
  // dist/main/main.js → tray-app/assets/<name>
  return path.join(__dirname, "..", "..", "assets", name);
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 920,
    height: 760,
    minWidth: 640,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: "#09090b",
    title: "PhotoRelay",
    icon: nativeImage.createFromPath(asset("icon-256.png")),
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_URL) {
    await win.loadURL(DEV_URL);
  } else {
    await win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // Closing the window keeps PhotoRelay alive in the tray — transfers
  // continue in the background.
  win.on("close", (e) => {
    if (!SMOKE && !quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
}

let quitting = false;

function createTray(): void {
  const icon = nativeImage.createFromPath(asset("tray-icon.png"));
  tray = new Tray(icon);
  tray.setToolTip("PhotoRelay — your photos back up by themselves");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open PhotoRelay", click: () => (win?.isVisible() ? win.focus() : win?.show()) },
      { type: "separator" },
      {
        label: "Quit PhotoRelay",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => (win?.isVisible() ? win.focus() : win?.show()));
}

function forward(state: TrayState): void {
  win?.webContents.send("state", state);
  tray?.setToolTip(`PhotoRelay — ${state.headline}`);
}

app.whenReady().then(async () => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  host = new TrayHost({ libraryDir });
  await host.start();

  await createWindow();
  createTray();

  ipcMain.handle("get-state", () => host?.current);
  host.subscribe(forward);

  app.on("second-instance", () => (win?.isVisible() ? win.focus() : win?.show()));

  if (SMOKE && win) {
    // Headless-ish verification: render, capture, report, quit.
    await new Promise((r) => setTimeout(r, 1800));
    const image = await win.webContents.capturePage();
    const out = path.resolve("smoke.png");
    fs.writeFileSync(out, image.toPNG());
    console.log("SMOKE OK — screenshot:", out);
    console.log("SMOKE STATE:", JSON.stringify(host.current.phase), "|", host.current.headline);
    console.log("SMOKE QR:", host.current.pairUri ? "pair URI present" : "no pair URI");
    quitting = true;
    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;
  void host?.stop();
});
