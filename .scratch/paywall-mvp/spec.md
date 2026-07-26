Status: ready-for-agent

# Solana Paywall — Core Lib + React Entry Point (v1)

## Problem Statement

Developers who want to gate content or functionality behind a Solana payment currently have to hand-roll everything themselves: building the transfer transaction, deciding what proves someone paid, tracking whether a wallet already has access, and re-implementing all of it separately for a React frontend versus a backend. There's no drop-in building block that handles "did this wallet pay for this thing" for both a purely client-side app and a server that needs to make its own authoritative access decision.

## Solution

A single library that ships a framework-agnostic core (usable from any Node/backend context) plus a React entry point (a hook, and a default component built on it). Both entry points share the same two pure functions for constructing a payment and evaluating whether a payment satisfies a Resource's price and terms. A developer can gate a Resource entirely client-side with no backend (Client-Verified Mode), or use the core lib from their own server as the authority on access (Server-Verified Mode) — both are first-class, not one a stub for the other. Payments are plain SOL/SPL transfers carrying a memo that ties the payment to a specific Resource and its terms; no custom on-chain program is required. SOL and USDC are supported at launch, with more SPL tokens addable later by registering a mint and a price.

## User Stories

1. As a frontend developer with no backend, I want to gate a piece of UI behind a Solana payment using only a React hook, so that I can ship a paywalled feature without standing up any server infrastructure.
2. As a frontend developer, I want a default `<Paywall>` component that renders a pay button and only shows its children once access is granted, so that I don't have to build gating UI from scratch.
3. As a frontend developer who wants custom UI, I want the underlying hook exposed separately from the component, so that I can build my own pay button and gated layout while reusing the same logic.
4. As a backend developer, I want a framework-agnostic function to evaluate whether a given wallet has paid for a Resource, so that my server can be the authoritative source of truth for access to a real secret or an API response.
5. As a backend developer, I want the same core functions the React hook uses, so that my server-side verification logic can never drift from what the client believes it verified.
6. As a developer defining a Resource, I want to set a fixed price per accepted currency (e.g. "0.05 SOL or 5 USDC"), so that payers can pay in whichever currency they hold without the library needing a price oracle.
7. As a developer defining a Resource, I want to choose whether a payment grants Permanent Unlock or Timed Access, so that I can model both "buy once, keep forever" and "pay for a window of access" use cases.
8. As a developer using Timed Access, I want the access duration locked in at the moment of payment, so that a purchaser's terms can't silently change if I later reconfigure the Resource's duration.
9. As an end user, I want to pay with either SOL or USDC from my connected wallet, so that I can use whichever asset I already hold.
10. As an end user who just paid, I want the app to recognize my payment immediately without waiting for a background scan, so that I get access right after my transaction confirms.
11. As an end user returning on a new device or after clearing local storage, I want the app to still recognize that I already paid, so that I'm not asked to pay twice for the same Resource.
12. As a frontend developer, I want a successful payment's signature cached locally, so that repeat access checks for the same wallet and Resource don't need a full history scan every time.
13. As a developer, I want to configure a single Receiving Wallet once per integration, so that I don't have to manage per-resource wallets for a single-merchant use case.
14. As a developer, I want the library to reject a payment sent in a currency not listed in the Resource's Price List, so that only intentionally-accepted currencies can unlock access.
15. As a developer, I want a payment that meets or exceeds a Resource's price to count as valid, so that minor overpayment (rounding, a tip) doesn't break legitimate access.
16. As a developer, I want a payment for less than the price to be rejected, so that underpayment can never grant access.
17. As a developer, I want the payment-to-Resource link encoded in the transaction itself (via a memo), so that verification doesn't depend on any off-chain state existing.
18. As a backend developer, I want an optional pluggable store for caching payment records, so that I can avoid re-scanning on-chain history on every request if I have my own database.
19. As a frontend developer, I have no such database option available to me client-side, so that Client-Verified Mode always falls back to on-chain lookup, and I want that documented clearly rather than silently failing.
20. As a developer, I want to add a new accepted SPL token later by registering its mint and a price, so that extending accepted currencies doesn't require touching core verification logic.
21. As a developer, I want the core evaluation and payment-building functions to be pure (no network calls inside them), so that I can unit test my own Resource configurations without mocking an RPC connection.
22. As a developer, I want the function that fetches a transaction (by signature, or by scanning a wallet's history) to be an injectable dependency, so that I can test evaluation logic with plain data and swap in a real RPC client only at the edges.
23. As a developer integrating Server-Verified Mode, I want a function that checks one known signature, so that I can verify a payment my own backend just observed (e.g. via a webhook or a client-submitted signature).
24. As a developer integrating either mode, I want a function that scans a wallet's transaction history against the Receiving Wallet for a valid matching payment, so that I can answer "has this wallet ever paid for this Resource" without a stored signature.
25. As a developer reading the glossary, I want the library's public types and function names to match the project's domain vocabulary (Resource, Access Type, Price List, Purchase Memo, Payment Lookup), so that the code and the design docs stay in sync.
26. As a security-conscious developer, I want it documented explicitly that Client-Verified Mode's unlock decision is never authoritative for anything the client itself shouldn't already be able to see, so that I don't accidentally use it to gate a real secret.
27. As a developer, I want amounts expressed in each currency's smallest unit (lamports for SOL, base units for USDC) using integer/BigInt arithmetic, so that price comparisons never suffer floating-point rounding errors.

## Implementation Decisions

**Package shape.** One npm package with two entry points: a framework-agnostic core at the package root, and a `/react` entry point that re-exports the core plus the hook and default component. (Confirmed during the grilling session; see `CONTEXT.md`.)

**Core domain types.**
- `Resource` — has a stable Resource ID, an `AccessType` (`permanent`, or `timed` with a `durationSeconds`), and a `PriceList`: an array of entries, each either `{ kind: "native" }` (SOL) or `{ kind: "spl", mint: <mint address> }` (USDC and future tokens), each carrying an `amount` in that currency's smallest unit as a `bigint`.
- `AccessGrant` — the result of a valid payment: either `{ kind: "permanent" }` or `{ kind: "timed", expiresAt: <unix timestamp> }`, where `expiresAt` is computed at evaluation time from the payment's block time plus the duration recorded in the Purchase Memo (not the Resource's current configured duration).
- `PaymentEvaluation` — either a valid result carrying the matched `PriceEntry` and the resulting `AccessGrant`, or an invalid result carrying a reason (wrong currency, amount too low, missing/malformed memo, wrong receiving wallet, resource ID mismatch).

