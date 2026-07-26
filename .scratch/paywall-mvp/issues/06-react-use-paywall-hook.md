# 06 — React hook (usePaywall)

**What to build:** Full Client-Verified Mode, end-to-end, as a React hook. From a developer's perspective: call `usePaywall(resource)` in a component with a connected wallet, get back access state and a pay action — no backend involved, matching ADR-0002 (Client-Verified Mode is first-class, not a stub).

**Blocked by:** 03 — Signature fast-path lookup, 04 — Wallet history scan lookup.

**Status:** ready-for-agent

- [ ] `usePaywall(resource, options)` exported from the `/react` entry point
- [ ] On mount (or wallet change), checks `localStorage` for a cached signature for this wallet + Resource ID and uses the fast path (03) if present; otherwise runs the history scan (04)
- [ ] Exposes a pay action that builds the transaction via `buildPaymentRequest`, sends it through the connected wallet, caches the resulting signature in `localStorage` on success, and re-evaluates access
- [ ] Exposes current access state (not-paid / granted permanent / granted timed with expiry / loading / error) in a form a consuming component can render against
- [ ] Takes an injected RPC connection (matching the adapter shape from 03/04) rather than constructing one itself
- [ ] Manual verification: a developer can gate a piece of UI in a real React app against a devnet Resource with only this hook, no backend — matches spec user story 1
- [ ] Documentation note (in code comments or a short doc, not a full guide) makes explicit that this mode's unlock decision is never authoritative for anything the client itself shouldn't already see, per ADR-0002
