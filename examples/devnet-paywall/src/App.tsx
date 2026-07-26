import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Paywall } from "solana-paywall/react";
import { RECEIVING_WALLET, sampleResource } from "./resource.js";
import { Wallet } from "./Wallet.js";

function MissingConfig() {
  return (
    <main>
      <h1>solana-paywall — devnet example</h1>
      <p>
        Set <code>VITE_RECEIVING_WALLET</code> to a devnet wallet address you control:
      </p>
      <ol>
        <li>
          Copy <code>.env.example</code> to <code>.env.local</code>
        </li>
        <li>
          Fill in <code>VITE_RECEIVING_WALLET</code>
        </li>
        <li>
          Restart <code>npm run dev</code>
        </li>
      </ol>
      <p>See the README in this folder for the full setup walkthrough.</p>
    </main>
  );
}

function Demo() {
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();

  return (
    <main>
      <h1>solana-paywall — devnet example</h1>
      <p>
        Client-Verified Mode: everything below runs entirely in this browser tab, no
        backend involved (see ADR-0002 in the main repo).
      </p>
      <p>
        Paying to: <code>{RECEIVING_WALLET}</code>
      </p>

      <WalletMultiButton />

      {!connected || !publicKey ? (
        <p>Connect a wallet set to Devnet to continue.</p>
      ) : (
        <>
          <p>
            Connected as <code>{publicKey.toBase58()}</code>
          </p>
          <Paywall
            resource={sampleResource}
            connection={connection}
            receivingWallet={RECEIVING_WALLET}
          >
            <article>
              <h2>Unlocked!</h2>
              <p>
                This is the gated content. Your access lasts 1 hour from the moment you
                paid — reload the page and it'll still show (cached signature fast
                path), or clear localStorage and reload to see the on-chain Payment
                Lookup find it again from scratch.
              </p>
            </article>
          </Paywall>
        </>
      )}
    </main>
  );
}

export default function App() {
  if (!RECEIVING_WALLET) {
    return <MissingConfig />;
  }

  return (
    <Wallet>
      <Demo />
    </Wallet>
  );
}