**Purchase Memo format.** A single SPL Memo instruction attached to the transfer, encoding a version tag, the Resource ID, the Access Type, and (for timed access) the duration in seconds, in a compact delimited string chosen to stay well within transaction size limits. The exact wire format is an internal contract between `buildPaymentRequest` and `evaluatePayment` — round-trip correctness (build then evaluate produces the expected grant) is what's guaranteed, not the literal string layout.

**`buildPaymentRequest(resource, chosenCurrency, payer, receivingWallet)`.** Pure function. Given a Resource, which Price List entry the payer chose, the payer's address, and the Receiving Wallet, returns the transfer instruction (native SOL transfer or SPL token transfer, matching the chosen currency) plus the Purchase Memo instruction, ready to be assembled into a transaction and sent by the caller. Does not send anything itself and does not touch RPC.

**`evaluatePayment(transaction, resource, receivingWallet)`.** Pure function. Given an already-fetched, already-parsed transaction, a Resource, and the expected Receiving Wallet, returns a `PaymentEvaluation`. Checks: transfer destination matches the Receiving Wallet, transfer currency matches a Price List entry, transfer amount is at least that entry's price, and the memo is present, well-formed, and references this Resource's ID. This is the single seam shared by Client-Verified Mode, Server-Verified Mode, the signature fast-path, and the history-scan lookup.

**`resolvePaymentBySignature(signature, resource, receivingWallet, fetchTransaction)`.** Fetches one transaction via the injected `fetchTransaction` adapter and runs it through `evaluatePayment`. This is the fast path used immediately after a payment is sent.

**`findPaymentForResource(payerWallet, resource, receivingWallet, fetchTransactionHistory)`.** Fetches candidate transactions for `payerWallet` against `receivingWallet` via the injected `fetchTransactionHistory` adapter (wrapping `getSignaturesForAddress`-style history), and runs each candidate through `evaluatePayment` until a valid match is found (or none is). This is the Payment Lookup used on a returning visit with no cached signature.

**Injected RPC adapters.** `fetchTransaction` and `fetchTransactionHistory` are plain function parameters, not a bundled `Connection` object — callers (the React hook, or a backend integration) provide their own RPC client and wrap it to match these adapter shapes. Keeps the core functions network-free and directly testable.

