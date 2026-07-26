import { createClient } from "@solana/kit";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { ClientProvider } from "@solana/react";
import { useMemo, type ReactNode } from "react";

export function Wallet({ children }: { children: ReactNode }) {
  const client = useMemo(() => createClient().use(walletSigner({ chain: "solana:devnet" })), []);

  return <ClientProvider client={client}>{children}</ClientProvider>;
}
