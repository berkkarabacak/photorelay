/** Minimal type declarations for untyped runtime dependencies. */

declare module "xxhashjs" {
  interface LongLike {
    toString(radix?: number): string;
  }
  interface Hasher {
    update(data: ArrayBuffer | Uint8Array | string): Hasher;
    digest(): LongLike;
  }
  const XXH: {
    h64(seed: number): Hasher;
    h32(seed: number): Hasher;
  };
  export default XXH;
}

declare module "selfsigned" {
  export interface SelfSignedResult {
    private: string;
    public: string;
    cert: string;
    fingerprint: string;
  }
  const selfsigned: {
    generate(
      attrs: Array<{ name: string; value: string }>,
      opts?: Record<string, unknown>
    ): SelfSignedResult;
  };
  export default selfsigned;
}

declare module "qrcode-terminal" {
  const qrcode: {
    generate(text: string, opts?: { small?: boolean }, cb?: (qr: string) => void): void;
  };
  export default qrcode;
}
