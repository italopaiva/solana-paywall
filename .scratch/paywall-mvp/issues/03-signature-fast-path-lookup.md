# 03 — Signature fast-path lookup

**What to build:** The fast path for confirming a payment you already have a signature for — used right after a payer sends their transaction, or by a backend that observed a signature via webhook or client submission. From a developer's perspective: hand over a signature and a Resource, get back the `PaymentEvaluation` for that specific transaction, without having to fetch and parse it yourself.

**Blocked by:** 02 — Core payment types, memo format, and build/evaluate round-trip.

**Status:** ready-for-agent

- [ ] `resolvePaymentBySignature(signature, resource, receivingWallet, fetchTransaction)` fetches the transaction via the injected `fetchTransaction` adapter and runs it through `evaluatePayment`
- [ ] `fetchTransaction` is a plain injectable function parameter — no bundled `Connection` object inside this function
- [ ] Tested with a fake `fetchTransaction` returning canned transaction data — valid and invalid cases both covered, no real or mocked RPC `Connection` involved
- [ ] A signature that doesn't resolve to a transaction (adapter returns nothing) produces a well-defined invalid result rather than throwing
