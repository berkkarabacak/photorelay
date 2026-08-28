# relay/ — RelaySync/1 reference implementation

The proving ground for the protocol: a Windows receiver (journal + transfer
engine + verifier), a reference CLI sender, and golden test vectors. This is
the code the Android, iOS, and production Windows apps will be validated
against.

> Transfers can fail. This implementation makes failure irrelevant — and
> proves it with tests that kill connections mid-chunk and restart the
> receiver mid-transfer.

## What it implements (per `docs/transfer-protocol.md`)

- **Framing** — length-prefixed frames; CBOR control messages; binary
  zero-copy `CHUNK_DATA` frames (`src/protocol/frames.ts`)
- **Session lifecycle** — `HELLO → MANIFEST → PLAN → chunks → FILE_DONE →
  FILE_VERIFIED`, with `INTERRUPTED` as a first-class state
- **Chunk maps & resume** — 256 KiB chunks journaled in SQLite before every
  ACK; resume replays the journal and sends only missing chunks
- **Verification** — Level-1 fingerprint, Level-2 per-chunk xxHash64 inline,
  Level-3 full-file SHA-256 at finalize; quarantine on failure
- **Incremental sync & dedup** — `SKIP` for already-stored and duplicate
  files; re-running a finished backup sends zero chunks
- **Security** — TLS 1.3 only, mutual certificates, TOFU fingerprint
  pinning, path-traversal sanitization, fail-closed errors
- **Recovery** — normative backoff ladder; `RESUME_REQ` replays the receiver
  plan without re-sending the manifest

## Requirements

- Node.js ≥ 22.5 (uses the built-in `node:sqlite` journal — no native
  modules, no database server)

## Quickstart (two terminals)

```bash
npm install

# 1. Generate a fake "phone" library (300 photos + 12 videos)
npm run mklibrary -- --out demo/phone --count 300 --videos 12

# 2. Terminal A — start the PC receiver in pairing mode
npm run receiver -- --root demo/pc --pair

# 3. Terminal B — back everything up
npm run sender -- --from demo/phone --to 127.0.0.1:47822
```

While it runs, kill the sender (`Ctrl+C`) or the receiver at any point and
re-run the same commands — the transfer resumes at the exact chunk where it
stopped. Try `--chaos 0.5` on the sender for random Wi-Fi drops.

```
01:12:07 PLAN → SEND 312 · SKIP 0 (already backed up)
01:12:09 FILE_VERIFIED VID_20260801_120000.mp4 → cli-sender/2026/2026-08/VID_20260801_120000.mp4
01:12:10 Connection lost — waiting for phone…
01:12:14 Connected — resuming transfer…
01:12:14 PLAN → SEND 44 · RESUME 1 (verified data never re-sent) · SKIP 268
01:12:19 Session complete — 312 stored, 0 skipped (already backed up)
```

## Tests

```bash
npm test           # 24 tests: golden vectors + e2e + crash recovery
npm run typecheck
```

| Suite | What it proves |
| --- | --- |
| `tests/protocol.test.ts` | Wire format matches frozen golden vectors (`tests/vectors/`), xxHash64/SHA-256 match published reference values, chunk maps idempotent, path traversal blocked, SAS order-independent |
| `tests/e2e.test.ts` | Full transfer byte-identical; re-run is a no-op (all `SKIP`, zero chunks sent); mid-file drop resumes without re-sending verified bytes; corrupted chunk detected via xxHash64 and re-sent; unpaired device rejected; chaos mode still completes byte-identical |
| `tests/crash.test.ts` | Receiver power-loss mid-transfer → journal replay → `RESUME` from chunk maps; nothing re-sent, nothing lost, no orphan `.part` files, journal purged after promotion |

Golden vectors live in `tests/vectors/` and are regenerated with
`npm run gen-vectors` — any accidental wire-format drift breaks the build.

## Layout

```
src/
  protocol/   constants, frames (wire codec), messages, chunkmap, hash, paths
  pairing/    device identity (TLS certs), SAS word list, QR payload
  receiver/   journal (SQLite), media store, session state machine, TLS server, CLI
  sender/     library scanner, protocol client, CLI
scripts/      make-library (synthetic media), gen-vectors
tests/        protocol unit tests, e2e, crash recovery, golden vectors
```

## Reference-implementation divergences from the spec (deliberate)

- **Device identity** uses self-signed RSA-2048 TLS certificates pinned by
  SHA-256 fingerprint. The spec's Ed25519-identity design is unchanged;
  Node's TLS stack just can't present self-signed Ed25519 certs. Trust
  semantics (TOFU + pinning) are identical.
- **Pairing** in this CLI is `--pair` / `--trust <fingerprint>`; the QR +
  SAS ceremony is specified and its SAS algorithm is implemented and vector-
  tested (`src/pairing/sas.ts`), but the camera flow belongs to the phone apps.
- **mDNS discovery** is deferred; connections use explicit host:port. The QR
  payload format (`relaysync://pair?…`) is already final.
- The sender CLI journals in SQLite like the phone apps will, but scans a
  directory instead of MediaStore/PhotoKit, and uses the spec's fallback
  file-id form (`h:` + SHA-256).
