import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import type { EKYCConfig } from "../src/modules/ekyc/config/ekycConfig.js";
import { evaluateLiveness } from "../src/modules/ekyc/liveness/livenessPolicy.js";
import type { LivenessResult } from "../src/modules/ekyc/types.js";

const config = {
  thresholds: {
    passiveLiveness: 80,
    activeLiveness: 80,
    requireActiveLiveness: true,
  },
} as EKYCConfig;

function fakeRedis(): Redis {
  const values = new Map<string, string>();
  return {
    set: async (key: string, value: string) => {
      if (values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    get: async (key: string) => values.get(key) ?? null,
  } as unknown as Redis;
}

const liveResult: LivenessResult = {
  passed: true,
  conclusive: true,
  passiveScore: 95,
  activeScore: 94,
  challengePassed: true,
  evidenceId: "evidence-1",
  capturedAt: "2026-09-05T12:00:00.000Z",
  attackSignals: [],
};

describe("advanced liveness policy", () => {
  it("requires the configured active challenge", async () => {
    const result = await evaluateLiveness(
      { ...liveResult, evidenceId: "missing-active", activeScore: undefined, challengePassed: undefined },
      config,
      fakeRedis(),
      "attempt-1",
      new Date("2026-09-05T12:00:30.000Z")
    );
    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("ACTIVE_SCORE_LOW");
    expect(result.reasons).toContain("ACTIVE_CHALLENGE_FAILED");
  });

  it("allows the same attempt to retry but blocks cross-attempt replay", async () => {
    const redis = fakeRedis();
    const now = new Date("2026-09-05T12:00:30.000Z");
    expect((await evaluateLiveness(liveResult, config, redis, "attempt-1", now)).passed).toBe(true);
    expect((await evaluateLiveness(liveResult, config, redis, "attempt-1", now)).passed).toBe(true);
    const replay = await evaluateLiveness(liveResult, config, redis, "attempt-2", now);
    expect(replay.passed).toBe(false);
    expect(replay.reasons).toContain("LIVENESS_EVIDENCE_REPLAYED");
  });
});
