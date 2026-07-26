import type { ReactNode } from "react";
import type { Currency } from "../types.js";
import { usePaywall, type UsePaywallOptions } from "./usePaywall.js";
import type { Resource } from "../types.js";

const NATIVE_SOL_DECIMALS = 9;

function currencyLabel(currency: Currency): string {
  if (currency.kind === "native") {
    return "SOL";
  }
  return currency.symbol ?? `${currency.mint.slice(0, 4)}…${currency.mint.slice(-4)}`;
}

function currencyDecimals(currency: Currency): number {
  return currency.kind === "native" ? NATIVE_SOL_DECIMALS : currency.decimals;
}

/** Renders a base-unit bigint (lamports, or an SPL token's smallest unit) as a decimal string. */
function formatAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString();
  }

  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(decimals, "0").replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Class names applied to the default markup, one key per element. Every key
 * is optional and passed straight through to `className` — bring whatever
 * styling system you like (Tailwind, CSS modules, plain CSS); this component
 * has no opinion of its own and ships with none applied.
 */
export type PaywallClassNames = {
  container?: string;
  error?: string;
  button?: string;
};

export type PaywallProps = UsePaywallOptions & {
  resource: Resource;
  children: ReactNode;
  classNames?: PaywallClassNames;
};

/**
 * Thin, unstyled default gate built on usePaywall: a pay button per accepted
 * currency until access is granted, then the children. No bundled styling —
 * pass `classNames` to style the default markup, or build your own UI on
 * usePaywall directly if you need full control.
 */
export function Paywall(props: PaywallProps): ReactNode {
  const { resource, children, classNames, ...options } = props;
  const { access, isPaying, pay } = usePaywall(resource, options);

  if (access.status === "granted") {
    return children;
  }

  if (access.status === "loading") {
    return null;
  }

  return (
    <div className={classNames?.container}>
      {access.status === "error" ? <p className={classNames?.error}>{access.message}</p> : null}
      {resource.priceList.map((entry) => (
        <button
          key={currencyLabel(entry.currency)}
          type="button"
          disabled={isPaying}
          className={classNames?.button}
          onClick={() => {
            pay(entry.currency).catch(() => {
              // usePaywall already surfaces failures via `access`.
            });
          }}
        >
          Pay {formatAmount(entry.amount, currencyDecimals(entry.currency))}{" "}
          {currencyLabel(entry.currency)}
        </button>
      ))}
    </div>
  );
}
