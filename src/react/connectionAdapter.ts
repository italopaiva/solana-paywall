import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MEMO_PROGRAM_ID } from "@solana/spl-memo";
import {
  PublicKey,
  type Connection,
  type ParsedInstruction,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { FetchTransaction, FetchTransactionHistory } from "../lookup.js";
import type { Currency, ObservedTransfer } from "../types.js";

type ExtractedTransfer = {
  source: string;
  destination: string;
  currency: Currency;
  amount: bigint;
};

function isParsedInstruction(
  instruction: ParsedInstruction | PartiallyDecodedInstruction,
): instruction is ParsedInstruction {
  return "parsed" in instruction;
}

function extractMemo(
  instructions: (ParsedInstruction | PartiallyDecodedInstruction)[],
): string | null {
  for (const instruction of instructions) {
    if (isParsedInstruction(instruction)) {
      if (instruction.program === "spl-memo" && typeof instruction.parsed === "string") {
        return instruction.parsed;
      }
      continue;
    }
    if (instruction.programId.equals(MEMO_PROGRAM_ID)) {
      try {
        return Buffer.from(bs58.decode(instruction.data)).toString("utf-8");
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractTransfer(
  instructions: (ParsedInstruction | PartiallyDecodedInstruction)[],
): ExtractedTransfer | null {
  for (const instruction of instructions) {
    if (!isParsedInstruction(instruction)) {
      continue;
    }

    if (instruction.program === "system" && instruction.parsed?.type === "transfer") {
      const info = instruction.parsed.info as {
        source: string;
        destination: string;
        lamports: number;
      };
      return {
        source: info.source,
        destination: info.destination,
        currency: { kind: "native" },
        amount: BigInt(info.lamports),
      };
    }

    if (
      instruction.program === "spl-token" &&
      instruction.parsed?.type === "transferChecked"
    ) {
      const info = instruction.parsed.info as {
        source: string;
        destination: string;
        mint: string;
        tokenAmount: { amount: string; decimals: number };
      };
      return {
        source: info.source,
        destination: info.destination,
        currency: {
          kind: "spl",
          mint: info.mint,
          decimals: info.tokenAmount.decimals,
        },
        amount: BigInt(info.tokenAmount.amount),
      };
    }
  }
  return null;
}

/** Whether `accountAddress` (a wallet, for native; a token account, for SPL) belongs to `wallet`. */
function resolvesToWallet(
  accountAddress: string,
  wallet: string,
  currency: Currency,
): boolean {
  if (currency.kind === "native") {
    return accountAddress === wallet;
  }
  const expectedAta = getAssociatedTokenAddressSync(
    new PublicKey(currency.mint),
    new PublicKey(wallet),
  );
  return accountAddress === expectedAta.toBase58();
}

/**
 * Pure: normalizes a parsed RPC transaction into an ObservedTransfer.
 * Returns null if the transaction is missing, failed, or contains no recognizable
 * SOL/SPL transfer instruction — it does not itself judge whether the transfer
 * went to the right wallet; evaluatePayment does that.
 */
export function parseObservedTransfer(
  tx: ParsedTransactionWithMeta | null,
  receivingWallet: string,
): ObservedTransfer | null {
  if (!tx || !tx.meta || tx.meta.err || tx.blockTime == null) {
    return null;
  }

  const extracted = extractTransfer(tx.transaction.message.instructions);
  if (!extracted) {
    return null;
  }

  const destination = resolvesToWallet(
    extracted.destination,
    receivingWallet,
    extracted.currency,
  )
    ? receivingWallet
    : extracted.destination;

  return {
    destination,
    currency: extracted.currency,
    amount: extracted.amount,
    memo: extractMemo(tx.transaction.message.instructions),
    blockTime: tx.blockTime,
  };
}

/**
 * Builds real fetchTransaction/fetchTransactionHistory adapters backed by an
 * @solana/web3.js Connection, for Client-Verified Mode's usePaywall hook.
 */
export function createConnectionAdapter(
  connection: Connection,
  receivingWallet: string,
): {
  fetchTransaction: FetchTransaction;
  fetchTransactionHistory: FetchTransactionHistory;
} {
  const fetchTransaction: FetchTransaction = async (signature) => {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    return parseObservedTransfer(tx, receivingWallet);
  };

  const fetchTransactionHistory: FetchTransactionHistory = async (
    payerWallet,
    resolvedReceivingWallet,
  ) => {
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(resolvedReceivingWallet),
      { limit: 1000 },
    );

    const transfers: ObservedTransfer[] = [];
    for (const { signature } of signatures) {
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx || !tx.meta || tx.meta.err || tx.blockTime == null) {
        continue;
      }

      const extracted = extractTransfer(tx.transaction.message.instructions);
      if (!extracted) {
        continue;
      }
      if (!resolvesToWallet(extracted.source, payerWallet, extracted.currency)) {
        continue;
      }
      if (
        !resolvesToWallet(extracted.destination, resolvedReceivingWallet, extracted.currency)
      ) {
        continue;
      }

      transfers.push({
        destination: resolvedReceivingWallet,
        currency: extracted.currency,
        amount: extracted.amount,
        memo: extractMemo(tx.transaction.message.instructions),
        blockTime: tx.blockTime,
      });
    }

    return transfers;
  };

  return { fetchTransaction, fetchTransactionHistory };
}
