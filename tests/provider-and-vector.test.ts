import { beforeAll, describe, expect, it } from "vitest";
import { MockComplianceScreeningProvider } from "../src/modules/ekyc/compliance/screening.js";
import { InMemoryFaceVectorStore } from "../src/modules/ekyc/vector/InMemoryFaceVectorStore.js";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.EKYC_LOOKUP_HMAC_KEY = "unit-test-lookup-key-with-at-least-32-characters";
});

describe("mock compliance screening", () => {
  it("keeps local negative scenarios deterministic", async () => {
    const provider = new MockComplianceScreeningProvider();
    const result = await provider.screen({
      name: "Test Sanctions Person",
      dateOfBirth: "1990-01-01",
      correlationId: "test-correlation",
    });
    expect(result.sanctionsPotentialMatch).toBe(true);
    expect(result.pepOrIpPotentialMatch).toBe(false);
  });
});

describe("development face-vector store", () => {
  it("finds and removes deterministic duplicate templates", async () => {
    const store = new InMemoryFaceVectorStore();
    await store.saveVerifiedTemplate("507f1f77bcf86cd799439011", "verification-1", [1, 0, 0]);
    const duplicate = await store.findDuplicate([0.99, 0.01, 0], 0.98);
    expect(duplicate?.score).toBeGreaterThan(0.98);
    await store.removeVerifiedTemplate("verification-1");
    expect(await store.findDuplicate([1, 0, 0], 0.98)).toBeNull();
  });
});
