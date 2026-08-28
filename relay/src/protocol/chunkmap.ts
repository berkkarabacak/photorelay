/**
 * RelaySync/1 chunk map — the receiver-journaled bitmap of durably stored
 * chunks for one file (transfer-protocol.md §5.4, data-model.md `chunks`).
 *
 * Serialization: LSB-first bit order — chunk index i lives at byte (i >> 3),
 * bit (i & 7). Frozen by tests/vectors/chunkmap.json.
 */
export class ChunkMap {
  readonly totalChunks: number;
  private readonly bits: Uint8Array;
  private received = 0;

  constructor(totalChunks: number, serialized?: Uint8Array) {
    if (totalChunks < 1) throw new Error("totalChunks must be >= 1");
    this.totalChunks = totalChunks;
    this.bits = new Uint8Array(Math.ceil(totalChunks / 8));
    if (serialized) {
      if (serialized.length !== this.bits.length) {
        throw new Error(
          `chunk map size mismatch: expected ${this.bits.length} bytes, got ${serialized.length}`
        );
      }
      this.bits.set(serialized);
      for (let i = 0; i < totalChunks; i++) if (this.has(i)) this.received++;
    }
  }

  static chunksFor(fileSize: number): number {
    return Math.max(1, Math.ceil(fileSize / CHUNK_SIZE_REF));
  }

  has(index: number): boolean {
    return (this.bits[index >> 3] & (1 << (index & 7))) !== 0;
  }

  /** Idempotent: setting an already-set chunk returns false and changes nothing. */
  set(index: number): boolean {
    if (index < 0 || index >= this.totalChunks) return false;
    if (this.has(index)) return false;
    this.bits[index >> 3] |= 1 << (index & 7);
    this.received++;
    return true;
  }

  get receivedChunks(): number {
    return this.received;
  }

  get complete(): boolean {
    return this.received === this.totalChunks;
  }

  /** First chunk index the receiver still needs, or -1 when complete. */
  firstMissing(): number {
    for (let i = 0; i < this.totalChunks; i++) if (!this.has(i)) return i;
    return -1;
  }

  /** All missing chunk indices, in order. Used to build RESUME plans. */
  missing(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) if (!this.has(i)) out.push(i);
    return out;
  }

  serialize(): Uint8Array {
    return this.bits.slice();
  }

  toBase64(): string {
    return Buffer.from(this.bits).toString("base64");
  }

  static fromBase64(totalChunks: number, b64: string): ChunkMap {
    return new ChunkMap(totalChunks, new Uint8Array(Buffer.from(b64, "base64")));
  }
}

// Local alias to avoid an import cycle (constants.ts never imports chunkmap).
import { CHUNK_SIZE as CHUNK_SIZE_REF } from "./constants.js";
