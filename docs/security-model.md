# PhotoRelay — Security Model

Version 0.1 · Status: initial design

---

## 1. Security goals

1. **Confidentiality on the LAN.** Photos and videos are the most personal
   files people own; they must not cross the local network in plaintext.
2. **Mutual device authentication.** A phone must only ever send to *its*
   paired PC, and a PC must only accept from *its* paired phones.
3. **Local-only by architecture.** No cloud, no account, no telemetry with
   content or metadata. If every server we own disappeared, the product
   would keep working forever.
4. **Fail closed.** Any authentication, integrity, or verification failure
   stops the transfer loudly — it never degrades to an insecure mode.

## 2. Threat model

| Threat | Mitigation |
| --- | --- |
| Passive sniffing on LAN/Wi-Fi | TLS 1.3 on every connection; no plaintext fallback |
| Rogue device impersonating the PC | Pairing via QR containing the PC's Ed25519 public key; phone pins it (TOFU) |
| Rogue phone injecting files | Mutual TLS: receiver pins the phone's cert at pairing; out-of-plan frames rejected (`PROTOCOL_VIOLATION`) |
| Malicious file paths (`../`, absolute paths) | Receiver sanitizes `rel_path`; final paths are *receiver-computed*, sender paths are advisory metadata only |
| Replay of old chunks | Chunks validated against the current plan's offsets; chunk map idempotent |
| Tampered chunks in flight | TLS record integrity + per-chunk xxHash64 (transport) and optional SHA-256 (content) |
| Evil-maid / stolen PC | Library readable at rest (user's OS account boundary); device keys sealed in DPAPI |
| Phone lost after pairing | Unpair from PC revokes the device cert; session journal retained for audit |
| Resource exhaustion (hostile peer) | Frame size cap (4 MiB), in-flight window cap, per-device concurrency = 1, disk quota check before `PLAN` |

Out of scope (stated honestly): a fully compromised endpoint OS, physical
forensics on an unlocked device, malicious firmware.

## 3. Pairing

Pairing establishes *permanent device identity*, once:

1. PC generates an **Ed25519 identity keypair** at first launch; public key
   fingerprint shown in the app.
2. PC displays a QR code:

   ```
   relaysync://pair?v=1&host=192.168.1.20&port=47822
       &pk=<base64url(ed25519-pub)>&nonce=<random-16B>&exp=300
   ```

3. Phone scans → connects → TLS 1.3 handshake with the PC's ephemeral cert
   signed by its identity key; phone verifies `pk` from the QR.
4. Phone presents its own freshly generated identity key inside the TLS
   channel, bound to `nonce` (proves this pairing session, blocks replay).
5. Both sides display the same **6-word short authentication string**
   (SAS = first 30 bits of `SHA-256(pk_pc ‖ pk_phone ‖ nonce)`, word-list
   encoded). User confirms on both screens.
6. Both pin each other's identity key. `exp` makes stale QR codes useless.

mDNS discovery after pairing just finds the IP; trust comes only from the
pinned keys. Networks where mDNS is blocked (guest Wi-Fi) are fully
supported because the QR carries `host`/`port`.

## 4. Transport security

- **TLS 1.3 only**, PSK-resumption allowed between pinned peers for fast
  reconnects (important: resume must be cheap or users will fear it).
- Cipher suites: TLS_AES_256_GCM_SHA384 or TLS_CHACHA20_POLY1305_SHA256
  (mobile CPUs without AES-NI).
- Certificates: self-signed per-device, generated at pairing, validated by
  pinning — **no CA, no PKI, no expiry dependencies**.
- Heartbeats are authenticated frames; dead-peer detection cannot be
  spoofed into a "keep waiting" state by an off-path attacker.

## 5. Key storage

| Platform | Mechanism |
| --- | --- |
| Windows | Private key sealed with **DPAPI** (per-user); alternative: TPM-backed key via NCrypt on supported hardware |
| Android | **Android Keystore** (TEE/StrongBox where available), key non-exportable |
| iOS | **Keychain**, `kSecAttrAccessibleAfterFirstUnlock`, Secure Enclave preferred |

Pinned peer keys are public data and stored in plain SQLite rows.

## 6. Privacy posture

- **Nothing leaves the LAN.** No analytics on file names, counts, or
  content. (Crash reporting, if ever added, is opt-in and metadata-free.)
- The receiver writes sender-supplied paths only as *display metadata*;
  storage paths are receiver-computed (see
  [data-model.md](data-model.md) §5).
- Unpairing deletes the peer's pinned key and stops accepting its
  connections. Stored photos are never touched by unpairing.

## 7. Implementation checklist (normative for first clients)

- [ ] No plaintext listener exists in any build
- [ ] `rel_path` sanitization unit-tested with hostile inputs
- [ ] SAS confirmation is mandatory (no "skip" button)
- [ ] QR codes expire (`exp`) and are single-use (`nonce` tracked)
- [ ] TLS 1.2 and below refused
- [ ] Chunk writes outside the plan are dropped and logged
- [ ] Journal writes precede every `CHUNK_ACK`
