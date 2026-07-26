import type { Resource } from "solana-paywall";

/**
 * Circle's official Devnet USDC mint.
 * https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana
 * USDC uses 6 decimals on every chain it's issued on.
 */
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Set via .env.local — see .env.example. */
export const RECEIVING_WALLET: string = import.meta.env.VITE_RECEIVING_WALLET ?? "";

/**
 * A Timed Access resource, priced in SOL or devnet USDC. The 1-hour duration
 * (rather than something longer) is deliberate, so you can pay once and then
 * re-test the "already paid" Payment Lookup path within the same session.
 */
export const sampleResource: Resource = {
  id: "demo-article",
  accessType: { kind: "timed", durationSeconds: 3600 },
  priceList: [
    { currency: { kind: "native" }, amount: 10_000_000n }, // 0.01 SOL
    {
      currency: { kind: "spl", mint: DEVNET_USDC_MINT, decimals: 6, symbol: "USDC" },
      amount: 100_000n, // 0.10 USDC
    },
  ],
};
