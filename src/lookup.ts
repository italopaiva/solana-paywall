import { evaluatePayment } from "./payment.js";
import type { ObservedTransfer, PaymentEvaluation, Resource } from "./types.js";

/** Fetches and normalizes one transaction by signature. Returns null if not found. */
export type FetchTransaction = (
  signature: string,
) => Promise<ObservedTransfer | null>;

/**
 * Fetches and normalizes candidate transfers from `payerWallet` to `receivingWallet`,
 * most likely match first (implementation-defined order — findPaymentForResource
 * scans until a valid match is found).
 */
export type FetchTransactionHistory = (
  payerWallet: string,
  receivingWallet: string,
) => Promise<ObservedTransfer[]>;

/**
 * The fast path: confirms one specific payment right after it was sent, or one
 * a backend already knows about (e.g. via webhook or client-submitted signature).
 */
export async function resolvePaymentBySignature(
  signature: string,
  resource: Resource,
  receivingWallet: string,
  fetchTransaction: FetchTransaction,
): Promise<PaymentEvaluation> {
  const transfer = await fetchTransaction(signature);
  if (!transfer) {
    return { valid: false, reason: "transaction-not-found" };
  }

  return evaluatePayment(transfer, resource, receivingWallet);
}

/**
 * The Payment Lookup: establishes whether `payerWallet` has already paid for
 * a Resource, with no signature on hand — the source of truth for returning visits.
 */
export async function findPaymentForResource(
  payerWallet: string,
  resource: Resource,
  receivingWallet: string,
  fetchTransactionHistory: FetchTransactionHistory,
): Promise<PaymentEvaluation> {
  const candidates = await fetchTransactionHistory(payerWallet, receivingWallet);

  for (const candidate of candidates) {
    const evaluation = evaluatePayment(candidate, resource, receivingWallet);
    if (evaluation.valid) {
      return evaluation;
    }
  }

  return { valid: false, reason: "no-matching-payment-found" };
}
