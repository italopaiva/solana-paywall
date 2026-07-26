import "@solana/wallet-adapter-react-ui/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Missing "#root" element in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
