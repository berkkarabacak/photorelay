import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: "./", // Electron loadFile needs relative asset paths
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/renderer", import.meta.url)) },
  },
  build: { outDir: "dist/renderer" },
  server: { host: true, port: 3100, strictPort: false },
});
