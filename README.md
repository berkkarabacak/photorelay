# PhotoRelay

**Reliable photo & video transfer from phone to PC.**

> Transfers can fail. PhotoRelay makes failure irrelevant.

Transferring thousands of photos and videos from a phone to a Windows PC is
surprisingly unreliable: MTP connections drop, Windows Explorer freezes,
transfers stall at 70%, and nobody can tell you which files actually made it.
PhotoRelay is designed from the ground up as a **fault-tolerant
synchronization protocol**, not a prettier file copy. If the phone
disconnects, Wi-Fi disappears, the app crashes, or the PC restarts, you
reconnect and continue exactly where you left off.

## Repository contents

| Path | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Overall product architecture — components, modules, technology choices |
| [`docs/transfer-protocol.md`](docs/transfer-protocol.md) | **RelaySync/1** — the fault-tolerant transfer protocol specification |
| [`docs/data-model.md`](docs/data-model.md) | Data model: entities, SQLite schemas, wire formats |
| [`docs/security-model.md`](docs/security-model.md) | Pairing, encryption, threat model, key storage |
| [`docs/ux-design.md`](docs/ux-design.md) | UX principles, flows, and copy deck |
| [`website/`](website/) | Product website + interactive transfer-protocol demo (React + TypeScript + Vite + Tailwind) |

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
- [ ] Windows receiver app
- [ ] Android app
- [ ] iOS app

## Developing the website

```bash
cd website
npm install
npm run dev      # dev server
npm run build    # production build → dist/
```

## License

MIT — see [LICENSE](LICENSE).
