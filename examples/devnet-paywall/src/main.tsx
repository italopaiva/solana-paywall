import "@solana/wallet-adapter-react-ui/styles.css";
import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

// @solana/web3.js expects Node's Buffer as a global in the browser.
globalThis.Buffer = globalThis.Buffer ?? Buffer;

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Missing "#root" element in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
