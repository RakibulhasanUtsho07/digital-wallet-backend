import { z } from "zod";
import type { EKYCConfig } from "../config/ekycConfig.js";
import type {
  IEKYCProvider,
  FingerprintVerificationResult,
  IdentityVerificationResult,
  LivenessResult,
  OCRResult,
  ProviderVerificationRequest,
} from "../types.js";

const identitySchema = z.object({
  nidMatched: z.boolean(),
  dateOfBirthMatched: z.boolean(),
  ecNameEnglish: z.string().optional(),
  ecNameBangla: z.string().optional(),
  faceMatchScore: z.number().min(0).max(100),
  faceQuality: z.object({
    faceDetected: z.boolean(),
    singleFaceDetected: z.boolean(),
    qualityScore: z.number().min(0).max(100),
    sharpnessScore: z.number().min(0).max(100),
    brightnessScore: z.number().min(0).max(100),
    faceCoverage: z.number().min(0).max(1),
    poseValid: z.boolean(),
    occlusionDetected: z.boolean(),
  }).strict(),
  faceEmbedding: z.array(z.number().finite()).max(4096).optional(),
  providerReference: z.string().min(1).max(200),
}).strict();

const ocrSchema = z.object({
  nid: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nameEnglish: z.string().optional(),
  nameBangla: z.string().optional(),
  confidence: z.number().min(0).max(100),
}).strict();

const livenessSchema = z.object({
  passed: z.boolean(),
  conclusive: z.boolean(),
  passiveScore: z.number().min(0).max(100),
  activeScore: z.number().min(0).max(100).optional(),
  challengePassed: z.boolean().optional(),
  evidenceId: z.string().min(1).max(200),
  capturedAt: z.string().datetime(),
  attackSignals: z.array(z.enum(["SCREEN_REPLAY", "PRINT_ATTACK", "MASK", "MULTIPLE_FACES"])),
}).strict();

const fingerprintSchema = z.object({
  matched: z.boolean(),
  conclusive: z.boolean(),
  score: z.number().min(0).max(100),
  providerReference: z.string().min(1).max(200),
}).strict();

export class ECProviderError extends Error {
  constructor(
    message: string,
    readonly code: "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE" | "REQUEST_REJECTED",
    readonly transient: boolean
  ) {
    super(message);
    this.name = "ECProviderError";
  }
}

/**
 * Production adapter for an EC/Porichoy contract. The endpoint response bodies
 * must be mapped by your approved gateway/proxy to the canonical schemas above.
 * Do not infer production URLs, field names, or credentials from public examples.
 */
export class RealECEKYCProvider implements IEKYCProvider {
  readonly name = "REAL_EC_PORICHOY" as const;

  constructor(private readonly config: EKYCConfig["provider"]) {
    if (!config.baseUrl || !config.apiKey) {
      throw new Error("Real EC provider is not configured.");
    }
    const origin = new URL(config.baseUrl).origin;
    if (!config.allowedOrigins.includes(origin)) {
      throw new Error("EC gateway origin is not allowlisted.");
    }
    if (new URL(config.baseUrl).protocol !== "https:") {
      throw new Error("EC gateway must use HTTPS.");
    }
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    const endpoint = new URL(path, this.config.baseUrl);
    if (!this.config.allowedOrigins.includes(endpoint.origin)) {
      throw new ECProviderError("EC gateway origin rejected.", "REQUEST_REJECTED", false);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          [this.config.apiKeyHeader]: `${this.config.apiKeyPrefix}${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      });
      if (response.status >= 500 || response.status === 429) {
        throw new ECProviderError("EC gateway is temporarily unavailable.", "UNAVAILABLE", true);
      }
      if (!response.ok) {
        throw new ECProviderError("EC gateway rejected the request.", "REQUEST_REJECTED", false);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ECProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ECProviderError("EC gateway timed out.", "TIMEOUT", true);
      }
      throw new ECProviderError("EC gateway is unavailable.", "UNAVAILABLE", true);
    } finally {
      clearTimeout(timer);
    }
  }

  async verifyIdentity(request: ProviderVerificationRequest): Promise<IdentityVerificationResult> {
    const data = await this.post(this.config.verifyPath, {
      nidNumber: request.nid,
      dateOfBirth: request.dateOfBirth,
      name: request.claimedName,
      photoUrl: request.media.selfieUrl,
      correlationId: request.correlationId,
    });
    const parsed = identitySchema.safeParse(data);
    if (!parsed.success) throw new ECProviderError("Invalid identity response.", "INVALID_RESPONSE", false);
    return parsed.data;
  }

  async parseOCR(request: ProviderVerificationRequest): Promise<OCRResult> {
    const data = await this.post(this.config.ocrPath, {
      nidFrontUrl: request.media.nidFrontUrl,
      nidBackUrl: request.media.nidBackUrl,
      correlationId: request.correlationId,
    });
    const parsed = ocrSchema.safeParse(data);
    if (!parsed.success) throw new ECProviderError("Invalid OCR response.", "INVALID_RESPONSE", false);
    return parsed.data;
  }

  async checkLiveness(request: ProviderVerificationRequest): Promise<LivenessResult> {
    const data = await this.post(this.config.livenessPath, {
      selfieUrl: request.media.selfieUrl,
      livenessVideoUrl: request.media.livenessVideoUrl,
      sessionId: request.liveness.sessionId,
      challengeSequence: request.liveness.challenges,
      startedAt: request.liveness.startedAt,
      completedAt: request.liveness.completedAt,
      correlationId: request.correlationId,
    });
    const parsed = livenessSchema.safeParse(data);
    if (!parsed.success) throw new ECProviderError("Invalid liveness response.", "INVALID_RESPONSE", false);
    return parsed.data;
  }

  async verifyFingerprint(
    request: ProviderVerificationRequest
  ): Promise<FingerprintVerificationResult> {
    const evidence = request.fingerprint;
    const captureReference = evidence?.providerCaptureReference?.trim();
    if (!evidence || evidence.mode !== "PROVIDER" || !captureReference) {
      throw new ECProviderError(
        "A provider-issued fingerprint capture reference is required.",
        "REQUEST_REJECTED",
        false
      );
    }

    const data = await this.post(this.config.fingerprintPath, {
      captureReference,
      nidNumber: request.nid,
      dateOfBirth: request.dateOfBirth,
      correlationId: request.correlationId,
    });
    const parsed = fingerprintSchema.safeParse(data);
    if (!parsed.success) {
      throw new ECProviderError("Invalid fingerprint response.", "INVALID_RESPONSE", false);
    }
    return parsed.data;
  }
}
