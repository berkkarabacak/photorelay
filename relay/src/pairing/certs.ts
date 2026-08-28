/**
 * Device identity & TLS certificates (security-model.md §3–§4).
 *
 * Reference-implementation note: the spec calls for Ed25519 identity keys
 * signing the TLS exchange. Node's TLS stack cannot easily present
 * self-signed Ed25519 certs, so the reference uses self-signed RSA-2048
 * certificates generated per device and pinned by their SHA-256
 * fingerprint (TOFU) — identical trust semantics. Production clients use
 * Ed25519 as specified.
 */
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const selfsigned = require("selfsigned") as {
  generate: (
    attrs: Array<{ name: string; value: string }>,
    opts: Record<string, unknown>
  ) => { private: string; cert: string };
};

export interface DeviceIdentity {
  /** PEM private key (encrypt at rest in production; dev-only plaintext here) */
  key: string;
  /** PEM self-signed certificate */
  cert: string;
  /** SHA-256 fingerprint of the DER cert, colon-separated uppercase hex */
  fingerprint: string;
}

export function certFingerprint(certPem: string): string {
  return new X509Certificate(certPem).fingerprint256;
}

export function generateIdentity(deviceName: string): DeviceIdentity {
  const { private: key, cert } = selfsigned.generate(
    [{ name: "commonName", value: `photorelay-${deviceName}` }],
    {
      keySize: 2048,
      days: 3650,
      algorithm: "sha256",
      extensions: [{ name: "basicConstraints", cA: false }],
    }
  );
  return { key, cert, fingerprint: certFingerprint(cert) };
}

/** Load the device identity from disk, generating + persisting on first run. */
export function loadOrCreateIdentity(dir: string, deviceName: string): DeviceIdentity {
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, "identity.key.pem");
  const certPath = path.join(dir, "identity.cert.pem");
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const key = fs.readFileSync(keyPath, "utf8");
    const cert = fs.readFileSync(certPath, "utf8");
    return { key, cert, fingerprint: certFingerprint(cert) };
  }
  const id = generateIdentity(deviceName);
  // Restrictive permissions: owner-only where the platform supports it.
  fs.writeFileSync(keyPath, id.key, { mode: 0o600 });
  fs.writeFileSync(certPath, id.cert);
  return id;
}

/** Fingerprint of a TLS peer's certificate (from an established socket). */
export function peerFingerprint(peerCert: { raw?: Buffer } | undefined): string | null {
  if (!peerCert?.raw || peerCert.raw.length === 0) return null;
  return new X509Certificate(peerCert.raw).fingerprint256;
}

/** Pairing nonce + payload carried by the QR code (security-model.md §3.2). */
export function pairingPayload(opts: {
  host: string;
  port: number;
  fingerprint: string;
}): { payload: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 300;
  const params = new URLSearchParams({
    v: "1",
    host: opts.host,
    port: String(opts.port),
    pk: opts.fingerprint,
    nonce,
    exp: String(exp),
  });
  return { payload: `relaysync://pair?${params.toString()}`, nonce };
}

export function sha256FingerprintOfHex(hex: string): string {
  return createHash("sha256").update(hex).digest("hex");
}
