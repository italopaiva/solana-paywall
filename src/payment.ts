import { getAddMemoInstruction } from "@solana-program/memo";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  createNoopSigner,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
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
  /**
   * The paying wallet. A plain address (Server-Verified Mode building a
   * request with no live wallet yet, or any caller who'll attach signing
   * separately) gets a noop placeholder signer, which produces no real
   * signature — pass the actual TransactionSigner (e.g. from a connected
   * wallet) when you intend to sign and send immediately.
   */
  payer: string | TransactionSigner;
  receivingWallet: string;
};

export type PaymentRequest = {
  instructions: Instruction[];
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

async function buildTransferInstruction(
  currency: Currency,
  amount: bigint,
  payerSigner: TransactionSigner,
  receivingWallet: Address,
): Promise<Instruction> {
  if (currency.kind === "native") {
    return getTransferSolInstruction({
      source: payerSigner,
      destination: receivingWallet,
      amount,
    });
  }

  const mint = address(currency.mint);
  const [source] = await findAssociatedTokenPda({
    owner: payerSigner.address,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destination] = await findAssociatedTokenPda({
    owner: receivingWallet,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return getTransferCheckedInstruction({
    source,
    mint,
    destination,
    authority: payerSigner,
    amount,
    decimals: currency.decimals,
  });
}

/**
 * Builds the transfer + Purchase Memo instructions for paying for a Resource.
 * Pure — makes no RPC calls and does not send anything. Async only because
 * deriving an SPL associated-token-account address uses @solana/kit's
 * (browser-native, WebCrypto-backed) address derivation, which is async.
 */
export async function buildPaymentRequest(
  input: BuildPaymentRequestInput,
): Promise<PaymentRequest> {
  const priceEntry = findPriceEntry(input.resource.priceList, input.currency);
  if (!priceEntry) {
    throw new Error(
      `Resource "${input.resource.id}" does not accept the requested currency`,
    );
  }

  const payerSigner =
    typeof input.payer === "string" ? createNoopSigner(address(input.payer)) : input.payer;
  const receivingWallet = address(input.receivingWallet);

  const transferInstruction = await buildTransferInstruction(
    input.currency,
    priceEntry.amount,
    payerSigner,
    receivingWallet,
  );

  const memoInstruction = getAddMemoInstruction({
    memo: encodePurchaseMemo(input.resource.id, input.resource.accessType),
  });

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
