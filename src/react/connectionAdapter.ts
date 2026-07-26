import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  address,
  signature,
  type Address,
  type GetSignaturesForAddressApi,
  type GetTransactionApi,
  type Rpc,
} from "@solana/kit";
import bs58 from "bs58";
import type { FetchTransaction, FetchTransactionHistory } from "../lookup.js";
import type { Currency, ObservedTransfer } from "../types.js";

type PaywallRpc = Rpc<GetTransactionApi & GetSignaturesForAddressApi>;

type ParsedTransactionInstruction = Readonly<{
  parsed: { info?: object; type: string };
  program: string;
  programId: Address;
}>;

type PartiallyDecodedTransactionInstruction = Readonly<{
  accounts: readonly Address[];
  data: string;
  programId: Address;
}>;

type TransactionInstruction = ParsedTransactionInstruction | PartiallyDecodedTransactionInstruction;

type ExtractedTransfer = {
  source: string;
  destination: string;
  currency: Currency;
  amount: bigint;
};

function isParsedInstruction(
  instruction: TransactionInstruction,
): instruction is ParsedTransactionInstruction {
  return "parsed" in instruction;
}

function extractMemo(instructions: readonly TransactionInstruction[]): string | null {
  for (const instruction of instructions) {
    if (isParsedInstruction(instruction)) {
      if (instruction.program === "spl-memo" && typeof instruction.parsed === "string") {
        return instruction.parsed;
      }
      continue;
    }
    if (instruction.programId === MEMO_PROGRAM_ADDRESS) {
      try {
        return new TextDecoder().decode(bs58.decode(instruction.data));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractTransfer(
  instructions: readonly TransactionInstruction[],
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
async function resolvesToWallet(
  accountAddress: string,
  wallet: string,
  currency: Currency,
): Promise<boolean> {
  if (currency.kind === "native") {
    return accountAddress === wallet;
  }
  const [expectedAta] = await findAssociatedTokenPda({
    owner: address(wallet),
    mint: address(currency.mint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return accountAddress === expectedAta;
}

type ParsedCandidate = {
  signature: string;
  extracted: ExtractedTransfer;
  memo: string | null;
  blockTime: number;
};

type FetchedTransaction = {
  blockTime: bigint | null;
  meta: { err: unknown } | null;
  transaction: {
    signatures: readonly string[];
    message: { instructions: readonly TransactionInstruction[] };
  };
} | null;

/** Shared by parseObservedTransfer and the history scan: validity + extraction only. */
function parseCandidate(tx: FetchedTransaction): ParsedCandidate | null {
  if (!tx || !tx.meta || tx.meta.err || tx.blockTime == null) {
    return null;
  }

  const txSignature = tx.transaction.signatures[0];
  if (!txSignature) {
    return null;
  }

  const extracted = extractTransfer(tx.transaction.message.instructions);
  if (!extracted) {
    return null;
  }

  return {
    signature: txSignature,
    extracted,
    memo: extractMemo(tx.transaction.message.instructions),
    blockTime: Number(tx.blockTime),
  };
}

/**
 * Pure (no RPC calls of its own beyond ATA derivation, which is local crypto,
 * not a network call): normalizes a fetched RPC transaction into an
 * ObservedTransfer. Returns null if the transaction is missing, failed, or
 * contains no recognizable SOL/SPL transfer instruction — it does not itself
 * judge whether the transfer went to the right wallet; evaluatePayment does that.
 */
export async function parseObservedTransfer(
  tx: FetchedTransaction,
  receivingWallet: string,
): Promise<ObservedTransfer | null> {
  const candidate = parseCandidate(tx);
  if (!candidate) {
    return null;
  }

  const destination = (await resolvesToWallet(
    candidate.extracted.destination,
    receivingWallet,
    candidate.extracted.currency,
  ))
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
 * @solana/kit RPC client, for Client-Verified Mode's usePaywall hook.
 */
export function createConnectionAdapter(
  rpc: PaywallRpc,
  receivingWallet: string,
): {
  fetchTransaction: FetchTransaction;
  fetchTransactionHistory: FetchTransactionHistory;
} {
  const getParsedTransaction = (sig: string) =>
    rpc
      .getTransaction(signature(sig), { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 })
      .send() as Promise<FetchedTransaction>;

  const fetchTransaction: FetchTransaction = async (sig) => {
    const tx = await getParsedTransaction(sig);
    return parseObservedTransfer(tx, receivingWallet);
  };

  const fetchTransactionHistory: FetchTransactionHistory = async (
    payerWallet,
    resolvedReceivingWallet,
  ) => {
    const signatures = await rpc
      .getSignaturesForAddress(address(resolvedReceivingWallet), { limit: 1000 })
      .send();

    const transactions = await fetchInBatches(
      [...signatures],
      HISTORY_FETCH_BATCH_SIZE,
      ({ signature: sig }) => getParsedTransaction(sig),
    );

    const transfers: ObservedTransfer[] = [];
    for (const tx of transactions) {
      const candidate = parseCandidate(tx);
      if (!candidate) {
        continue;
      }
      if (!(await resolvesToWallet(candidate.extracted.source, payerWallet, candidate.extracted.currency))) {
        continue;
      }
      if (
        !(await resolvesToWallet(
          candidate.extracted.destination,
          resolvedReceivingWallet,
          candidate.extracted.currency,
        ))
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
