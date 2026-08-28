// Bundle the Electron main process (includes the relay/ engine) with esbuild.
// The createRequire banner lets bundled CJS deps (node-forge via selfsigned)
// require() Node builtins inside the ESM output.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["electron"],
  banner: {
    js: "import { createRequire as __photorelay_cr } from 'node:module';\nconst require = __photorelay_cr(import.meta.url);",
  },
  outfile: "dist/main/main.js",
  logLevel: "info",
});
