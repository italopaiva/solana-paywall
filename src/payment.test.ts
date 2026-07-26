import { parseAddMemoInstruction } from "@solana-program/memo";
import { parseTransferSolInstruction } from "@solana-program/system";
import { findAssociatedTokenPda, parseTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  address,
  type AccountMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyUint8Array,
} from "@solana/kit";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { buildPaymentRequest, evaluatePayment } from "./payment.js";
import type { ObservedTransfer, Resource } from "./types.js";

function randomAddress(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bs58.encode(bytes);
}

type FullInstruction = Instruction &
  InstructionWithAccounts<readonly AccountMeta[]> &
  InstructionWithData<ReadonlyUint8Array>;

const payer = randomAddress();
const receivingWallet = randomAddress();
const otherWallet = randomAddress();
const usdcMint = randomAddress();

const nativeCurrency = { kind: "native" } as const;
const usdcCurrency = { kind: "spl", mint: usdcMint, decimals: 6 } as const;
const testSignature = "test-signature-1";

function decodeMemo(instruction: Instruction): string {
  return parseAddMemoInstruction(instruction as FullInstruction).data.memo;
}

describe("buildPaymentRequest", () => {
  it("builds a native SOL transfer plus a memo instruction", async () => {
    const resource: Resource = {
      id: "article-1",
      accessType: { kind: "permanent" },
      priceList: [{ currency: nativeCurrency, amount: 50_000_000n }],
    };

    const request = await buildPaymentRequest({
      resource,
      currency: nativeCurrency,
      payer,
      receivingWallet,
    });

    expect(request.instructions).toHaveLength(2);

    const transfer = parseTransferSolInstruction(request.instructions[0] as FullInstruction);
    expect(transfer.accounts.destination.address).toBe(receivingWallet);
    expect(transfer.data.amount).toBe(50_000_000n);

    expect(decodeMemo(request.instructions[1]!)).toBe("spw1:article-1:p");
  });

  it("builds an SPL transferChecked instruction for a timed resource, and locks the memo wire format", async () => {
    const resource: Resource = {
      id: "premium-feed",
      accessType: { kind: "timed", durationSeconds: 604_800 },
      priceList: [{ currency: usdcCurrency, amount: 5_000_000n }],
    };

    const request = await buildPaymentRequest({
      resource,
      currency: usdcCurrency,
      payer,
      receivingWallet,
    });

    const transferChecked = parseTransferCheckedInstruction(
      request.instructions[0] as FullInstruction,
    );
    expect(transferChecked.accounts.mint.address).toBe(usdcMint);
    expect(transferChecked.data.amount).toBe(5_000_000n);
    expect(transferChecked.data.decimals).toBe(6);

    const [expectedDestination] = await findAssociatedTokenPda({
      owner: address(receivingWallet),
      mint: address(usdcMint),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    expect(transferChecked.accounts.destination.address).toBe(expectedDestination);

    // Locks the literal wire format: version:resourceId:t:durationSeconds
    expect(decodeMemo(request.instructions[1]!)).toBe("spw1:premium-feed:t:604800");
  });

  it("throws when the resource does not accept the requested currency", async () => {
    const resource: Resource = {
      id: "article-1",
      accessType: { kind: "permanent" },
      priceList: [{ currency: nativeCurrency, amount: 50_000_000n }],
    };

    await expect(
      buildPaymentRequest({
        resource,
        currency: usdcCurrency,
        payer,
        receivingWallet,
      }),
    ).rejects.toThrow();
  });
});

describe("evaluatePayment", () => {
  const permanentResource: Resource = {
    id: "article-1",
    accessType: { kind: "permanent" },
    priceList: [
      { currency: nativeCurrency, amount: 50_000_000n },
      { currency: usdcCurrency, amount: 5_000_000n },
    ],
  };

  const timedResource: Resource = {
    id: "premium-feed",
    accessType: { kind: "timed", durationSeconds: 604_800 },
    priceList: [{ currency: usdcCurrency, amount: 5_000_000n }],
  };

  it("round-trips a native permanent payment built by buildPaymentRequest", async () => {
    const request = await buildPaymentRequest({
      resource: permanentResource,
      currency: nativeCurrency,
      payer,
      receivingWallet,
    });

    const transfer = parseTransferSolInstruction(request.instructions[0] as FullInstruction);
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: transfer.accounts.destination.address,
      currency: nativeCurrency,
      amount: transfer.data.amount,
      memo: decodeMemo(request.instructions[1]!),
      blockTime: 1_700_000_000,
    };

    const evaluation = evaluatePayment(observed, permanentResource, receivingWallet);

    expect(evaluation).toEqual({
      valid: true,
      matchedPrice: { currency: nativeCurrency, amount: 50_000_000n },
      grant: { kind: "permanent", paidAt: 1_700_000_000 },
      signature: testSignature,
    });
  });

  it("round-trips an SPL timed payment built by buildPaymentRequest, computing expiresAt from blockTime + duration", async () => {
    const request = await buildPaymentRequest({
      resource: timedResource,
      currency: usdcCurrency,
      payer,
      receivingWallet,
    });

    const transferChecked = parseTransferCheckedInstruction(
      request.instructions[0] as FullInstruction,
    );
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: usdcCurrency,
      amount: transferChecked.data.amount,
      memo: decodeMemo(request.instructions[1]!),
      blockTime: 1_700_000_000,
    };

    const evaluation = evaluatePayment(observed, timedResource, receivingWallet);

    expect(evaluation).toEqual({
      valid: true,
      matchedPrice: { currency: usdcCurrency, amount: 5_000_000n },
      grant: { kind: "timed", expiresAt: 1_700_000_000 + 604_800, paidAt: 1_700_000_000 },
      signature: testSignature,
    });
  });

  it("accepts overpayment", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: nativeCurrency,
      amount: 60_000_000n,
      memo: "spw1:article-1:p",
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: true,
      matchedPrice: { currency: nativeCurrency, amount: 50_000_000n },
      grant: { kind: "permanent", paidAt: 1_700_000_000 },
      signature: testSignature,
    });
  });

  it("rejects underpayment", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: nativeCurrency,
      amount: 40_000_000n,
      memo: "spw1:article-1:p",
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: false,
      reason: "insufficient-amount",
    });
  });

  it("rejects a payment sent to the wrong wallet", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: otherWallet,
      currency: nativeCurrency,
      amount: 50_000_000n,
      memo: "spw1:article-1:p",
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: false,
      reason: "wrong-receiving-wallet",
    });
  });

  it("rejects a currency the resource doesn't accept", () => {
    const unaccepted = { kind: "spl", mint: randomAddress(), decimals: 9 } as const;
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: unaccepted,
      amount: 50_000_000n,
      memo: "spw1:article-1:p",
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: false,
      reason: "unsupported-currency",
    });
  });

  it("rejects a missing memo", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: nativeCurrency,
      amount: 50_000_000n,
      memo: null,
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: false,
      reason: "missing-memo",
    });
  });

  it("rejects a malformed memo", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: nativeCurrency,
      amount: 50_000_000n,
      memo: "not a purchase memo",
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: false,
      reason: "malformed-memo",
    });
  });

  it("rejects a memo referencing a different resource", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: nativeCurrency,
      amount: 50_000_000n,
      memo: "spw1:some-other-article:p",
      blockTime: 1_700_000_000,
    };

    expect(evaluatePayment(observed, permanentResource, receivingWallet)).toEqual({
      valid: false,
      reason: "resource-mismatch",
    });
  });

  it("does not let a later change to a resource's configured duration affect an already-evaluated timed grant", () => {
    const observed: ObservedTransfer = {
      signature: testSignature,
      destination: receivingWallet,
      currency: usdcCurrency,
      amount: 5_000_000n,
      // Memo locked in a 7-day duration at the time of payment.
      memo: "spw1:premium-feed:t:604800",
      blockTime: 1_700_000_000,
    };

    // Resource now configured for a 1-day duration — the memo's terms still win.
    const reconfiguredResource: Resource = {
      ...timedResource,
      accessType: { kind: "timed", durationSeconds: 86_400 },
    };

    const evaluation = evaluatePayment(observed, reconfiguredResource, receivingWallet);
    expect(evaluation).toEqual({
      valid: true,
      matchedPrice: { currency: usdcCurrency, amount: 5_000_000n },
      grant: { kind: "timed", expiresAt: 1_700_000_000 + 604_800, paidAt: 1_700_000_000 },
      signature: testSignature,
    });
  });
});