**React hook (`usePaywall`).** Wraps wallet-adapter connection state, an injected RPC connection, `buildPaymentRequest`, `resolvePaymentBySignature`, and `findPaymentForResource`. On mount (or wallet change), attempts the cached-signature fast path if a signature is stored in `localStorage` for this wallet + Resource ID; otherwise runs the history-scan lookup. Exposes a pay action that builds and sends the transaction, then caches the resulting signature and re-evaluates.

**Default `<Paywall>` component.** Built on `usePaywall`; renders a pay button when access is not granted and its children when it is. No styling system bundled — minimal, unstyled markup only.

**Server-Verified Mode usage.** Not a separate entry point — a backend developer imports the core (root) entry point directly and calls `resolvePaymentBySignature` / `findPaymentForResource` with their own RPC adapters, optionally backed by a `PaymentRecordStore` (an interface with get/set methods) that a developer can implement over their own database to cache lookups. No concrete store implementation ships in this spec — only the interface.

**Extensibility.** Adding a new accepted SPL token is registering a new `PriceList` entry (mint + amount) on a Resource — no change to `evaluatePayment`, `buildPaymentRequest`, or the memo format.

## Testing Decisions

- Tests target external behavior of the two core seams — `buildPaymentRequest` and `evaluatePayment` — not their internal helpers (memo encoding is exercised through round-tripping build → evaluate, plus one explicit test locking the wire format so accidental breaking changes are caught).
- `resolvePaymentBySignature` and `findPaymentForResource` are tested with a fake `fetchTransaction`/`fetchTransactionHistory` adapter returning canned transaction data — never a real or mocked `Connection`.
- Cases to cover for `evaluatePayment`: valid payment in each accepted currency, overpayment (valid), underpayment (invalid), wrong receiving wallet (invalid), missing memo (invalid), malformed memo (invalid), memo referencing a different Resource ID (invalid), permanent grant, timed grant with expiry computed from the memo's duration and the transaction's block time, and a later Resource duration change not affecting an already-evaluated timed grant.
- Cases to cover for `buildPaymentRequest`: correct instruction shape for a native SOL price entry vs. an SPL price entry, and that the resulting memo round-trips through `evaluatePayment` into the expected `AccessGrant`.
- No prior art exists in this repo yet — this is the first code and the first tests. Test runner choice (assumed: Vitest, per the project's TypeScript conventions) is an implementation detail for the build phase, not fixed by this spec.
- The React hook and default component are not covered by automated tests in this pass — see Out of Scope.

## Out of Scope

- A custom on-chain program tracking purchases in a PDA (see ADR-0001) — may be revisited later if on-chain state becomes genuinely necessary (e.g. refunds).
- Price oracles, USD-denominated pricing, or any currency conversion — prices are fixed per currency.
- Multi-tenant support (per-resource receiving wallets) — one Receiving Wallet per integration only.
- A generic pluggable payment-method abstraction beyond registering more SPL tokens — no non-Solana rails, no fundamentally different payment mechanisms.
- Refunds, admin-revoked access, or dispute handling.
- Concrete `PaymentRecordStore` implementations for specific databases (Postgres, Redis, etc.) — only the interface ships.
- Wallet adapter selection and styling/theming for the default component — unstyled, minimal markup only; wallet connection itself is assumed to be handled by the app via its own wallet-adapter setup.
- RPC provider selection, devnet/mainnet configuration, priority fees, or compute budget tuning.
- Automated tests for the React hook and `<Paywall>` component (e.g. Playwright-driven) — deferred to a future pass once the core is built and stable.
- Rate limiting or abuse protection on however a backend developer exposes Server-Verified Mode over their own API — that's the integrator's responsibility.
- Localization/i18n of any bundled UI text.

## Further Notes

- Domain vocabulary (Resource, Access Type, Permanent Unlock, Timed Access, Price List, Receiving Wallet, Purchase Memo, Payment Lookup, Client-Verified Mode, Server-Verified Mode) is defined in `CONTEXT.md` and should be used as-is throughout implementation, tests, and any further design docs.
- This spec's two architectural pillars — no on-chain program, and Client-Verified Mode as a first-class trust model — are recorded as `docs/adr/0001-no-onchain-program.md` and `docs/adr/0002-dual-trust-model.md`. Implementation should not silently deviate from either without revisiting the ADR.
- This spec covers the full v1 release (core + React entry point) as a single unit of work; it can be broken into smaller implementation tickets (e.g. core types + memo format, then `evaluatePayment`, then `buildPaymentRequest`, then the two lookup functions, then the React hook, then the default component) at the discretion of whoever picks it up.

## Comments
