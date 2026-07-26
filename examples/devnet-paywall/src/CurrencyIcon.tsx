import type { Currency } from "solana-paywall";

/**
 * Small abstract per-currency badge — not the official SOL/USDC marks (those
 * are trademarked assets), just a generic visual cue so each pay button reads
 * as "a different currency" at a glance.
 */
export function CurrencyIcon({ currency }: { currency: Currency }) {
  if (currency.kind === "native") {
    return (
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-teal-400 text-[10px] font-bold text-slate-950"
      >
        S
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white"
    >
      $
    </span>
  );
}
