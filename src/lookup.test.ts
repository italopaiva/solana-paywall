import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  findPaymentForResource,
  resolvePaymentBySignature,
  type FetchTransaction,
  type FetchTransactionHistory,
} from "./lookup.js";
import type { ObservedTransfer, Resource } from "./types.js";

const receivingWallet = Keypair.generate().publicKey.toBase58();
const payerWallet = Keypair.generate().publicKey.toBase58();
const nativeCurrency = { kind: "native" } as const;

const resource: Resource = {
  id: "article-1",
  accessType: { kind: "permanent" },
  priceList: [{ currency: nativeCurrency, amount: 50_000_000n }],
};

function validTransfer(): ObservedTransfer {
  return {
    destination: receivingWallet,
    currency: nativeCurrency,
    amount: 50_000_000n,
    memo: "spw1:article-1:p",
    blockTime: 1_700_000_000,
  };
}

function invalidTransfer(): ObservedTransfer {
  return {
    destination: receivingWallet,
    currency: nativeCurrency,
    amount: 10_000_000n,
    memo: "spw1:article-1:p",
    blockTime: 1_700_000_000,
  };
}

describe("resolvePaymentBySignature", () => {
  it("resolves a valid payment via the injected fetchTransaction adapter", async () => {
    const fetchTransaction: FetchTransaction = async (signature) => {
      expect(signature).toBe("sig-123");
      return validTransfer();
    };

    const evaluation = await resolvePaymentBySignature(
      "sig-123",
      resource,
      receivingWallet,
      fetchTransaction,
    );

    expect(evaluation).toEqual({
      valid: true,
      matchedPrice: { currency: nativeCurrency, amount: 50_000_000n },
      grant: { kind: "permanent" },
    });
  });

  it("resolves an invalid payment", async () => {
    const fetchTransaction: FetchTransaction = async () => invalidTransfer();

    const evaluation = await resolvePaymentBySignature(
      "sig-123",
      resource,
      receivingWallet,
      fetchTransaction,
    );

    expect(evaluation).toEqual({ valid: false, reason: "insufficient-amount" });
  });

  it("produces a well-defined result, not a throw, when the signature doesn't resolve", async () => {
    const fetchTransaction: FetchTransaction = async () => null;

    const evaluation = await resolvePaymentBySignature(
      "unknown-sig",
      resource,
      receivingWallet,
      fetchTransaction,
    );

    expect(evaluation).toEqual({ valid: false, reason: "transaction-not-found" });
  });
});

describe("findPaymentForResource", () => {
  it("finds the first valid match, skipping irrelevant and invalid candidates", async () => {
    const irrelevant: ObservedTransfer = {
      ...validTransfer(),
      memo: "spw1:some-other-resource:p",
    };

    const fetchTransactionHistory: FetchTransactionHistory = async (
      payer,
      receiving,
    ) => {
      expect(payer).toBe(payerWallet);
      expect(receiving).toBe(receivingWallet);
      return [irrelevant, invalidTransfer(), validTransfer()];
    };

    const evaluation = await findPaymentForResource(
      payerWallet,
      resource,
      receivingWallet,
      fetchTransactionHistory,
    );

    expect(evaluation).toEqual({
      valid: true,
      matchedPrice: { currency: nativeCurrency, amount: 50_000_000n },
      grant: { kind: "permanent" },
    });
  });

  it("reports no match found when no candidate is valid", async () => {
    const fetchTransactionHistory: FetchTransactionHistory = async () => [
      invalidTransfer(),
    ];

    const evaluation = await findPaymentForResource(
      payerWallet,
      resource,
      receivingWallet,
      fetchTransactionHistory,
    );

    expect(evaluation).toEqual({ valid: false, reason: "no-matching-payment-found" });
  });

  it("reports no match found when history is empty", async () => {
    const fetchTransactionHistory: FetchTransactionHistory = async () => [];

    const evaluation = await findPaymentForResource(
      payerWallet,
      resource,
      receivingWallet,
      fetchTransactionHistory,
    );

    expect(evaluation).toEqual({ valid: false, reason: "no-matching-payment-found" });
  });
});
