import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  findPaymentForResourceWithCache,
  resolvePaymentBySignatureWithCache,
} from "./cache.js";
import type {
  AccessGrant,
  FetchTransaction,
  FetchTransactionHistory,
  ObservedTransfer,
  PaymentRecordStore,
  Resource,
} from "./index.js";

const receivingWallet = Keypair.generate().publicKey.toBase58();
const payerWallet = Keypair.generate().publicKey.toBase58();
const nativeCurrency = { kind: "native" } as const;
const now = 1_700_000_000;

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
    blockTime: now,
  };
}

function createInMemoryStore(
  seed: Record<string, AccessGrant> = {},
): PaymentRecordStore & { calls: { get: number; set: number } } {
  const records = new Map(Object.entries(seed));
  const calls = { get: 0, set: 0 };
  return {
    calls,
    async get(payer, resourceId) {
      calls.get += 1;
      return records.get(`${payer}:${resourceId}`) ?? null;
    },
    async set(payer, resourceId, grant) {
      calls.set += 1;
      records.set(`${payer}:${resourceId}`, grant);
    },
  };
}

describe("findPaymentForResourceWithCache", () => {
  it("on a cache hit, never calls fetchTransactionHistory", async () => {
    const store = createInMemoryStore({
      [`${payerWallet}:article-1`]: { kind: "permanent" },
    });
    let fetchCalled = false;
    const fetchTransactionHistory: FetchTransactionHistory = async () => {
      fetchCalled = true;
      return [];
    };

    const evaluation = await findPaymentForResourceWithCache(
      payerWallet,
      resource,
      receivingWallet,
      fetchTransactionHistory,
      store,
      now,
    );

    expect(fetchCalled).toBe(false);
    expect(evaluation).toEqual({ valid: true, grant: { kind: "permanent" } });
  });

  it("on a cache miss, calls fetchTransactionHistory and populates the store", async () => {
    const store = createInMemoryStore();
    const fetchTransactionHistory: FetchTransactionHistory = async () => [
      validTransfer(),
    ];

    const evaluation = await findPaymentForResourceWithCache(
      payerWallet,
      resource,
      receivingWallet,
      fetchTransactionHistory,
      store,
      now,
    );

    expect(evaluation.valid).toBe(true);
    expect(store.calls.set).toBe(1);
    await expect(store.get(payerWallet, "article-1")).resolves.toEqual({
      kind: "permanent",
    });
  });

  it("treats an expired timed grant as a cache miss", async () => {
    const timedResource: Resource = {
      ...resource,
      accessType: { kind: "timed", durationSeconds: 3600 },
    };
    const store = createInMemoryStore({
      [`${payerWallet}:article-1`]: { kind: "timed", expiresAt: now - 1 },
    });
    let fetchCalled = false;
    const fetchTransactionHistory: FetchTransactionHistory = async () => {
      fetchCalled = true;
      return [];
    };

    await findPaymentForResourceWithCache(
      payerWallet,
      timedResource,
      receivingWallet,
      fetchTransactionHistory,
      store,
      now,
    );

    expect(fetchCalled).toBe(true);
  });

  it("does not populate the store when the fresh lookup is invalid", async () => {
    const store = createInMemoryStore();
    const fetchTransactionHistory: FetchTransactionHistory = async () => [];

    const evaluation = await findPaymentForResourceWithCache(
      payerWallet,
      resource,
      receivingWallet,
      fetchTransactionHistory,
      store,
      now,
    );

    expect(evaluation.valid).toBe(false);
    expect(store.calls.set).toBe(0);
  });
});

describe("resolvePaymentBySignatureWithCache", () => {
  it("on a cache hit, never calls fetchTransaction", async () => {
    const store = createInMemoryStore({
      [`${payerWallet}:article-1`]: { kind: "permanent" },
    });
    let fetchCalled = false;
    const fetchTransaction: FetchTransaction = async () => {
      fetchCalled = true;
      return null;
    };

    const evaluation = await resolvePaymentBySignatureWithCache(
      "sig-123",
      payerWallet,
      resource,
      receivingWallet,
      fetchTransaction,
      store,
      now,
    );

    expect(fetchCalled).toBe(false);
    expect(evaluation).toEqual({ valid: true, grant: { kind: "permanent" } });
  });

  it("on a cache miss, calls fetchTransaction and populates the store", async () => {
    const store = createInMemoryStore();
    const fetchTransaction: FetchTransaction = async () => validTransfer();

    const evaluation = await resolvePaymentBySignatureWithCache(
      "sig-123",
      payerWallet,
      resource,
      receivingWallet,
      fetchTransaction,
      store,
      now,
    );

    expect(evaluation.valid).toBe(true);
    expect(store.calls.set).toBe(1);
  });
});
