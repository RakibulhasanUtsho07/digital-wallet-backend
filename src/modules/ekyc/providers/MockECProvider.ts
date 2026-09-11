import { createHash, randomUUID } from "node:crypto";
import type {
  IEKYCProvider,
  FingerprintVerificationResult,
  IdentityVerificationResult,
  LivenessResult,
  OCRResult,
  ProviderVerificationRequest,
} from "../types.js";

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class MockECProvider implements IEKYCProvider {
  readonly name = "MOCK_EC" as const;

  constructor(private readonly latencyMs = Number(process.env.MOCK_EC_LATENCY_MS || 650)) {}

  private async simulateLatency(): Promise<void> {
    await pause(this.latencyMs);
  }

  async verifyIdentity(request: ProviderVerificationRequest): Promise<IdentityVerificationResult> {
    await this.simulateLatency();
    const hash = createHash("sha256").update(request.nid).digest();
    const scenario = process.env.MOCK_EKYC_FACE_SCENARIO?.trim().toUpperCase() || "PASS";
    const noFace = scenario === "NO_FACE";
    const multipleFaces = scenario === "MULTIPLE_FACES";
    const lowQuality = scenario === "LOW_QUALITY";
    const invalidPose = scenario === "INVALID_POSE";
    const occluded = scenario === "OCCLUDED";
    return {
      nidMatched: !request.nid.endsWith("0000"),
      dateOfBirthMatched: true,
      ecNameEnglish: request.claimedName,
      faceMatchScore: 55 + (hash[0]! % 46),
      faceQuality: {
        faceDetected: !noFace,
        singleFaceDetected: !noFace && !multipleFaces,
        qualityScore: lowQuality ? 45 : 94,
        sharpnessScore: lowQuality ? 42 : 92,
        brightnessScore: lowQuality ? 48 : 90,
        faceCoverage: lowQuality ? 0.15 : 0.42,
        poseValid: !invalidPose,
        occlusionDetected: occluded,
      },
      ...(!noFace && !multipleFaces
        ? { faceEmbedding: Array.from({ length: 32 }, (_, index) => hash[index]! / 255) }
        : {}),
      providerReference: `MOCK-${randomUUID()}`,
    };
  }

  async parseOCR(request: ProviderVerificationRequest): Promise<OCRResult> {
    await this.simulateLatency();
    return {
      nid: request.nid,
      dateOfBirth: request.dateOfBirth,
      nameEnglish: request.claimedName,
      confidence: request.media.nidFrontUrl.includes("low-quality") ? 58 : 97,
    };
  }

  async checkLiveness(request: ProviderVerificationRequest): Promise<LivenessResult> {
    await this.simulateLatency();
    const spoof = /(?:screen|print|spoof)/i.test(
      `${request.media.selfieUrl} ${request.media.livenessVideoUrl}`
    );
    const challengeComplete = request.liveness.challenges.length === 3;
    return {
      passed: !spoof && challengeComplete,
      conclusive: challengeComplete,
      passiveScore: spoof ? 20 : 96,
      activeScore: spoof ? 25 : 95,
      challengePassed: !spoof && challengeComplete,
      evidenceId: `MOCK-LIVE-${request.liveness.sessionId}`,
      capturedAt: request.liveness.completedAt,
      attackSignals: spoof ? ["SCREEN_REPLAY"] : [],
    };
  }

  async verifyFingerprint(
    request: ProviderVerificationRequest
  ): Promise<FingerprintVerificationResult> {
    await this.simulateLatency();
    if (process.env.NODE_ENV === "production") {
      throw new Error("Mock fingerprint verification is prohibited in production.");
    }

    const evidence = request.fingerprint;
    if (!evidence) {
      throw new Error("Mock fingerprint evidence was not supplied.");
    }

    const template = evidence.templateBase64;
    let templateBytes = 0;
    try {
      templateBytes = template ? Buffer.from(template, "base64").length : 0;
    } catch {
      templateBytes = 0;
    }

    const conclusive =
      evidence.mode === "MOCK" &&
      templateBytes === 64 &&
      evidence.qualityScore >= 70;

    return {
      matched: conclusive,
      conclusive,
      score: conclusive ? evidence.qualityScore : 0,
      providerReference: `MOCK-FINGERPRINT-${evidence.captureId}`,
    };
  }
}
