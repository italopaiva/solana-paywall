import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { isAccessCurrent } from "../access.js";
import { findPaymentForResource, resolvePaymentBySignature } from "../lookup.js";
import { buildPaymentRequest } from "../payment.js";
import type { AccessGrant, Currency, PaymentEvaluation, Resource } from "../types.js";
import { createConnectionAdapter } from "./connectionAdapter.js";

export type PaywallAccessState =
  | { status: "loading" }
  | { status: "not-paid" }
  | { status: "granted"; grant: AccessGrant }
  | { status: "error"; message: string };

export type UsePaywallOptions = {
  /** Caller-provided RPC connection — this hook never constructs its own. */
  connection: Connection;
  receivingWallet: string;
};

export type UsePaywallResult = {
  access: PaywallAccessState;
  isPaying: boolean;
  pay: (currency: Currency) => Promise<void>;
};

function signatureCacheKey(payerWallet: string, resourceId: string): string {
  return `solana-paywall:${payerWallet}:${resourceId}`;
}

function readCachedSignature(payerWallet: string, resourceId: string): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(signatureCacheKey(payerWallet, resourceId));
}

function writeCachedSignature(
  payerWallet: string,
  resourceId: string,
  signature: string,
): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(signatureCacheKey(payerWallet, resourceId), signature);
}

/** A valid evaluation only counts as "granted" if the resulting access is still current. */
function toAccessState(evaluation: PaymentEvaluation): PaywallAccessState {
  if (evaluation.valid && isAccessCurrent(evaluation.grant, Math.floor(Date.now() / 1000))) {
    return { status: "granted", grant: evaluation.grant };
  }
  return { status: "not-paid" };
}

/**
 * Client-Verified Mode, end-to-end: no backend involved. Per ADR-0002, this
 * hook's unlock decision is never authoritative for anything the client itself
 * shouldn't already be able to see — use Server-Verified Mode (the core lib,
 * from your own backend) for anything gating a real secret or server response.
 *
 * There is deliberately no PaymentRecordStore option here: the browser has
 * nowhere durable to cache a lookup, so this hook always falls back to an
 * on-chain Payment Lookup (or the cached-signature fast path). Store-backed
 * caching (findPaymentForResourceWithCache / resolvePaymentBySignatureWithCache)
 * is Server-Verified-Mode-only.
 */
export function usePaywall(
  resource: Resource,
  options: UsePaywallOptions,
): UsePaywallResult {
  const { publicKey, sendTransaction } = useWallet();
  const [access, setAccess] = useState<PaywallAccessState>({ status: "loading" });
  const [isPaying, setIsPaying] = useState(false);

  const adapter = useMemo(
    () => createConnectionAdapter(options.connection, options.receivingWallet),
    [options.connection, options.receivingWallet],
  );

  const payerWallet = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!payerWallet) {
      setAccess({ status: "not-paid" });
      return;
    }

    let cancelled = false;
    setAccess({ status: "loading" });

    (async () => {
      const cachedSignature = readCachedSignature(payerWallet, resource.id);

      const evaluation = cachedSignature
        ? await resolvePaymentBySignature(
            cachedSignature,
            resource,
            options.receivingWallet,
            adapter.fetchTransaction,
          )
        : await findPaymentForResource(
            payerWallet,
            resource,
            options.receivingWallet,
            adapter.fetchTransactionHistory,
          );

      if (cancelled) {
        return;
      }

      setAccess(toAccessState(evaluation));
    })().catch((error: unknown) => {
      if (!cancelled) {
        setAccess({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    return () => {
      cancelled = true;
    };
    // `resource` is intentionally read from the closure rather than listed here:
    // a Resource's identity is its id (see CONTEXT.md), so depending on the
    // whole object would re-run this effect — re-fetching or re-scanning on
    // every render — whenever a caller passes an inline Resource literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payerWallet, resource.id, options.receivingWallet, adapter]);

  const pay = useCallback(
    async (currency: Currency) => {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      setIsPaying(true);
      try {
        const request = buildPaymentRequest({
          resource,
          currency,
          payer: publicKey.toBase58(),
          receivingWallet: options.receivingWallet,
        });

        const { blockhash, lastValidBlockHeight } =
          await options.connection.getLatestBlockhash();
        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash,
          lastValidBlockHeight,
        }).add(...request.instructions);

        const signature = await sendTransaction(transaction, options.connection);
        await options.connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        writeCachedSignature(publicKey.toBase58(), resource.id, signature);

        const evaluation = await resolvePaymentBySignature(
          signature,
          resource,
          options.receivingWallet,
          adapter.fetchTransaction,
        );

        if (evaluation.valid) {
          setAccess(toAccessState(evaluation));
        } else {
          setAccess({
            status: "error",
            message: `Payment sent but did not verify: ${evaluation.reason}`,
          });
        }
      } finally {
        setIsPaying(false);
      }
    },
    [
      publicKey,
      resource,
      options.receivingWallet,
      options.connection,
      sendTransaction,
      adapter,
    ],
  );

  return { access, isPaying, pay };
}
