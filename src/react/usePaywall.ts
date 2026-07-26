import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  signature as toSignature,
  type GetLatestBlockhashApi,
  type GetSignaturesForAddressApi,
  type GetSignatureStatusesApi,
  type GetTransactionApi,
  type Rpc,
  type TransactionSigner,
} from "@solana/kit";
import bs58 from "bs58";
import { isAccessCurrent } from "../access.js";
import { findPaymentForResource, resolvePaymentBySignature } from "../lookup.js";
import { buildPaymentRequest } from "../payment.js";
import type { AccessGrant, Currency, PaymentEvaluation, Resource } from "../types.js";
import { createConnectionAdapter } from "./connectionAdapter.js";

type PaywallRpc = Rpc<
  GetTransactionApi & GetSignaturesForAddressApi & GetLatestBlockhashApi & GetSignatureStatusesApi
>;

export type PaywallAccessState =
  | { status: "loading" }
  | { status: "not-paid" }
  | { status: "granted"; grant: AccessGrant }
  | { status: "error"; message: string };

export type UsePaywallOptions = {
  /** Caller-provided RPC client — this hook never constructs its own. */
  rpc: PaywallRpc;
  receivingWallet: string;
  /**
   * The connected wallet's signer, or null when no wallet is connected (or
   * it's read-only). This hook never connects a wallet itself — wire up
   * wallet discovery/connection (e.g. @solana/kit-plugin-wallet) yourself
   * and pass the resulting signer through.
   */
  signer: TransactionSigner | null;
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

const CONFIRMATION_POLL_INTERVAL_MS = 1000;
const CONFIRMATION_TIMEOUT_MS = 30_000;

/** Polls getSignatureStatuses until the transaction reaches at least "confirmed", or times out. */
async function waitForConfirmation(rpc: PaywallRpc, sig: string): Promise<void> {
  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;

  for (;;) {
    const { value: statuses } = await rpc.getSignatureStatuses([toSignature(sig)]).send();
    const status = statuses[0];

    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for transaction confirmation");
    }

    await new Promise((resolve) => setTimeout(resolve, CONFIRMATION_POLL_INTERVAL_MS));
  }
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
  const [access, setAccess] = useState<PaywallAccessState>({ status: "loading" });
  const [isPaying, setIsPaying] = useState(false);

  const adapter = useMemo(
    () => createConnectionAdapter(options.rpc, options.receivingWallet),
    [options.rpc, options.receivingWallet],
  );

  const payerWallet = options.signer?.address ?? null;

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

      // A fresh scan (no cached signature) doesn't know it should populate the
      // cache — do it here so a cleared/missing cache gets repopulated on the
      // next successful lookup, not left permanently cold.
      if (evaluation.valid && evaluation.signature) {
        writeCachedSignature(payerWallet, resource.id, evaluation.signature);
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
      const signer = options.signer;
      if (!signer) {
        throw new Error("Wallet not connected");
      }

      setIsPaying(true);
      try {
        const request = await buildPaymentRequest({
          resource,
          currency,
          payer: signer,
          receivingWallet: options.receivingWallet,
        });

        const { value: latestBlockhash } = await options.rpc.getLatestBlockhash().send();

        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayerSigner(signer, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
          (m) => appendTransactionMessageInstructions(request.instructions, m),
        );

        const signatureBytes = await signAndSendTransactionMessageWithSigners(message);
        const signature = bs58.encode(signatureBytes);

        await waitForConfirmation(options.rpc, signature);

        writeCachedSignature(signer.address, resource.id, signature);

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
    [options.signer, resource, options.receivingWallet, options.rpc, adapter],
  );

  return { access, isPaying, pay };
}
