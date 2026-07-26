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
  // - react/wallet-adapter-react provide React Context, which breaks across
  //   two module instances (the exact bug this fixes: useWallet() reading a
  //   WalletContext the app's own WalletProvider never provided).
  // - web3.js classes (PublicKey, Transaction, Connection) are also passed
  //   across this boundary and rely on identity (instanceof) matching.
  external: ["react", "@solana/wallet-adapter-react", "@solana/web3.js"],
});
