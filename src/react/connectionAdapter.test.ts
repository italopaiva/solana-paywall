import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { address } from "@solana/kit";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { parseObservedTransfer } from "./connectionAdapter.js";

type FetchedTx = NonNullable<Parameters<typeof parseObservedTransfer>[0]>;

function randomAddress(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bs58.encode(bytes);
}

const receivingWallet = randomAddress();
const payerWallet = randomAddress();
const usdcMint = randomAddress();

const MEMO_PROGRAM_ADDRESS = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
const TOKEN_PROGRAM_ID = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function nativeTransferTx(overrides: { destination?: string; memoText?: string | null } = {}): FetchedTx {
  const instructions: object[] = [
    {
      program: "system",
      programId: SYSTEM_PROGRAM_ADDRESS,
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
      programId: MEMO_PROGRAM_ADDRESS,
      parsed: overrides.memoText ?? "spw1:article-1:p",
    });
  }

  return {
    blockTime: 1_700_000_000n,
    meta: { err: null },
    transaction: {
      signatures: ["sig"],
      message: { instructions },
    },
  } as unknown as FetchedTx;
}

async function splTransferTx(): Promise<FetchedTx> {
  const [source] = await findAssociatedTokenPda({
    owner: address(payerWallet),
    mint: address(usdcMint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destination] = await findAssociatedTokenPda({
    owner: address(receivingWallet),
    mint: address(usdcMint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return {
    blockTime: 1_700_000_000n,
    meta: { err: null },
    transaction: {
      signatures: ["sig"],
      message: {
        instructions: [
          {
            program: "spl-token",
            programId: TOKEN_PROGRAM_ID,
            parsed: {
              type: "transferChecked",
              info: {
                source,
                destination,
                mint: usdcMint,
                tokenAmount: { amount: "5000000", decimals: 6 },
              },
            },
          },
          {
            program: "spl-memo",
            programId: MEMO_PROGRAM_ADDRESS,
            parsed: "spw1:premium-feed:t:604800",
          },
        ],
      },
    },
  } as unknown as FetchedTx;
}

describe("parseObservedTransfer", () => {
  it("normalizes a native SOL transfer with a memo", async () => {
    const observed = await parseObservedTransfer(nativeTransferTx(), receivingWallet);

    expect(observed).toEqual({
      signature: "sig",
      destination: receivingWallet,
      currency: { kind: "native" },
      amount: 50_000_000n,
      memo: "spw1:article-1:p",
      blockTime: 1_700_000_000,
    });
  });

  it("normalizes an SPL transferChecked transfer, resolving the ATA to the receiving wallet", async () => {
    const observed = await parseObservedTransfer(await splTransferTx(), receivingWallet);

    expect(observed).toEqual({
      signature: "sig",
      destination: receivingWallet,
      currency: { kind: "spl", mint: usdcMint, decimals: 6 },
      amount: 5_000_000n,
      memo: "spw1:premium-feed:t:604800",
      blockTime: 1_700_000_000,
    });
  });

  it("passes through a non-matching destination unresolved, so evaluatePayment rejects it", async () => {
    const otherWallet = randomAddress();
    const observed = await parseObservedTransfer(
      nativeTransferTx({ destination: otherWallet }),
      receivingWallet,
    );

    expect(observed?.destination).toBe(otherWallet);
    expect(observed?.destination).not.toBe(receivingWallet);
  });

  it("returns null for a failed transaction", async () => {
    const tx = nativeTransferTx();
    const failed = { ...tx, meta: { ...tx.meta!, err: { InstructionError: [0, "Custom"] } } };
    expect(await parseObservedTransfer(failed, receivingWallet)).toBeNull();
  });

  it("returns null when the transaction is missing", async () => {
    expect(await parseObservedTransfer(null, receivingWallet)).toBeNull();
  });

  it("returns null when there is no recognizable transfer instruction", async () => {
    const tx = nativeTransferTx();
    const noTransfer = {
      ...tx,
      transaction: {
        ...tx.transaction,
        message: { ...tx.transaction.message, instructions: [] },
      },
    };
    expect(await parseObservedTransfer(noTransfer, receivingWallet)).toBeNull();
  });

  it("reports a missing memo as null, not a throw", async () => {
    const observed = await parseObservedTransfer(
      nativeTransferTx({ memoText: null }),
      receivingWallet,
    );
    expect(observed?.memo).toBeNull();
  });
});
