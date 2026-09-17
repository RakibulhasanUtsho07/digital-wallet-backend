import type { Redis } from "ioredis";
import { beforeAll, describe, expect, it } from "vitest";
import { createRandomLivenessSequence } from "../src/modules/ekyc/biometrics/activeLivenessService.js";
import {
  MockFingerprintError,
  MockFingerprintService,
} from "../src/modules/ekyc/biometrics/mockFingerprintService.js";
import { MockECProvider } from "../src/modules/ekyc/providers/MockECProvider.js";
import type { ProviderVerificationRequest } from "../src/modules/ekyc/types.js";

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.EKYC_LOOKUP_HMAC_KEY = "unit-test-lookup-key-with-at-least-32-characters";
  process.env.EKYC_RATE_LIMIT_HMAC_KEY = "unit-test-rate-limit-key-with-at-least-32-characters";
});

function fakeRedis(): Redis {
  const values = new Map<string, string>();
  return {
    set: async (key: string, value: string) => {
      if (values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    eval: async (script: string, _keyCount: number, ...args: Array<string | number>) => {
      const key = String(args[0]);
      const activeKey = String(args[1]);
      const argv = args.slice(2).map(String);
      if (script.includes("previousHash")) {
        const previousHash = values.get(activeKey);
        if (previousHash) values.delete(`ekyc:mock-fingerprint:${previousHash}`);
        values.set(key, argv[0]!);
        values.set(activeKey, argv[2]!);
        return 1;
      }
      if (values.get(activeKey) !== argv[0]) return null;
      const value = values.get(key);
      if (value === undefined) return null;
      values.delete(key);
      values.delete(activeKey);
      return value;
    },
  } as unknown as Redis;
}

describe("active-liveness challenge generation", () => {
  it("issues every required action exactly once", () => {
    const sequence = createRandomLivenessSequence(() => 0);
    expect(sequence).toHaveLength(3);
    expect(new Set(sequence)).toEqual(new Set(["BLINK", "TURN_LEFT", "TURN_RIGHT"]));
  });
});

describe("development fingerprint simulation", () => {
  it("stores a one-time server capture and lets the mock provider verify it", async () => {
    const service = new MockFingerprintService(fakeRedis());
    const issued = await service.createCapture("user-1", "device-1");
    const fingerprint = await service.consumeCapture(
      issued.captureToken,
      "user-1",
      "device-1"
    );

    expect(Buffer.from(fingerprint.templateBase64 || "", "base64")).toHaveLength(64);

    const request: ProviderVerificationRequest = {
      nid: "1234567890",
      dateOfBirth: "1990-01-01",
      claimedName: "Test User",
      media: {
        nidFrontUrl: "https://private.example/front",
        nidBackUrl: "https://private.example/back",
        selfieUrl: "https://private.example/selfie",
        livenessVideoUrl: "https://private.example/live.webm",
      },
      liveness: {
        sessionId: "00000000-0000-4000-8000-000000000001",
        challenges: ["BLINK", "TURN_LEFT", "TURN_RIGHT"],
        issuedAt: "2026-09-09T09:00:00.000Z",
        expiresAt: "2026-09-09T09:03:00.000Z",
        startedAt: "2026-09-09T09:00:10.000Z",
        completedAt: "2026-09-09T09:00:20.000Z",
      },
      fingerprint,
      correlationId: "test-correlation",
    };

    const result = await new MockECProvider(0).verifyFingerprint(request);
    expect(result).toMatchObject({ matched: true, conclusive: true, score: 96 });

    await expect(
      service.consumeCapture(issued.captureToken, "user-1", "device-1")
    ).rejects.toBeInstanceOf(MockFingerprintError);
  });
});
