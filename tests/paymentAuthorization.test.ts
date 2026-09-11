import { beforeAll, describe, expect, it } from "vitest";
import { transferOperationHash } from "../src/services/paymentAuthorizationService.js";

beforeAll(() => {
  process.env.PAYMENT_AUTHORIZATION_HMAC_KEY = "test-key-that-is-longer-than-thirty-two-characters";
});

describe("payment authorization binding", () => {
  const base = {
    recipient: "user@example.com",
    amount: 500,
    reference: "invoice 10",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("is stable for the same normalized operation", () => {
    expect(transferOperationHash(base)).toBe(
      transferOperationHash({ ...base, recipient: " USER@EXAMPLE.COM " })
    );
  });

  it("changes when the amount changes", () => {
    expect(transferOperationHash(base)).not.toBe(
      transferOperationHash({ ...base, amount: 501 })
    );
  });
});
