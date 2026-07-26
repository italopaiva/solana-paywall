# 02 — Core payment types, memo format, and build/evaluate round-trip

**What to build:** The heart of the library (ADR-0001, ADR-0002): the domain types, the Purchase Memo format, and the two pure functions — `buildPaymentRequest` and `evaluatePayment` — that every other mode and lookup path is built on. From a developer's perspective: given a Resource with a Price List and an Access Type, you can build the instructions for a payment in any accepted currency, and given an already-fetched transaction you can determine whether it's a valid payment for that Resource and what access it grants.

**Blocked by:** 01 — Project scaffolding.

**Status:** ready-for-agent

- [ ] `Resource`, `PriceEntry` (native SOL or SPL mint + `bigint` amount), `AccessType` (`permanent` | `timed` with `durationSeconds`), `AccessGrant`, and `PaymentEvaluation` types are defined and exported from the core entry point
- [ ] `buildPaymentRequest(resource, chosenCurrency, payer, receivingWallet)` returns the correct transfer instruction (native or SPL, matching the chosen currency) plus a Purchase Memo instruction encoding the Resource ID and Access Type (and duration, if timed) — pure, no RPC calls
- [ ] `evaluatePayment(transaction, resource, receivingWallet)` correctly validates: destination matches Receiving Wallet, currency matches a Price List entry, amount is at least that entry's price (overpayment valid, underpayment invalid), and the memo is present, well-formed, and references this Resource's ID — pure, no RPC calls
- [ ] A valid Permanent Unlock payment evaluates to `{ kind: "permanent" }`
- [ ] A valid Timed Access payment evaluates to `{ kind: "timed", expiresAt }`, where `expiresAt` is computed from the transaction's block time plus the duration recorded in the memo — not the Resource's current configured duration
- [ ] Round-trip: a request built by `buildPaymentRequest`, turned into a fake transaction, evaluates via `evaluatePayment` to the expected `AccessGrant`, for both SOL and SPL currencies
- [ ] Rejection cases covered: wrong receiving wallet, wrong currency, underpayment, missing memo, malformed memo, memo referencing a different Resource ID
- [ ] One test locks the literal memo wire format so an accidental breaking change to the encoding is caught
