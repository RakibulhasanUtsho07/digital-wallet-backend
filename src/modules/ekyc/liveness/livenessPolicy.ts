import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type { EKYCConfig } from "../config/ekycConfig.js";
import type { LivenessResult } from "../types.js";

export interface LivenessPolicyResult {
  passed: boolean;
  conclusive: boolean;
  reasons: string[];
}

export async function evaluateLiveness(
  result: LivenessResult,
  config: EKYCConfig,
  redis: Redis,
  claimId: string,
  now = new Date()
): Promise<LivenessPolicyResult> {
  const reasons: string[] = [];
  let conclusive = result.conclusive === true;
  const capturedAt = new Date(result.capturedAt);
  const ageMs = now.getTime() - capturedAt.getTime();

  if (!Number.isFinite(capturedAt.getTime()) || ageMs < -30_000 || ageMs > 120_000) {
    reasons.push("STALE_OR_INVALID_CAPTURE");
    conclusive = false;
  }
  if (!Number.isFinite(result.passiveScore) || result.passiveScore < 0 || result.passiveScore > 100) {
    reasons.push("PASSIVE_SCORE_INVALID");
    conclusive = false;
  } else if (result.passiveScore < config.thresholds.passiveLiveness) {
    reasons.push("PASSIVE_SCORE_LOW");
  }
  if (config.thresholds.requireActiveLiveness) {
    if (
      result.activeScore === undefined ||
      !Number.isFinite(result.activeScore) ||
      result.activeScore < 0 ||
      result.activeScore > 100 ||
      result.activeScore < config.thresholds.activeLiveness
    ) {
      reasons.push("ACTIVE_SCORE_LOW");
      if (
        result.activeScore === undefined ||
        !Number.isFinite(result.activeScore) ||
        result.activeScore < 0 ||
        result.activeScore > 100
      ) {
        conclusive = false;
      }
    }
    if (result.challengePassed !== true) reasons.push("ACTIVE_CHALLENGE_FAILED");
  } else {
    if (
      result.activeScore !== undefined &&
      result.activeScore < config.thresholds.activeLiveness
    ) {
      reasons.push("ACTIVE_SCORE_LOW");
    }
    if (result.challengePassed === false) reasons.push("ACTIVE_CHALLENGE_FAILED");
  }
  if (result.attackSignals.length) reasons.push(...result.attackSignals);

  if (!claimId.trim()) throw new Error("A liveness evidence claim ID is required.");

  // SET NX prevents the same signed evidence from being accepted for several attempts.
  // A retry of the same BullMQ attempt remains safe and does not create a false replay.
  const evidenceHash = createHash("sha256")
    .update(`ekyc-liveness:${result.evidenceId}`, "utf8")
    .digest("hex");
  const evidenceClaimed = await redis.set(
    `ekyc:liveness-evidence:${evidenceHash}`,
    claimId,
    "EX",
    86_400,
    "NX"
  );
  if (evidenceClaimed !== "OK") {
    const existingClaim = await redis.get(`ekyc:liveness-evidence:${evidenceHash}`);
    if (existingClaim !== claimId) reasons.push("LIVENESS_EVIDENCE_REPLAYED");
  }

  return {
    passed: result.passed && reasons.length === 0,
    conclusive,
    reasons: [...new Set(reasons)],
  };
}
