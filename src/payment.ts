import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createMemoInstruction } from "@solana/spl-memo";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import { encodePurchaseMemo, parsePurchaseMemo } from "./memo.js";
import type {
  AccessGrant,
  Currency,
  ObservedTransfer,
  PaymentEvaluation,
  PriceEntry,
  Resource,
} from "./types.js";

export type BuildPaymentRequestInput = {
  resource: Resource;
  currency: Currency;
  payer: string;
  receivingWallet: string;
};

export type PaymentRequest = {
  instructions: TransactionInstruction[];
};

function currencyMatches(a: Currency, b: Currency): boolean {
  if (a.kind === "native" && b.kind === "native") {
    return true;
  }
  if (a.kind === "spl" && b.kind === "spl") {
    return a.mint === b.mint;
  }
  return false;
}

function findPriceEntry(
  priceList: PriceEntry[],
  currency: Currency,
): PriceEntry | undefined {
  return priceList.find((entry) => currencyMatches(entry.currency, currency));
}

function buildTransferInstruction(
  currency: Currency,
  amount: bigint,
  payer: PublicKey,
  receivingWallet: PublicKey,
): TransactionInstruction {
  if (currency.kind === "native") {
    return SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: receivingWallet,
      lamports: amount,
    });
  }

  const mint = new PublicKey(currency.mint);
  const source = getAssociatedTokenAddressSync(mint, payer);
  const destination = getAssociatedTokenAddressSync(mint, receivingWallet);

  return createTransferCheckedInstruction(
    source,
    mint,
    destination,
    payer,
    amount,
    currency.decimals,
  );
}

/**
 * Builds the transfer + Purchase Memo instructions for paying for a Resource.
 * Pure — makes no RPC calls and does not send anything.
 */
export function buildPaymentRequest(
  input: BuildPaymentRequestInput,
): PaymentRequest {
  const priceEntry = findPriceEntry(input.resource.priceList, input.currency);
  if (!priceEntry) {
    throw new Error(
      `Resource "${input.resource.id}" does not accept the requested currency`,
    );
  }

  const payer = new PublicKey(input.payer);
  const receivingWallet = new PublicKey(input.receivingWallet);

  const transferInstruction = buildTransferInstruction(
    input.currency,
    priceEntry.amount,
    payer,
    receivingWallet,
  );

  const memoInstruction = createMemoInstruction(
    encodePurchaseMemo(input.resource.id, input.resource.accessType),
  );

  return { instructions: [transferInstruction, memoInstruction] };
}

/**
 * Validates an already-fetched transfer against a Resource's price and terms.
 * Pure — makes no RPC calls. The single seam shared by every verification path.
 */
export function evaluatePayment(
  transfer: ObservedTransfer,
  resource: Resource,
  receivingWallet: string,
): PaymentEvaluation {
  if (transfer.destination !== receivingWallet) {
    return { valid: false, reason: "wrong-receiving-wallet" };
  }

  const priceEntry = findPriceEntry(resource.priceList, transfer.currency);
  if (!priceEntry) {
    return { valid: false, reason: "unsupported-currency" };
  }

  if (transfer.amount < priceEntry.amount) {
    return { valid: false, reason: "insufficient-amount" };
  }

  if (transfer.memo === null) {
    return { valid: false, reason: "missing-memo" };
  }

  const parsedMemo = parsePurchaseMemo(transfer.memo);
  if (!parsedMemo) {
    return { valid: false, reason: "malformed-memo" };
  }

  if (parsedMemo.resourceId !== resource.id) {
    return { valid: false, reason: "resource-mismatch" };
  }

  const grant: AccessGrant =
    parsedMemo.accessType.kind === "permanent"
      ? { kind: "permanent", paidAt: transfer.blockTime }
      : {
          kind: "timed",
          expiresAt: transfer.blockTime + parsedMemo.accessType.durationSeconds,
          paidAt: transfer.blockTime,
        };

  return { valid: true, matchedPrice: priceEntry, grant, signature: transfer.signature };
}
