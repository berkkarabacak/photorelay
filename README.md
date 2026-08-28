# PhotoRelay

**Reliable photo & video backup from phone to PC — just plug in the cable. No phone app. Free, forever.**

> Transfers can fail. PhotoRelay makes failure irrelevant.

Built for non-technical users (and the family members who help them):
plug the phone into the PC with its own charging cable and PhotoRelay does
everything — finds the photos, copies them, checks them, and if the cable is
bumped halfway through 3,000 photos, it simply continues where it stopped.
Nothing to learn, nothing to tap, no duplicates, no cloud.

The same fault-tolerant engine also powers an optional Wi-Fi mode
(RelaySync/1) for future companion apps — but a cable and this Windows app
are all anyone needs.

## Repository contents

| Path | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Overall product architecture — components, modules, technology choices |
| [`docs/transfer-protocol.md`](docs/transfer-protocol.md) | **RelaySync/1** — the fault-tolerant transfer protocol specification |
| [`docs/data-model.md`](docs/data-model.md) | Data model: entities, SQLite schemas, wire formats |
| [`docs/security-model.md`](docs/security-model.md) | Pairing, encryption, threat model, key storage |
| [`docs/ux-design.md`](docs/ux-design.md) | UX principles, flows, and copy deck |
| [`website/`](website/) | Product website + interactive transfer-protocol demo (React + TypeScript + Vite + Tailwind) |
| [`relay/`](relay/) | **RelaySync/1 reference implementation** — receiver (journal + transfer engine + verifier), CLI sender, golden test vectors, 24 tests |
| [`tray-app/`](tray-app/) | **Windows tray app** — Electron + the relay engine; big QR pairing screen, zero-tap background transfers, elderly-first UI |

## Core design principles

1. **Failure is a normal state, not an error.** Interruption is a first-class
   state in the protocol state machine, with its own UI language.
2. **Resume everything.** Every chunk is journaled. A transfer can be
   interrupted at any point — including mid-file — and resumed after any
   crash, disconnect, or reboot.
3. **Verify everything.** Files are verified with size/timestamp metadata,
   per-chunk checksums during transfer, and optional full-file SHA-256.
   A partially transferred file can never be mistaken for a complete one.
4. **Never duplicate.** Content-aware incremental sync detects
   already-transferred files, so restarting a backup is always safe.
5. **No MTP.** Wireless transfer over the local network (TLS over TCP),
   paired via QR code. No drivers, no Explorer, no DCIM spelunking.

## Status

- [x] Product architecture
- [x] RelaySync/1 transfer protocol specification
- [x] Data model & security model
- [x] UX design
- [x] Product website + interactive protocol demo
- [x] RelaySync/1 reference implementation (receiver + CLI sender + golden vectors, [`relay/`](relay/))
- [x] Windows tray app ([`tray-app/`](tray-app/)) — **USB plug-and-play: no phone app needed**, fault-tolerant pull engine, elderly-first UI
- [ ] Real-phone USB validation + one-click installer packaging
- [ ] Optional companion apps (Wi-Fi auto-backup) — not required for the core product

## Developing the website

```bash
cd website
npm install
npm run dev      # dev server
npm run build    # production build → dist/
```

## License

MIT — see [LICENSE](LICENSE).
