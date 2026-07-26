import type { ClientWithWallet } from "@solana/kit-plugin-wallet";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import { useEffect, useState, type ReactNode } from "react";
import type { AccessGrant, Currency, Resource } from "solana-paywall";
import { usePaywall, type UsePaywallOptions } from "solana-paywall/react";
import { CurrencyIcon } from "./CurrencyIcon.js";
import { currencyDecimals, currencyLabel, formatAmount, formatDuration, formatTimestamp } from "./format.js";
import { RECEIVING_WALLET, rpc, sampleResource } from "./resource.js";
import { Wallet } from "./Wallet.js";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Address({ value }: { value: string }) {
  return (
    <code className="block break-all rounded bg-slate-900 px-2 py-1 text-sm text-slate-200">
      {value}
    </code>
  );
}

function ContentSkeleton() {
  return (
    <div aria-hidden className="animate-pulse space-y-3">
      <div className="h-4 w-3/4 rounded bg-slate-700" />
      <div className="h-4 w-full rounded bg-slate-700" />
      <div className="h-4 w-5/6 rounded bg-slate-700" />
      <div className="h-4 w-2/3 rounded bg-slate-700" />
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-6 w-6 text-slate-300"
      aria-hidden
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function LockedContent({
  resource,
  isPaying,
  onPay,
}: {
  resource: Resource;
  isPaying: boolean;
  onPay: (currency: Currency) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg">
        <div className="pointer-events-none select-none blur-sm">
          <ContentSkeleton />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/75 text-center">
          <LockIcon />
          <p className="font-medium text-slate-100">This content is locked</p>
          <p className="text-sm text-slate-400">Pay to unlock instant access.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {resource.priceList.map((entry) => {
          const label = currencyLabel(entry.currency);
          return (
            <button
              key={label}
              type="button"
              disabled={isPaying}
              onClick={() => onPay(entry.currency)}
              className="flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CurrencyIcon currency={entry.currency} />
              Pay {formatAmount(entry.amount, currencyDecimals(entry.currency))} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PaymentMeta({ grant }: { grant: AccessGrant }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (grant.kind !== "timed") {
      return;
    }
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [grant.kind]);

  return (
    <p className="text-xs text-slate-400">
      Paid at {formatTimestamp(grant.paidAt)}
      {grant.kind === "timed"
        ? ` · Time left: ${formatDuration(grant.expiresAt - now)}`
        : " · Permanent access"}
    </p>
  );
}

function ContentSection({
  resource,
  rpc: paywallRpc,
  receivingWallet,
  signer,
}: {
  resource: Resource;
  rpc: UsePaywallOptions["rpc"];
  receivingWallet: string;
  signer: UsePaywallOptions["signer"];
}) {
  const { access, isPaying, pay } = usePaywall(resource, { rpc: paywallRpc, receivingWallet, signer });

  return (
    <Card title="Content">
      {access.status === "loading" ? <ContentSkeleton /> : null}

      {access.status === "not-paid" ? (
        <LockedContent
          resource={resource}
          isPaying={isPaying}
          onPay={(currency) => {
            pay(currency).catch(() => {
              // usePaywall already surfaces failures via `access`.
            });
          }}
        />
      ) : null}

      {access.status === "error" ? <p className="text-sm text-red-400">{access.message}</p> : null}

      {access.status === "granted" ? (
        <div className="space-y-3">
          <article className="space-y-2 rounded-lg border border-emerald-700 bg-emerald-950/30 p-4">
            <h3 className="font-semibold text-emerald-300">Unlocked!</h3>
            <p className="text-slate-300">
              This is the gated content. Reload the page and it'll still show (cached
              signature fast path), or clear localStorage and reload to see the on-chain
              Payment Lookup find it again from scratch.
            </p>
          </article>
          <PaymentMeta grant={access.grant} />
        </div>
      ) : null}
    </Card>
  );
}

function WalletConnect() {
  const client = useClient<ClientWithWallet>();
  const connected = useConnectedWallet(client);
  const wallets = useWallets(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);

  if (connected) {
    return (
      <div className="space-y-3">
        <Address value={connected.account.address} />
        <button
          type="button"
          disabled={disconnect.isRunning}
          onClick={() => disconnect.dispatch()}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-400 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (wallets.length === 0) {
    return <p className="text-sm text-slate-400">No Solana wallets detected in this browser.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {wallets.map((wallet) => (
        <button
          key={wallet.name}
          type="button"
          disabled={connect.isRunning}
          onClick={() => connect.dispatch(wallet)}
          className="flex items-center gap-2 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <img src={wallet.icon} alt="" className="h-4 w-4" />
          {wallet.name}
        </button>
      ))}
    </div>
  );
}

function MissingConfig() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-12 text-slate-100">
      <h1 className="text-2xl font-semibold">solana-paywall — devnet example</h1>
      <p className="text-slate-300">
        Set <code className="rounded bg-slate-800 px-1.5 py-0.5">VITE_RECEIVING_WALLET</code>{" "}
        to a devnet wallet address you control:
      </p>
      <ol className="list-decimal space-y-1 pl-6 text-slate-300">
        <li>
          Copy <code className="rounded bg-slate-800 px-1.5 py-0.5">.env.example</code> to{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5">.env.local</code>
        </li>
        <li>
          Fill in <code className="rounded bg-slate-800 px-1.5 py-0.5">VITE_RECEIVING_WALLET</code>
        </li>
        <li>
          Restart <code className="rounded bg-slate-800 px-1.5 py-0.5">npm run dev</code>
        </li>
      </ol>
      <p className="text-slate-400">See the README in this folder for the full setup walkthrough.</p>
    </main>
  );
}

function Demo() {
  const client = useClient<ClientWithWallet>();
  const connected = useConnectedWallet(client);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12 text-slate-100">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">solana-paywall — devnet example</h1>
        <p className="text-slate-300">
          Client-Verified Mode: everything below runs entirely in this browser tab, no
          backend involved.
        </p>
      </header>

      <Card title="Paying to">
        <Address value={RECEIVING_WALLET} />
      </Card>

      <Card title="Your wallet">
        <WalletConnect />
      </Card>

      {connected?.signer ? (
        <ContentSection
          resource={sampleResource}
          rpc={rpc}
          receivingWallet={RECEIVING_WALLET}
          signer={connected.signer}
        />
      ) : null}
    </main>
  );
}

export default function App() {
  if (!RECEIVING_WALLET) {
    return <MissingConfig />;
  }

  return (
    <Wallet>
      <Demo />
    </Wallet>
  );
}
