import type { AccessGrant } from "./types.js";

/** Whether an AccessGrant is still active at `nowSeconds` — permanent grants always are. */
export function isAccessCurrent(grant: AccessGrant, nowSeconds: number): boolean {
  return grant.kind === "permanent" || grant.expiresAt > nowSeconds;
}
