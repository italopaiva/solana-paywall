import type { AccessType } from "./types.js";

const MEMO_PREFIX = "spw1";
const DELIMITER = ":";

export type ParsedPurchaseMemo = {
  resourceId: string;
  accessType: AccessType;
};

/** Encodes a Resource ID and Access Type into the Purchase Memo wire format. */
export function encodePurchaseMemo(
  resourceId: string,
  accessType: AccessType,
): string {
  if (resourceId.length === 0 || resourceId.includes(DELIMITER)) {
    throw new Error(
      `Resource ID must be non-empty and must not contain "${DELIMITER}": ${resourceId}`,
    );
  }

  if (accessType.kind === "permanent") {
    return [MEMO_PREFIX, resourceId, "p"].join(DELIMITER);
  }

  return [MEMO_PREFIX, resourceId, "t", String(accessType.durationSeconds)].join(
    DELIMITER,
  );
}

/** Parses a Purchase Memo, or returns null if it's missing, foreign, or malformed. */
export function parsePurchaseMemo(memo: string): ParsedPurchaseMemo | null {
  const parts = memo.split(DELIMITER);

  if (parts[0] !== MEMO_PREFIX) {
    return null;
  }

  const resourceId = parts[1];
  if (!resourceId) {
    return null;
  }

  if (parts.length === 3 && parts[2] === "p") {
    return { resourceId, accessType: { kind: "permanent" } };
  }

  if (parts.length === 4 && parts[2] === "t") {
    const durationSeconds = Number(parts[3]);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return null;
    }
    return { resourceId, accessType: { kind: "timed", durationSeconds } };
  }

  return null;
}
