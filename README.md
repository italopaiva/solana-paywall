# solana-paywall

Gate content or functionality behind a Solana payment (SOL or USDC, extensible
to more SPL tokens) — usable standalone from React with no backend
(Client-Verified Mode), or from your own backend for real server-side
enforcement (Server-Verified Mode). See `CONTEXT.md` for the domain model and
`docs/adr/` for the architectural decisions behind it.

## Packages

One npm package, two entry points:

- `solana-paywall` — framework-agnostic core: `buildPaymentRequest`,
  `evaluatePayment`, the signature and wallet-history Payment Lookups, and
  optional `PaymentRecordStore` caching for backends.
- `solana-paywall/react` — `usePaywall` and the default `<Paywall>`
  component, built on the core.

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Try it locally

`examples/devnet-paywall` is a runnable React app demonstrating the whole
flow against Solana devnet — connect a wallet, pay in SOL or USDC, unlock
gated content, no backend involved. See that folder's README for setup.

## Docs

- `.scratch/paywall-mvp/spec.md` — the spec this v1 was built from.
- `.scratch/paywall-mvp/issues/` — the implementation tickets.
- `CONTEXT.md` — domain glossary.
- `docs/adr/` — architectural decisions.
