import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @solana/web3.js and the wallet adapters expect Node's Buffer to exist in
// the browser — aliasing to the `buffer` npm package and polyfilling the
// global (see src/main.tsx) covers it without a build-plugin dependency.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  define: {
    global: "globalThis",
  },
});
