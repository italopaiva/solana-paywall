/**
 * A currency accepted for payment: native SOL, or an SPL token identified by
 * its mint. `decimals` on the SPL variant isn't optional bookkeeping — SPL
 * transferChecked instructions require it to build and to verify a transfer.
 */
export type Currency =
  | { kind: "native" }
  | { kind: "spl"; mint: string; decimals: number };

/** A fixed price in one accepted currency, in that currency's smallest unit. */
export type PriceEntry = {
  currency: Currency;
  amount: bigint;
};

/** What a valid payment grants: forever, or for a fixed duration from the moment of payment. */
export type AccessType =
  | { kind: "permanent" }
  | { kind: "timed"; durationSeconds: number };

/** The thing being gated behind a payment. */
export type Resource = {
  id: string;
  accessType: AccessType;
  priceList: PriceEntry[];
};

/** The result of a valid payment: what access the payer now has. */
export type AccessGrant =
  | { kind: "permanent" }
  | { kind: "timed"; expiresAt: number };

export type PaymentRejectionReason =
  | "wrong-receiving-wallet"
  | "unsupported-currency"
  | "insufficient-amount"
  | "missing-memo"
  | "malformed-memo"
  | "resource-mismatch"
  | "transaction-not-found"
  | "no-matching-payment-found";

export type PaymentEvaluation =
  | {
      valid: true;
      /**
       * The PriceEntry the payment matched. Only present when this evaluation
       * came from a fresh on-chain check (evaluatePayment, resolvePaymentBySignature,
       * findPaymentForResource) — a cache hit from a PaymentRecordStore-backed
       * lookup returns the previously-established grant without re-deriving
       * which price it was originally paid against.
       */
      matchedPrice?: PriceEntry;
      grant: AccessGrant;
    }
  | { valid: false; reason: PaymentRejectionReason };

/**
 * Optional, Server-Verified-Mode-only cache of access records, keyed by
 * payer wallet + Resource ID, so repeated checks can skip re-scanning on-chain
 * history. No concrete implementation ships — integrators back this with their
 * own database.
 */
export type PaymentRecordStore = {
  get(payerWallet: string, resourceId: string): Promise<AccessGrant | null>;
  set(payerWallet: string, resourceId: string, grant: AccessGrant): Promise<void>;
};

/**
 * The normalized shape of a transfer transaction, already fetched and parsed by the caller.
 * evaluatePayment never fetches or parses RPC data itself.
 */
export type ObservedTransfer = {
  /** Wallet address the transfer was ultimately sent to. */
  destination: string;
  currency: Currency;
  amount: bigint;
  memo: string | null;
  /** Unix seconds; used as the payment timestamp for Timed Access. */
  blockTime: number;
};
