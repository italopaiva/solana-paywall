import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { parseObservedTransfer } from "./connectionAdapter.js";

const receivingWallet = Keypair.generate().publicKey.toBase58();
const payerWallet = Keypair.generate().publicKey.toBase58();
const usdcMint = Keypair.generate().publicKey.toBase58();

function nativeTransferTx(
  overrides: { destination?: string; memoText?: string | null } = {},
): ParsedTransactionWithMeta {
  const instructions: ParsedTransactionWithMeta["transaction"]["message"]["instructions"] =
    [
      {
        program: "system",
        programId: new PublicKey("11111111111111111111111111111111"),
        parsed: {
          type: "transfer",
          info: {
            source: payerWallet,
            destination: overrides.destination ?? receivingWallet,
            lamports: 50_000_000,
          },
        },
      },
    ];

  if (overrides.memoText !== null) {
    instructions.push({
      program: "spl-memo",
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      parsed: overrides.memoText ?? "spw1:article-1:p",
    });
  }

  return {
    slot: 1,
    blockTime: 1_700_000_000,
    meta: {
      fee: 5000,
      preBalances: [],
      postBalances: [],
      err: null,
    },
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [],
        recentBlockhash: "blockhash",
        instructions,
      },
    },
  } as unknown as ParsedTransactionWithMeta;
}

function splTransferTx(): ParsedTransactionWithMeta {
  return {
    slot: 1,
    blockTime: 1_700_000_000,
    meta: {
      fee: 5000,
      preBalances: [],
      postBalances: [],
      err: null,
    },
    transaction: {
      signatures: ["sig"],
      message: {
        accountKeys: [],
        recentBlockhash: "blockhash",
        instructions: [
          {
            program: "spl-token",
            programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            parsed: {
              type: "transferChecked",
              info: {
                source: getAssociatedTokenAddressSync(
                  new PublicKey(usdcMint),
                  new PublicKey(payerWallet),
                ).toBase58(),
                destination: getAssociatedTokenAddressSync(
                  new PublicKey(usdcMint),
                  new PublicKey(receivingWallet),
                ).toBase58(),
                mint: usdcMint,
                tokenAmount: { amount: "5000000", decimals: 6 },
              },
            },
          },
          {
            program: "spl-memo",
            programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
            parsed: "spw1:premium-feed:t:604800",
          },
        ],
      },
    },
  } as unknown as ParsedTransactionWithMeta;
}

describe("parseObservedTransfer", () => {
  it("normalizes a native SOL transfer with a memo", () => {
    const observed = parseObservedTransfer(nativeTransferTx(), receivingWallet);

    expect(observed).toEqual({
      destination: receivingWallet,
      currency: { kind: "native" },
      amount: 50_000_000n,
      memo: "spw1:article-1:p",
      blockTime: 1_700_000_000,
    });
  });

  it("normalizes an SPL transferChecked transfer, resolving the ATA to the receiving wallet", () => {
    const observed = parseObservedTransfer(splTransferTx(), receivingWallet);

    expect(observed).toEqual({
      destination: receivingWallet,
      currency: { kind: "spl", mint: usdcMint, decimals: 6 },
      amount: 5_000_000n,
      memo: "spw1:premium-feed:t:604800",
      blockTime: 1_700_000_000,
    });
  });

  it("passes through a non-matching destination unresolved, so evaluatePayment rejects it", () => {
    const otherWallet = Keypair.generate().publicKey.toBase58();
    const observed = parseObservedTransfer(
      nativeTransferTx({ destination: otherWallet }),
      receivingWallet,
    );

    expect(observed?.destination).toBe(otherWallet);
    expect(observed?.destination).not.toBe(receivingWallet);
  });

  it("returns null for a failed transaction", () => {
    const tx = nativeTransferTx();
    const failed = { ...tx, meta: { ...tx.meta!, err: { InstructionError: [0, "Custom"] } } };
    expect(parseObservedTransfer(failed as ParsedTransactionWithMeta, receivingWallet)).toBeNull();
  });

  it("returns null when the transaction is missing", () => {
    expect(parseObservedTransfer(null, receivingWallet)).toBeNull();
  });

  it("returns null when there is no recognizable transfer instruction", () => {
    const tx = nativeTransferTx();
    const noTransfer = {
      ...tx,
      transaction: {
        ...tx.transaction,
        message: { ...tx.transaction.message, instructions: [] },
      },
    };
    expect(
      parseObservedTransfer(noTransfer as ParsedTransactionWithMeta, receivingWallet),
    ).toBeNull();
  });

  it("reports a missing memo as null, not a throw", () => {
    const observed = parseObservedTransfer(
      nativeTransferTx({ memoText: null }),
      receivingWallet,
    );
    expect(observed?.memo).toBeNull();
  });
});
