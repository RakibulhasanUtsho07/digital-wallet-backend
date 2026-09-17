import { describe, expect, it } from "vitest";
import type { EKYCConfig } from "../../src/modules/ekyc/config/ekycConfig.js";
import { decideEKYC } from "../../src/modules/ekyc/services/decisionEngine.js";
import type { DecisionInput } from "../../src/modules/ekyc/types.js";
const config: EKYCConfig = {
  environment: "test",
  useMockProvider: true,
  mockLatencyMs: 0,
  provider: {
    verifyPath: "/verify",
    ocrPath: "/ocr",
    livenessPath: "/liveness",
    fingerprintPath: "/fingerprint",
    apiKeyHeader: "x-api-key",
    apiKeyPrefix: "",
    allowedOrigins: [],
    timeoutMs: 3000,
  },
  thresholds: {
    faceAutoApprove: 80,
    faceManualReview: 60,
    faceQuality: 75,
    faceSharpness: 65,
    faceBrightness: 60,
    faceCoverage: 0.28,
    nameMatch: 85,
    passiveLiveness: 80,
    activeLiveness: 80,
    fingerprintMatch: 80,
    requireActiveLiveness: true,
    biometricDuplicate: 0.92,
  },
  rateLimit: { attempts: 3, windowSeconds: 86_400 },
  loadedAt: new Date().toISOString(),
};

function input(): DecisionInput {
  return {
    identity: {
      nidMatched: true,
      dateOfBirthMatched: true,
      ecNameEnglish: "Rakibul Hasan",
      faceMatchScore: 96,
      faceEmbedding: Array.from({ length: 32 }, () => 0.1),
      faceQuality: {
        faceDetected: true,
        singleFaceDetected: true,
        qualityScore: 94,
        sharpnessScore: 92,
        brightnessScore: 90,
        faceCoverage: 0.42,
        poseValid: true,
        occlusionDetected: false,
      },
      providerReference: "test",
    },
    ocr: { nameEnglish: "Rakibul Hasan", confidence: 99 },
    liveness: {
      passed: true,
      conclusive: true,
      passiveScore: 95,
      activeScore: 95,
      challengePassed: true,
      evidenceId: "evidence",
      capturedAt: new Date().toISOString(),
      attackSignals: [],
    },
    fingerprint: { matched: true, conclusive: true, score: 95, providerReference: "fp" },
    claimedName: "Rakibul Hasan",
    possibleBiometricDuplicate: false,
  } as const;
} 

describe("professional face gates", () => {
  it("auto approves a complete high-quality result", () => {
    expect(decideEKYC(input(), config).status).toBe("VERIFIED");
  });

  it("rejects multiple faces", () => {
    const value = input();
    const result = decideEKYC({
      ...value,
      identity: {
        ...value.identity,
        faceQuality: { ...value.identity.faceQuality, singleFaceDetected: false },
      },
    }, config);
    expect(result).toMatchObject({ status: "REJECTED", reasons: ["MULTIPLE_FACES"] });
  });

  it("routes low-quality images to manual review", () => {
    const value = input();
    const result = decideEKYC({
      ...value,
      identity: {
        ...value.identity,
        faceQuality: { ...value.identity.faceQuality, sharpnessScore: 40 },
      },
    }, config);
    expect(result).toMatchObject({ status: "PENDING_MANUAL_REVIEW", reasons: ["FACE_QUALITY_LOW"] });
  });
});
