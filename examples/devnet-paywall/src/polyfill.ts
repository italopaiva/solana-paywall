import { Buffer } from "buffer";

// Must run before anything that transitively imports @solana/web3.js or its
// dependents (which assume Buffer is already a global) — loaded from its own
// <script> tag in index.html, before main.tsx's, so this module's own import
// of "buffer" resolves and runs first, ahead of the app's module graph.
globalThis.Buffer = globalThis.Buffer ?? Buffer;
