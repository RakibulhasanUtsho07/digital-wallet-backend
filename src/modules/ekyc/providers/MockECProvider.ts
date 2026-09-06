import { createHash, randomUUID } from "node:crypto";
import type {
  IEKYCProvider,
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
    return {
      nidMatched: !request.nid.endsWith("0000"),
      dateOfBirthMatched: true,
      ecNameEnglish: request.claimedName,
      faceMatchScore: 55 + (hash[0]! % 46),
      faceEmbedding: Array.from({ length: 32 }, (_, index) => hash[index]! / 255),
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
    const spoof = /(?:screen|print|spoof)/i.test(request.media.selfieUrl);
    return {
      passed: !spoof,
      conclusive: true,
      passiveScore: spoof ? 20 : 96,
      activeScore: spoof ? 25 : 95,
      challengePassed: !spoof,
      evidenceId: `MOCK-LIVE-${randomUUID()}`,
      capturedAt: new Date().toISOString(),
      attackSignals: spoof ? ["SCREEN_REPLAY"] : [],
    };
  }
}
