import { describe, expect, it } from "vitest";
import { isAccessCurrent } from "./access.js";

describe("isAccessCurrent", () => {
  it("is always current for a permanent grant", () => {
    expect(isAccessCurrent({ kind: "permanent" }, 1_700_000_000)).toBe(true);
  });

  it("is current when the expiry is in the future", () => {
    expect(
      isAccessCurrent({ kind: "timed", expiresAt: 1_700_000_100 }, 1_700_000_000),
    ).toBe(true);
  });

  it("is not current when the expiry has passed", () => {
    expect(
      isAccessCurrent({ kind: "timed", expiresAt: 1_700_000_000 }, 1_700_000_100),
    ).toBe(false);
  });
});
