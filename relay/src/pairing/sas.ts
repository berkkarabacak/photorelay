/**
 * Short Authentication String (security-model.md §3.5).
 *
 * SAS = first 30 bits of SHA-256(peer_fp ‖ own_fp ‖ nonce), rendered as
 * six words from a fixed 32-word list (5 bits per word). Both sides compute
 * it independently and the user confirms they match.
 *
 * Golden vector: tests/vectors/sas.json.
 */
import { createHash } from "node:crypto";

/** Fixed 32-word SAS list (5 bits per word). Normative — do not reorder. */
export const SAS_WORDS = [
  "amber", "brave", "cedar", "delta", "eagle", "frost", "grape", "harbor",
  "ivory", "jolly", "karma", "lemon", "mango", "noble", "ocean", "pearl",
  "quilt", "river", "solar", "tiger", "ultra", "vivid", "waltz", "xenon",
  "yield", "zebra", "orbit", "pixel", "quest", "raven", "sable", "tulip",
] as const;

/**
 * Compute the 6-word SAS. `fpA`/`fpB` are the two peers' TLS certificate
 * fingerprints (SHA-256, colon-separated hex). Order-independent: the two
 * fingerprints are sorted before hashing so both sides agree.
 */
export function computeSas(fpA: string, fpB: string, nonce: string): string[] {
  const [lo, hi] = [fpA, fpB].sort();
  const digest = createHash("sha256").update(`${lo}|${hi}|${nonce}`, "utf8").digest();
  // first 30 bits → 6 × 5-bit words (big-endian bit order)
  const words: string[] = [];
  let acc = 0;
  let bits = 0;
  let i = 0;
  while (words.length < 6) {
    acc = (acc << 8) | digest[i++];
    bits += 8;
    while (bits >= 5 && words.length < 6) {
      bits -= 5;
      words.push(SAS_WORDS[(acc >> bits) & 0x1f]);
    }
  }
  return words;
}

export function formatSas(words: string[]): string {
  return words.join("-");
}
