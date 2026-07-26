# No custom on-chain program for payment verification

Payments are verified as plain SOL/SPL transfers to a single configured Receiving Wallet, carrying an SPL Memo instruction that encodes the Resource ID, Access Type, and duration (if timed). Whether a wallet has paid is established by checking a known transaction signature, or by scanning the wallet's transaction history against the Receiving Wallet for a matching, sufficient (amount ≥ price) transfer with a valid memo — there is no Anchor/Pinocchio program tracking purchases in a PDA.

We considered a custom program (canonical on-chain state per wallet/resource, single account fetch instead of a history scan, room for refunds/admin revoke) but rejected it for the initial system: it adds deployment, audit, and upgrade risk to a library meant to be dropped into someone else's app with no on-chain footprint of its own. Memo-based verification is directly checkable via public RPC calls, requires the integrator to run nothing beyond configuring a wallet, and keeps the "extensible to more SPL tokens" goal cheap (a token is just another registered mint + price, not a program change).

A custom program remains a plausible future extension (e.g. for refunds or admin-revoked access) but is out of scope until on-chain state is genuinely needed.
