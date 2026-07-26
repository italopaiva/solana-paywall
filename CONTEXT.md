# Solana Paywall

A system for gating access to content or functionality behind a Solana payment, shipped as a React package for client-side integration and a framework-agnostic lib for server-side integration.

## Language

**Client-Verified Mode**:
Access is granted entirely in the browser — the React hook confirms a payment on-chain via RPC itself and unlocks the gated resource, with no backend involved.
_Avoid_: Frontend-only mode, standalone mode

**Server-Verified Mode**:
Access is granted by a backend using the framework-agnostic lib, which independently confirms the payment on-chain and is the authority on whether access is granted.
_Avoid_: Backend mode, verified mode

**Resource**:
The specific piece of content or functionality being gated behind a payment.
_Avoid_: Content, item, asset

**Access Type**:
A resource's configuration for what a valid payment grants: Permanent Unlock or Timed Access.
_Avoid_: Access mode, plan

**Permanent Unlock**:
An access type where a single valid payment grants a wallet access to a Resource forever.
_Avoid_: Lifetime access, one-time purchase

**Timed Access**:
An access type where a valid payment grants a wallet access to a Resource for a fixed duration, locked in at the moment of payment — later changes to the Resource's configured duration never retroactively affect a purchaser who already paid.
_Avoid_: Subscription, time-limited access

**Price List**:
The set of fixed (currency, amount) pairs a Resource can be paid with, e.g. "0.05 SOL OR 5 USDC". No currency conversion or oracle is involved — each accepted currency has its own explicit price.
_Avoid_: Pricing, cost

**Receiving Wallet**:
The single Solana wallet, configured once per integration, that all payments for that integration are sent to.
_Avoid_: Merchant wallet, treasury, payout address

**Purchase Memo**:
The SPL Memo instruction attached to a payment transaction, encoding the Resource ID, Access Type, and (if Timed Access) the duration. It's what binds a plain transfer to a specific Resource and its terms.
_Avoid_: Payment metadata, memo

**Payment Lookup**:
The process of establishing whether a wallet has already paid for a Resource, either by checking one known transaction signature (the fast path right after paying) or by scanning the wallet's transaction history against the Receiving Wallet for a matching, valid Purchase Memo (the source of truth for returning visits with no cached signature).
_Avoid_: Verification, payment check
