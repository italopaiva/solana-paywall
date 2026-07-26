import type { ReactNode } from "react";
import type { Currency } from "../types.js";
import { usePaywall, type UsePaywallOptions } from "./usePaywall.js";
import type { Resource } from "../types.js";

function currencyLabel(currency: Currency): string {
  return currency.kind === "native" ? "SOL" : currency.mint;
}

export type PaywallProps = UsePaywallOptions & {
  resource: Resource;
  children: ReactNode;
};

/**
 * Thin, unstyled default gate built on usePaywall: a pay button per accepted
 * currency until access is granted, then the children. No bundled styling —
 * build your own UI on usePaywall directly if you need one.
 */
export function Paywall(props: PaywallProps): ReactNode {
  const { resource, children, ...options } = props;
  const { access, isPaying, pay } = usePaywall(resource, options);

  if (access.status === "granted") {
    return children;
  }

  if (access.status === "loading") {
    return null;
  }

  return (
    <div>
      {access.status === "error" ? <p>{access.message}</p> : null}
      {resource.priceList.map((entry) => (
        <button
          key={currencyLabel(entry.currency)}
          type="button"
          disabled={isPaying}
          onClick={() => {
            pay(entry.currency).catch(() => {
              // usePaywall already surfaces failures via `access`.
            });
          }}
        >
          Pay {entry.amount.toString()} {currencyLabel(entry.currency)}
        </button>
      ))}
    </div>
  );
}
