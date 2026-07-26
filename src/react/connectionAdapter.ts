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

type ParsedCandidate = {
  signature: string;
  extracted: ExtractedTransfer;
  memo: string | null;
  blockTime: number;
};

/** Shared by parseObservedTransfer and the history scan: validity + extraction only. */
function parseCandidate(tx: ParsedTransactionWithMeta | null): ParsedCandidate | null {
  if (!tx || !tx.meta || tx.meta.err || tx.blockTime == null) {
    return null;
  }

  const signature = tx.transaction.signatures[0];
  if (!signature) {
    return null;
  }

  const extracted = extractTransfer(tx.transaction.message.instructions);
  if (!extracted) {
    return null;
  }

  return {
    signature,
    extracted,
    memo: extractMemo(tx.transaction.message.instructions),
    blockTime: tx.blockTime,
  };
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
  const candidate = parseCandidate(tx);
  if (!candidate) {
    return null;
  }

  const destination = resolvesToWallet(
    candidate.extracted.destination,
    receivingWallet,
    candidate.extracted.currency,
  )
    ? receivingWallet
    : candidate.extracted.destination;

  return {
    signature: candidate.signature,
    destination,
    currency: candidate.extracted.currency,
    amount: candidate.extracted.amount,
    memo: candidate.memo,
    blockTime: candidate.blockTime,
  };
}

const HISTORY_FETCH_BATCH_SIZE = 10;

async function fetchInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
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

    const transactions = await fetchInBatches(
      signatures,
      HISTORY_FETCH_BATCH_SIZE,
      ({ signature }) =>
        connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 }),
    );

    const transfers: ObservedTransfer[] = [];
    for (const tx of transactions) {
      const candidate = parseCandidate(tx);
      if (!candidate) {
        continue;
      }
      if (!resolvesToWallet(candidate.extracted.source, payerWallet, candidate.extracted.currency)) {
        continue;
      }
      if (
        !resolvesToWallet(
          candidate.extracted.destination,
          resolvedReceivingWallet,
          candidate.extracted.currency,
        )
      ) {
        continue;
      }

      transfers.push({
        signature: candidate.signature,
        destination: resolvedReceivingWallet,
        currency: candidate.extracted.currency,
        amount: candidate.extracted.amount,
        memo: candidate.memo,
        blockTime: candidate.blockTime,
      });
    }

    return transfers;
  };

  return { fetchTransaction, fetchTransactionHistory };
}
