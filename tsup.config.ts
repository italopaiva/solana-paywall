import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/react.tsx",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // These must resolve to the consumer's own copy, not a bundled snapshot:
  // - react: this hook returns React state: bundling a second copy breaks
  //   hooks across module instances.
  // - @solana/kit: Address/Instruction/TransactionSigner objects are passed
  //   across the caller/library boundary (usePaywall takes a signer and an
  //   rpc client from the caller) and rely on identity (branding) matching.
  external: ["react", "@solana/kit"],
});
