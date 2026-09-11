import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { Worker, type Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { IComplianceScreeningProvider } from "../compliance/screening.js";
import type { DynamicEKYCConfig } from "../config/ekycConfig.js";
import { evaluateLiveness } from "../liveness/livenessPolicy.js";
import type { IPrivateMediaStore } from "../media/CloudinaryPrivateMediaStore.js";
import { EKYCVerification, type IEKYCVerification } from "../models/EKYCVerification.js";
import type { EKYCProviderFactory } from "../providers/EKYCProviderFactory.js";
import { ECProviderError } from "../providers/RealECEKYCProvider.js";
import { EKYC_QUEUE_NAME, type EKYCJobData } from "../queue/ekycQueue.js";
import { decryptField, encryptField } from "../security/fieldEncryption.js";
import { appendAuditEvent } from "../services/auditService.js";
import { decideEKYC } from "../services/decisionEngine.js";
import type { EKYCStatusProjector } from "../services/statusProjectionService.js";
import type {
  DecisionResult,
  ActiveLivenessEvidence,
  EKYCReasonCode,
  EKYCStatus,
  FingerprintEvidence,
  PrivateMediaRefs,
} from "../types.js";
import {
  enqueueStatusWebhook,
  type EKYCWebhookJobData,
} from "../webhooks/webhookService.js";
import type {
  FaceDuplicateMatch,
  IFaceVectorStore,
} from "../vector/QdrantFaceVectorStore.js";

interface WorkerDependencies {
  redis: Redis;
  dynamicConfig: DynamicEKYCConfig;
  providerFactory: EKYCProviderFactory;
  vectorStore: IFaceVectorStore;
  mediaStore: IPrivateMediaStore;
  webhookQueue: Queue<EKYCWebhookJobData>;
  screeningProvider: IComplianceScreeningProvider;
  projectStatus: EKYCStatusProjector;
}

function normalizeOCRNID(value: string, dateOfBirth: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 13 ? `${dateOfBirth.slice(0, 4)}${digits}` : digits;
}

function verificationIdOf(
  verification: Pick<IEKYCVerification, "_id">
): string {
  const rawId = verification._id;
  const verificationId =
    rawId instanceof mongoose.Types.ObjectId
      ? rawId.toHexString()
      : String(rawId);

  if (!mongoose.Types.ObjectId.isValid(verificationId)) {
    throw new Error("The e-KYC verification contains an invalid ID.");
  }

  return verificationId;
}

function eventIdFor(verificationId: string, attemptId: string, status: EKYCStatus): string {
  return createHash("sha256")
    .update(`ekyc-status:${verificationId}:${attemptId}:${status}`)
    .digest("hex");
}

async function publishDecision(
  verification: Pick<
    IEKYCVerification,
    "_id" | "userId" | "correlationId" | "attemptId" | "status" | "reasonCodes" | "decidedAt"
  >,
  deps: WorkerDependencies,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const verificationId = verificationIdOf(verification);
  const userId = verification.userId.toString();
  await deps.projectStatus(userId, verification.status);
  await appendAuditEvent({
    verificationId,
    eventType: "VERIFICATION_DECIDED",
    actorType: "SYSTEM",
    correlationId: verification.correlationId,
    idempotencyKey: `decision:${verification.attemptId}:${verification.status}`,
    metadata: {
      status: verification.status,
      reasons: verification.reasonCodes,
      ...metadata,
    },
  });
  await enqueueStatusWebhook(deps.webhookQueue, {
    verificationId,
    userId,
    status: verification.status,
    reasonCodes: verification.reasonCodes,
    occurredAt: verification.decidedAt?.toISOString() || new Date().toISOString(),
    eventId: eventIdFor(verificationId, verification.attemptId, verification.status),
  });
}

async function finalize(
  verification: IEKYCVerification,
  status: EKYCStatus,
  reasonCodes: EKYCReasonCode[],
  deps: WorkerDependencies,
  extra: Record<string, unknown> = {},
  auditMetadata: Record<string, unknown> = {}
): Promise<void> {
  const updated = await EKYCVerification.findOneAndUpdate(
    {
      _id: verification._id,
      status: { $in: ["QUEUED", "PROCESSING"] },
    },
    {
      $set: {
        status,
        activeAttempt: status === "PENDING_MANUAL_REVIEW",
        reasonCodes: [...new Set(reasonCodes)],
        decidedAt: new Date(),
        ...extra,
      },
    },
    { new: true, runValidators: true }
  );

  if (!updated) {
    const existing = await EKYCVerification.findById(verification._id);
    if (existing && !["QUEUED", "PROCESSING"].includes(existing.status)) {
      await publishDecision(existing, deps, auditMetadata);
    }
    return;
  }

  await publishDecision(updated, deps, auditMetadata);
}

function providerReason(error: ECProviderError): EKYCReasonCode {
  if (error.code === "TIMEOUT") return "PROVIDER_TIMEOUT";
  if (error.code === "INVALID_RESPONSE") return "PROVIDER_RESPONSE_INVALID";
  if (error.code === "REQUEST_REJECTED") return "PROVIDER_REQUEST_REJECTED";
  return "PROVIDER_UNAVAILABLE";
}

function requiresProviderFingerprint(): boolean {
  const configured = process.env.EKYC_REQUIRE_PROVIDER_FINGERPRINT?.trim();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function createEKYCWorker(deps: WorkerDependencies): Worker<EKYCJobData> {
  const worker = new Worker<EKYCJobData>(
    EKYC_QUEUE_NAME,
    async (job) => {
      const verification = await EKYCVerification.findById(job.data.verificationId)
        .select(
          "+nidEncrypted +dateOfBirthEncrypted +claimedNameEncrypted +mediaRefsEncrypted " +
          "+livenessEvidenceEncrypted +fingerprintEvidenceEncrypted +nidLookupHash"
        );

      if (!verification || verification.attemptId !== job.data.attemptId) return;

      const verificationId = verificationIdOf(verification);

      if (!["QUEUED", "PROCESSING"].includes(verification.status)) {
        await publishDecision(verification, deps);
        return;
      }

      if (verification.status === "QUEUED") {
        verification.status = "PROCESSING";
        verification.processingStartedAt = new Date();
        await verification.save();
        await deps.projectStatus(verification.userId.toString(), "PROCESSING");
      }

      const config = await deps.dynamicConfig.get();
      const provider = await deps.providerFactory.create();
      const nid = decryptField(verification.nidEncrypted);
      const dateOfBirth = decryptField(verification.dateOfBirthEncrypted);
      const claimedName = decryptField(verification.claimedNameEncrypted);
      const refs = JSON.parse(decryptField(verification.mediaRefsEncrypted)) as PrivateMediaRefs;
      const livenessEvidence = JSON.parse(
        decryptField(verification.livenessEvidenceEncrypted)
      ) as ActiveLivenessEvidence;
      const fingerprintEvidence = verification.fingerprintEvidenceEncrypted
        ? JSON.parse(
            decryptField(verification.fingerprintEvidenceEncrypted)
          ) as FingerprintEvidence
        : undefined;
      deps.mediaStore.assertOwnedBy(refs, verification.userId.toString());
      const media = await deps.mediaStore.createReadUrls(refs, 60);
      const request = {
        nid,
        dateOfBirth,
        claimedName,
        media,
        liveness: livenessEvidence,
        fingerprint: fingerprintEvidence,
        correlationId: verification.correlationId,
      };

      let ocr;
      try {
        ocr = await provider.parseOCR(request);
      } catch (error) {
        if (error instanceof ECProviderError) {
          await finalize(verification, "PENDING_MANUAL_REVIEW", [providerReason(error)], deps);
          return;
        }
        throw error;
      }

      if (ocr.confidence < 70) {
        await finalize(verification, "PENDING_MANUAL_REVIEW", ["OCR_CONFIDENCE_LOW"], deps);
        return;
      }
      if (ocr.nid && normalizeOCRNID(ocr.nid, dateOfBirth) !== nid) {
        await finalize(verification, "PENDING_MANUAL_REVIEW", ["OCR_NID_MISMATCH"], deps);
        return;
      }
      if (ocr.dateOfBirth && ocr.dateOfBirth !== dateOfBirth) {
        await finalize(verification, "PENDING_MANUAL_REVIEW", ["OCR_DOB_MISMATCH"], deps);
        return;
      }

      let liveness;
      try {
        liveness = await provider.checkLiveness(request);
      } catch (error) {
        if (error instanceof ECProviderError) {
          await finalize(verification, "PENDING_MANUAL_REVIEW", [providerReason(error)], deps);
          return;
        }
        throw error;
      }

      const livenessPolicy = await evaluateLiveness(
        liveness,
        config,
        deps.redis,
        verificationId
      );
      liveness.passed = livenessPolicy.passed;
      liveness.conclusive = liveness.conclusive && livenessPolicy.conclusive;
      if (!liveness.conclusive || !liveness.passed) {
        await finalize(
          verification,
          liveness.conclusive ? "REJECTED" : "PENDING_MANUAL_REVIEW",
          [liveness.conclusive ? "LIVENESS_FAILED" : "LIVENESS_INCONCLUSIVE"],
          deps,
          { livenessPassed: false },
          { livenessPolicyReasons: livenessPolicy.reasons }
        );
        return;
      }

      let fingerprint;
      if (fingerprintEvidence) {
        try {
          fingerprint = await provider.verifyFingerprint(request);
        } catch (error) {
          if (error instanceof ECProviderError) {
            await finalize(verification, "PENDING_MANUAL_REVIEW", [providerReason(error)], deps);
            return;
          }
          throw error;
        }
      } else if (requiresProviderFingerprint()) {
        await finalize(
          verification,
          "PENDING_MANUAL_REVIEW",
          ["FINGERPRINT_INCONCLUSIVE"],
          deps
        );
        return;
      }

      let identity;
      try {
        identity = await provider.verifyIdentity(request);
      } catch (error) {
        if (error instanceof ECProviderError) {
          await finalize(verification, "PENDING_MANUAL_REVIEW", [providerReason(error)], deps);
          return;
        }
        throw error;
      }

      let duplicate: FaceDuplicateMatch | null = null;
      if (identity.faceEmbedding) {
        try {
          duplicate = await deps.vectorStore.findDuplicate(
            identity.faceEmbedding,
            config.thresholds.biometricDuplicate
          );
        } catch {
          await finalize(
            verification,
            "PENDING_MANUAL_REVIEW",
            ["VECTOR_STORE_UNAVAILABLE"],
            deps,
            { providerName: provider.name, livenessPassed: true }
          );
          return;
        }
      }

      let decision: DecisionResult = decideEKYC(
        {
          identity,
          ocr,
          liveness,
          fingerprint,
          claimedName,
          possibleBiometricDuplicate: Boolean(duplicate),
        },
        config
      );

      let screeningReference: string | undefined;
      if (decision.status === "VERIFIED") {
        if (!identity.faceEmbedding) {
          decision = {
            ...decision,
            status: "PENDING_MANUAL_REVIEW",
            reasons: ["VECTOR_STORE_UNAVAILABLE"],
          };
        } else {
          try {
            const screening = await deps.screeningProvider.screen({
              name: claimedName,
              dateOfBirth,
              correlationId: verification.correlationId,
            });
            screeningReference = screening.screeningReference;
            if (
              screening.sanctionsPotentialMatch ||
              screening.pepOrIpPotentialMatch ||
              screening.adverseMediaPotentialMatch
            ) {
              decision = {
                ...decision,
                status: "PENDING_MANUAL_REVIEW",
                reasons: ["COMPLIANCE_SCREENING_REVIEW"],
              };
            }
          } catch {
            decision = {
              ...decision,
              status: "PENDING_MANUAL_REVIEW",
              reasons: ["SCREENING_UNAVAILABLE"],
            };
          }
        }
      }

      let vectorSaved = false;
      if (decision.status === "VERIFIED" && identity.faceEmbedding) {
        try {
          await deps.vectorStore.saveVerifiedTemplate(
            verification.userId.toString(),
            verificationId,
            identity.faceEmbedding
          );
          vectorSaved = true;
        } catch {
          decision = {
            ...decision,
            status: "PENDING_MANUAL_REVIEW",
            reasons: ["VECTOR_STORE_UNAVAILABLE"],
          };
        }
      }

      try {
        await finalize(
          verification,
          decision.status,
          decision.reasons,
          deps,
          {
            providerName: provider.name,
            providerReferenceEncrypted: encryptField(identity.providerReference),
            ...(fingerprint
              ? {
                  fingerprintProviderReferenceEncrypted: encryptField(
                    fingerprint.providerReference
                  ),
                  fingerprintMatched: fingerprint.matched,
                  fingerprintConclusive: fingerprint.conclusive,
                  fingerprintScore: fingerprint.score,
                }
              : {}),
            ...(screeningReference
              ? { screeningReferenceEncrypted: encryptField(screeningReference) }
              : {}),
            ...(decision.status === "PENDING_MANUAL_REVIEW" && identity.faceEmbedding
              ? { faceEmbeddingEncrypted: encryptField(JSON.stringify(identity.faceEmbedding)) }
              : {}),
            faceScore: decision.faceScore,
            faceQualityScore: decision.faceQualityScore,
            faceSharpnessScore: identity.faceQuality.sharpnessScore,
            faceBrightnessScore: identity.faceQuality.brightnessScore,
            faceCoverage: identity.faceQuality.faceCoverage,
            facePoseValid: identity.faceQuality.poseValid,
            faceOcclusionDetected: identity.faceQuality.occlusionDetected,
            nameScore: decision.nameScore,
            livenessPassed: true,
            possibleDuplicateVectorId: duplicate?.pointId,
            possibleDuplicateScore: duplicate?.score,
          },
          {
            faceScore: decision.faceScore,
            faceQualityScore: decision.faceQualityScore,
            faceSharpnessScore: identity.faceQuality.sharpnessScore,
            faceBrightnessScore: identity.faceQuality.brightnessScore,
            faceCoverage: identity.faceQuality.faceCoverage,
            facePoseValid: identity.faceQuality.poseValid,
            faceOcclusionDetected: identity.faceQuality.occlusionDetected,
            nameScore: decision.nameScore,
            duplicateScore: duplicate?.score ?? null,
            fingerprintScore: fingerprint?.score ?? null,
            fingerprintMatched: fingerprint?.matched ?? null,
            fingerprintConclusive: fingerprint?.conclusive ?? null,
          }
        );
      } catch (error) {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
          if (vectorSaved) {
            await deps.vectorStore.removeVerifiedTemplate(verificationId).catch(() => undefined);
          }
          await finalize(verification, "REJECTED", ["NID_ALREADY_VERIFIED"], deps, {
            providerName: provider.name,
            faceScore: decision.faceScore,
            faceQualityScore: decision.faceQualityScore,
            nameScore: decision.nameScore,
            livenessPassed: true,
            ...(fingerprint
              ? {
                  fingerprintMatched: fingerprint.matched,
                  fingerprintConclusive: fingerprint.conclusive,
                  fingerprintScore: fingerprint.score,
                }
              : {}),
          });
          return;
        }
        throw error;
      }
    },
    { connection: deps.redis, concurrency: 8, lockDuration: 30_000 }
  );

  worker.on("error", (error) => {
    console.error("EKYC WORKER ERROR:", error.message);
  });
  worker.on("failed", (job, error) => {
    console.error("EKYC JOB FAILED:", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      message: error.message,
    });
  });

  return worker;
}

export default createEKYCWorker;
