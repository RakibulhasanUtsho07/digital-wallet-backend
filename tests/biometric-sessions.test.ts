import { beforeAll, describe, expect, it } from "vitest";
import { createRandomLivenessSequence } from "../src/modules/ekyc/biometrics/activeLivenessService.js";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.EKYC_LOOKUP_HMAC_KEY = "unit-test-lookup-key-with-at-least-32-characters";
  process.env.EKYC_RATE_LIMIT_HMAC_KEY = "unit-test-rate-limit-key-with-at-least-32-characters";
});

describe("active-liveness challenge generation", () => {
  it("issues every required action exactly once", () => {
    const sequence = createRandomLivenessSequence(() => 0);
    expect(sequence).toHaveLength(3);
    expect(new Set(sequence)).toEqual(new Set(["BLINK", "TURN_LEFT", "TURN_RIGHT"]));
  });
});

