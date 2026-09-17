import { describe, expect, it } from "vitest";

import type { EKYCConfig } from "../src/modules/ekyc/config/ekycConfig.js";
import { decideEKYC } from "../src/modules/ekyc/services/decisionEngine.js";
import type { DecisionInput } from "../src/modules/ekyc/types.js";

/*
 * Production DecisionInput-এ fingerprint optional হতে পারে।
 * কিন্তু এই test factory সবসময় fingerprint তৈরি করে।
 */
type TestDecisionInput =
  Omit<DecisionInput, "fingerprint"> & {
    fingerprint: NonNullable<
      DecisionInput["fingerprint"]
    >;
  };

const config: EKYCConfig = {
  environment: "test",
  useMockProvider: true,
  mockLatencyMs: 0,

  provider: {
    verifyPath: "/verify",
    ocrPath: "/ocr",
    livenessPath: "/live",
    fingerprintPath: "/fingerprint",
    apiKeyHeader: "x-api-key",
    apiKeyPrefix: "",
    allowedOrigins: [],
    timeoutMs: 5_000,
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

  rateLimit: {
    attempts: 3,
    windowSeconds: 86_400,
  },

  loadedAt: new Date().toISOString(),
};

function createInput(): TestDecisionInput {
  return {
    claimedName: "Rahim Uddin",
    possibleBiometricDuplicate: false,

    identity: {
      nidMatched: true,
      dateOfBirthMatched: true,
      ecNameEnglish: "Rahim Uddin",
      faceMatchScore: 90,

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

      faceEmbedding: Array.from(
        { length: 32 },
        () => 0.1
      ),

      providerReference:
        "identity-ref-1",
    },

    ocr: {
      nameEnglish: "Rahim Uddin",
      confidence: 98,
    },

    liveness: {
      passed: true,
      conclusive: true,
      passiveScore: 95,
      activeScore: 95,
      challengePassed: true,
      evidenceId: "liveness-ref-1",
      capturedAt:
        new Date().toISOString(),
      attackSignals: [],
    },

    fingerprint: {
      matched: true,
      conclusive: true,
      score: 96,
      providerReference:
        "fingerprint-ref-1",
    },
  };
}

describe(
  "advanced e-KYC decision engine",
  () => {
    it(
      "auto-approves a complete strong match",
      () => {
        const result =
          decideEKYC(
            createInput(),
            config
          );

        expect(result).toMatchObject({
          status: "VERIFIED",
          reasons: [
            "AUTO_APPROVED",
          ],
          faceScore: 90,
          faceQualityScore: 94,
        });
      }
    );

    it(
      "sends borderline matches and biometric duplicates to review",
      () => {
        const borderline =
          createInput();

        borderline.identity
          .faceMatchScore = 79;

        expect(
          decideEKYC(
            borderline,
            config
          )
        ).toMatchObject({
          status:
            "PENDING_MANUAL_REVIEW",
          reasons: [
            "FACE_SCORE_MANUAL_REVIEW",
          ],
        });

        const duplicate =
          createInput();

        duplicate
          .possibleBiometricDuplicate =
          true;

        expect(
          decideEKYC(
            duplicate,
            config
          )
        ).toMatchObject({
          status:
            "PENDING_MANUAL_REVIEW",
          reasons: [
            "POSSIBLE_BIOMETRIC_DUPLICATE",
          ],
        });
      }
    );

    it(
      "rejects weak face matches and failed liveness",
      () => {
        const weakFace =
          createInput();

        weakFace.identity
          .faceMatchScore = 59;

        expect(
          decideEKYC(
            weakFace,
            config
          )
        ).toMatchObject({
          status: "REJECTED",
          reasons: [
            "FACE_SCORE_REJECTED",
          ],
        });

        const failedLiveness =
          createInput();

        failedLiveness
          .liveness.passed =
          false;

        failedLiveness
          .liveness.attackSignals = [
          "PRINT_ATTACK",
        ];

        expect(
          decideEKYC(
            failedLiveness,
            config
          )
        ).toMatchObject({
          status: "REJECTED",
          reasons: [
            "LIVENESS_FAILED",
          ],
        });
      }
    );

    it(
      "rejects mismatch and reviews inconclusive fingerprint results",
      () => {
        const mismatch =
          createInput();

        mismatch.fingerprint.matched =
          false;

        mismatch.fingerprint.score =
          35;

        expect(
          decideEKYC(
            mismatch,
            config
          )
        ).toMatchObject({
          status: "REJECTED",
          reasons: [
            "FINGERPRINT_MISMATCH",
          ],
        });

        const inconclusive =
          createInput();

        inconclusive.fingerprint
          .conclusive = false;

        expect(
          decideEKYC(
            inconclusive,
            config
          )
        ).toMatchObject({
          status:
            "PENDING_MANUAL_REVIEW",
          reasons: [
            "FINGERPRINT_INCONCLUSIVE",
          ],
        });
      }
    );
  }
);