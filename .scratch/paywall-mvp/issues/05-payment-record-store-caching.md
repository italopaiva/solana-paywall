# 05 — Optional PaymentRecordStore caching for Server-Verified Mode

**What to build:** An optional caching layer for backend integrators (Server-Verified Mode only) so repeated access checks for the same wallet/Resource don't re-scan on-chain history every time. From a developer's perspective: implement a small store interface over your own database, pass it in alongside the existing lookup functions, and get cache-hit-skips-RPC / cache-miss-then-populate behavior for free.

**Blocked by:** 03 — Signature fast-path lookup, 04 — Wallet history scan lookup.

**Status:** ready-for-agent

- [ ] `PaymentRecordStore` interface defined (get/set access records keyed by wallet + Resource ID) and exported from the core entry point
- [ ] No concrete store implementation ships — interface only, per the spec's out-of-scope note
- [ ] Wiring so that when a `PaymentRecordStore` is supplied, a cache hit short-circuits before `fetchTransaction`/`fetchTransactionHistory` is called
- [ ] Wiring so that a fresh valid lookup (via either 03 or 04) writes the resulting `AccessGrant` to the store
- [ ] This caching layer is opt-in and Server-Verified-Mode-only — it does not change the behavior of `resolvePaymentBySignature` or `findPaymentForResource` when no store is supplied
- [ ] Tested against an in-memory fake `PaymentRecordStore`: demonstrates a cache-hit path that never calls the RPC adapter, and a cache-miss path that does call it and then populates the store
