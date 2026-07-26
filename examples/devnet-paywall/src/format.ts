import type { Currency } from "solana-paywall";

const NATIVE_SOL_DECIMALS = 9;

export function currencyLabel(currency: Currency): string {
  if (currency.kind === "native") {
    return "SOL";
  }
  return currency.symbol ?? `${currency.mint.slice(0, 4)}…${currency.mint.slice(-4)}`;
}

export function currencyDecimals(currency: Currency): number {
  return currency.kind === "native" ? NATIVE_SOL_DECIMALS : currency.decimals;
}

/** Renders a base-unit bigint (lamports, or an SPL token's smallest unit) as a decimal string. */
export function formatAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString();
  }

  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

/** Renders a countdown like "1h 4m" or "42s"; "expired" once it hits zero. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return "expired";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
