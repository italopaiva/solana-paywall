# solana-paywall — devnet example

A minimal, functional React app demonstrating `solana-paywall`'s Client-Verified
Mode end-to-end, against Solana devnet: connect a wallet, pay in SOL or devnet
USDC, unlock gated content — no backend involved.

## Prerequisites

- Node 20+
- A browser wallet extension supporting devnet — [Phantom](https://phantom.app)
  or [Solflare](https://solflare.com) both work, this example includes both
  adapters. Switch the extension's network to **Devnet** before you start.

## Setup

1. **Build the library** (this example depends on it via a local `file:` reference,
   so it needs a build to exist first). From the repo root:

   ```bash
   npm install
   npm run build
   ```

2. **Install the example's dependencies**:

   ```bash
   cd examples/devnet-paywall
   npm install
   ```

3. **Configure a receiving wallet.** This is just an address you control — the
   app never needs its private key, it's only where the demo's payments go, so
   you can verify they arrived.

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` and set `VITE_RECEIVING_WALLET` to a devnet address —
   easiest is to open your wallet extension, switch it to Devnet, and copy its
   address.

4. **Fund the wallet you'll pay FROM** (typically the same wallet, or a second
   one) with devnet SOL:

   ```bash
   solana airdrop 1 <your-address> --url devnet
   ```

   or use https://faucet.solana.com.

   To test the USDC price option too, get devnet USDC from Circle's faucet —
   see https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana.
   Paying in SOL alone is enough to see the whole flow work.

5. **Run it**:

   ```bash
   npm run dev
   ```

   Open the printed local URL, connect your wallet (make sure it's on
   Devnet), and pay.

## What this demonstrates

- **Client-Verified Mode** (`<Paywall>` from `solana-paywall/react`, built on
  `usePaywall`) — the browser confirms the payment on-chain itself via RPC, no
  server round-trip.
- **Two accepted currencies** on one Resource — the pay button set shows one
  option per `PriceEntry` (SOL and devnet USDC), per the Price List design.
- **Timed Access** — this demo resource grants 1 hour of access, so you can
  pay once and then reload to see the cached-signature fast path, or clear
  `localStorage` to see the wallet-history Payment Lookup re-discover the same
  payment from scratch.

For a custom UI instead of the default `<Paywall>` component, use the
`usePaywall` hook directly — see `solana-paywall`'s `src/react/Paywall.tsx` in
the main repo for a minimal reference implementation built on it.
