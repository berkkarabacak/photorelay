/**
 * USB media sources — where photos come from when there is no phone app.
 *
 * The engine only knows this interface; two implementations exist:
 *  - WpdSource: real phones via Windows Portable Devices (Shell32 bridge)
 *  - FolderSource: a plain directory — used by the test suite and as a
 *    built-in demo mode ("try it with a folder of photos first").
 *
 * Design note (architecture.md): MTP enumeration and reads are the flaky
 * part of phone→PC transfers. All fault-tolerance lives in the engine; a
 * source may fail or vanish at any point and the engine recovers.
 */

export interface UsbDevice {
  id: string;
  name: string; // e.g. "Pixel 8" / "Apple iPhone"
}

export interface UsbFile {
  /** Stable within one enumeration: relative path under the device */
  relPath: string; // e.g. "Internal shared storage/DCIM/Camera/IMG_0001.jpg"
  name: string;
  size: number;
  mtime: number; // unix seconds
}

export interface UsbSource {
  /** Currently connected portable devices. Empty array when none. */
  listDevices(): Promise<UsbDevice[]>;
  /** Enumerate photo/video files on a device (DCIM + Pictures + Movies). */
  listFiles(deviceId: string): Promise<UsbFile[]>;
  /**
   * Copy one file from the device to a local staging path.
   * Must reject/throw if the device disappears mid-copy.
   */
  copyTo(deviceId: string, file: UsbFile, destPath: string): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* FolderSource — directory-backed fake device                         */
/* ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";
import { mediaKind } from "../../../../relay/src/sender/library.js";

/**
 * Treats a directory tree as a plugged-in phone. Set `connected = false` to
 * simulate the cable being pulled; copyTo() then fails exactly like an MTP
 * read would.
 */
export class FolderSource implements UsbSource {
  connected = true;
  /** Test hook: fail mid-copy after this many bytes (0 = off). */
  failCopyAfterBytes = 0;

  constructor(
    private readonly dir: string,
    private readonly deviceName = "Demo Phone"
  ) {}

  async listDevices(): Promise<UsbDevice[]> {
    if (!this.connected || !fs.existsSync(this.dir)) return [];
    return [{ id: "folder:" + path.resolve(this.dir), name: this.deviceName }];
  }

  async listFiles(deviceId: string): Promise<UsbFile[]> {
    this.assertConnected();
    const root = path.resolve(this.dir);
    const out: UsbFile[] = [];
    const walk = (dir: string) => {
      this.assertConnected();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (e.isFile() && mediaKind(e.name)) {
          const st = fs.statSync(full);
          out.push({
            relPath: path.relative(root, full).split(path.sep).join("/"),
            name: e.name,
            size: st.size,
            mtime: Math.floor(st.mtimeMs / 1000),
          });
        }
      }
    };
    walk(root);
    return out;
  }

  async copyTo(_deviceId: string, file: UsbFile, destPath: string): Promise<void> {
    this.assertConnected();
    const src = path.join(this.dir, file.relPath);
    const data = fs.readFileSync(src);
    if (this.failCopyAfterBytes > 0 && data.length > this.failCopyAfterBytes) {
      // Simulate an MTP stall mid-file: write a truncated copy, then fail.
      fs.writeFileSync(destPath, data.subarray(0, this.failCopyAfterBytes));
      this.failCopyAfterBytes = 0;
      throw new Error("USB read stalled (simulated)");
    }
    fs.writeFileSync(destPath, data);
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error("device disconnected");
  }
}
