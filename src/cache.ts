import { isAccessCurrent } from "./access.js";
import type { FetchTransaction, FetchTransactionHistory } from "./lookup.js";
import { findPaymentForResource, resolvePaymentBySignature } from "./lookup.js";
import type { PaymentEvaluation, PaymentRecordStore, Resource } from "./types.js";

function defaultNowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function withCache(
  store: PaymentRecordStore,
  payerWallet: string,
  resource: Resource,
  nowSeconds: number,
  performLookup: () => Promise<PaymentEvaluation>,
): Promise<PaymentEvaluation> {
  const cached = await store.get(payerWallet, resource.id);
  if (cached && isAccessCurrent(cached, nowSeconds)) {
    return { valid: true, grant: cached };
  }

  const evaluation = await performLookup();
  if (evaluation.valid) {
    await store.set(payerWallet, resource.id, evaluation.grant);
  }
  return evaluation;
}

/**
 * Same as resolvePaymentBySignature, but checks the store first (skipping
 * fetchTransaction on a cache hit) and populates it on a fresh valid result.
 */
export async function resolvePaymentBySignatureWithCache(
  signature: string,
  payerWallet: string,
  resource: Resource,
  receivingWallet: string,
  fetchTransaction: FetchTransaction,
  store: PaymentRecordStore,
  nowSeconds: number = defaultNowSeconds(),
): Promise<PaymentEvaluation> {
  return withCache(store, payerWallet, resource, nowSeconds, () =>
    resolvePaymentBySignature(signature, resource, receivingWallet, fetchTransaction),
  );
}

/**
 * Same as findPaymentForResource, but checks the store first (skipping
 * fetchTransactionHistory on a cache hit) and populates it on a fresh valid result.
 */
export async function findPaymentForResourceWithCache(
  payerWallet: string,
  resource: Resource,
  receivingWallet: string,
  fetchTransactionHistory: FetchTransactionHistory,
  store: PaymentRecordStore,
  nowSeconds: number = defaultNowSeconds(),
): Promise<PaymentEvaluation> {
  return withCache(store, payerWallet, resource, nowSeconds, () =>
    findPaymentForResource(payerWallet, resource, receivingWallet, fetchTransactionHistory),
  );
}
