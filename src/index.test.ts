import { describe, expect, it } from "vitest";
import { buildPaymentRequest, evaluatePayment } from "./index.js";

describe("package entry point", () => {
  it("exposes buildPaymentRequest and evaluatePayment", () => {
    expect(typeof buildPaymentRequest).toBe("function");
    expect(typeof evaluatePayment).toBe("function");
  });
});
