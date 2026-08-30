import { WpdSource } from "../src/main/usb/wpd.js";

const src = new WpdSource();
console.log("Listing devices...");
const devices = await src.listDevices();
console.log("Devices:", devices);
if (!devices.length) { console.log("NO DEVICE"); process.exit(1); }

const dev = devices.find(d => /redmi|mi |xiaomi/i.test(d.name)) ?? devices[0];
console.log(`Enumerating files on "${dev.name}" (this walks the whole phone, may take a while)...`);
const t0 = Date.now();
const files = await src.listFiles(dev.id);
console.log(`Found ${files.length} media files in DCIM/Pictures/Movies in ${((Date.now()-t0)/1000).toFixed(1)}s`);
const byKind = {};
for (const f of files) { const ext = f.name.split(".").pop().toLowerCase(); byKind[ext] = (byKind[ext]||0)+1; }
console.log("By extension:", byKind);
const totalMB = files.reduce((a,f)=>a+f.size,0)/1048576;
console.log("Total size:", totalMB.toFixed(1), "MB");

// Copy ONE small file to validate copyTo end-to-end.
if (files.length) {
  const small = files.reduce((a,b)=> (a.size < b.size ? a : b));
  const dest = process.argv[2] ?? `${process.env.TEMP}\\photorelay-hw-test\\${small.name}`;
  const { mkdirSync, statSync } = await import("node:fs");
  mkdirSync(dest.replace(/[/\\][^/\\]*$/, ""), { recursive: true });
  console.log(`Copying smallest file: ${small.relPath} (${small.size} bytes) -> ${dest}`);
  const t1 = Date.now();
  await src.copyTo(dev.id, small, dest);
  const got = statSync(dest).size;
  console.log(`Copied in ${((Date.now()-t1)/1000).toFixed(1)}s, size on disk: ${got} (expected ${small.size}) ${got === small.size ? "MATCH ✓" : "MISMATCH ✗"}`);
}
