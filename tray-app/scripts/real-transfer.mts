import { WpdSource } from "../src/main/usb/wpd.js";
import { UsbTransferEngine } from "../src/main/usb/engine.js";

const LIBRARY = process.argv[2] ?? `${process.env.USERPROFILE}\\Pictures\\PhotoRelay`;
const src = new WpdSource();
const devices = await src.listDevices();
const dev = devices.find(d => /redmi|xiaomi|\bmi\b/i.test(d.name)) ?? devices[0];
if (!dev) { console.log("NO DEVICE"); process.exit(1); }
console.log(`Device: ${dev.name}  ->  Library: ${LIBRARY}`);

let lastLog = 0;
const engine = new UsbTransferEngine({
  libraryDir: LIBRARY,
  source: src,
  onProgress(p) {
    const now = Date.now();
    if (now - lastLog > 2000 || p.done === p.total) {
      lastLog = now;
      console.log(`[${p.done}/${p.total}] ${(p.bytesDone/1048576).toFixed(0)}/${(p.bytesTotal/1048576).toFixed(0)} MB ${p.currentFile ?? ""}`);
    }
  },
});
try {
  const res = await engine.sync(dev);
  const stats = engine.libraryStats();
  console.log(`DONE stored=${res.stored} skipped=${res.skipped} | library total: ${stats.stored} files, ${(stats.bytes/1048576).toFixed(1)} MB`);
} finally {
  engine.close();
}
