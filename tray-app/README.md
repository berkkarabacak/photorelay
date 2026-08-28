# tray-app/ — PhotoRelay for Windows

The app your family actually sees. **No phone app — she just plugs in the
USB charging cable.** Electron shell around a fault-tolerant USB pull
engine (plus the proven `relay/` protocol core). Zero command line, giant
text, one job per screen (docs/ux-design.md §0).

## What you see

| Screen | When | What it says |
| --- | --- | --- |
| **Plug** | App open, no phone | "Plug the phone into this computer with its USB cable" (+ the one-time Allow/Trust hint) |
| **Transferring** | Copying | Giant progress bar, "N of M photos". Closing the window keeps it working in the tray. |
| **Waiting** | Cable bumped | "The cable came loose — plug it back in. It will continue by itself." |
| **Done** | Verified | "All done! N photos and videos are safe on this computer. You can unplug the cable now." |

## How it works

```
Phone --USB/MTP--> UsbSource (wpd.ts, Shell32/PowerShell bridge)
                        |
              UsbTransferEngine (engine.ts)
              enumerate → skip stored → stage .part → verify → journal → atomic rename
                        |
              <Library>/<Phone>/<yyyy>/<yyyy-MM>/IMG_….jpg
```

- **Resumable unit = one file** (MTP has no reliable random access; photos
  are small, so per-file resume is the right granularity).
- Interruption is normal: cable pulls, app closes, PC restarts — the
  journal (`usb-journal.db`, SQLite WAL) knows exactly what's done.
- Duplicates and already-backed-up files are skipped by fingerprint.
- `WpdSource` is a deliberately thin hardware bridge (needs a physical
  phone to exercise); every engine guarantee is CI-tested against
  `FolderSource`, a directory-backed fake phone.

## Run it (dev machine)

```bash
npm install
npm run build
npm start          # or: npm run smoke  (renders, screenshots, quits)
```

Photos land in `Pictures\PhotoRelay` by default (`PHOTORELAY_LIBRARY` to
override). To try it without a phone, point a FolderSource at any folder of
images (see `tests/` for the pattern).

## Tests

```bash
npm test   # 10 tests: engine (sync/dedup/resume/cleanup) + host USB journey
```

The Wi-Fi/QR path (`relay/` receiver + `--pair-uri` sender) remains in the
codebase for optional future companion apps, but the tray UI is cable-only.

