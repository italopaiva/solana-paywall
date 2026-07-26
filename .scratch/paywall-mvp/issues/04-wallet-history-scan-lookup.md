# 04 — Wallet history scan lookup (Payment Lookup)

**What to build:** The source-of-truth lookup for "has this wallet already paid for this Resource," used on a returning visit with no cached signature — the Payment Lookup from `CONTEXT.md`. From a developer's perspective: hand over a payer's wallet address and a Resource, get back the first valid matching payment found in that wallet's history against the Receiving Wallet, or a clear "none found."

**Blocked by:** 02 — Core payment types, memo format, and build/evaluate round-trip.

**Status:** ready-for-agent

- [ ] `findPaymentForResource(payerWallet, resource, receivingWallet, fetchTransactionHistory)` fetches candidate transactions via the injected `fetchTransactionHistory` adapter and runs each through `evaluatePayment` until a valid match is found
- [ ] `fetchTransactionHistory` is a plain injectable function parameter — no bundled `Connection` object inside this function
- [ ] Returns the first valid match; correctly reports "no valid payment found" when none of the candidates evaluate as valid
- [ ] Tested with a fake `fetchTransactionHistory` returning a canned list of candidate transactions (mix of valid, invalid, and irrelevant entries) — no real or mocked RPC `Connection` involved
