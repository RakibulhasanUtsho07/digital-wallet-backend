import mongoose from "mongoose";
import { Worker, type Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { DynamicEKYCConfig } from "../config/ekycConfig.js";
import type { IComplianceScreeningProvider } from "../compliance/screening.js";
import { evaluateLiveness } from "../liveness/livenessPolicy.js";
import { EKYCVerification } from "../models/EKYCVerification.js";
import type { EKYCProviderFactory } from "../providers/EKYCProviderFactory.js";
import { ECProviderError } from "../providers/RealECEKYCProvider.js";
import { EKYC_QUEUE_NAME, type EKYCJobData } from "../queue/ekycQueue.js";
import { decryptField, encryptField } from "../security/fieldEncryption.js";
import { decideEKYC } from "../services/decisionEngine.js";
import { appendAuditEvent } from "../services/auditService.js";
import type { IFaceVectorStore } from "../vector/QdrantFaceVectorStore.js";
import type { EKYCReasonCode, EKYCStatus, PrivateMediaRefs, SignedMediaUrls } from "../types.js";
import { enqueueStatusWebhook } from "../webhooks/webhookService.js";

export interface IPrivateMediaResolver {
  createReadUrls(refs: PrivateMediaRefs, expiresInSeconds: number): Promise<SignedMediaUrls>;
}

interface WorkerDependencies {
  redis: Redis;
  dynamicConfig: DynamicEKYCConfig;
  providerFactory: EKYCProviderFactory;
  vectorStore: IFaceVectorStore;
  mediaResolver: IPrivateMediaResolver;
  webhookQueue: Queue<any>;
  screeningProvider: IComplianceScreeningProvider;
}

function normalizeOCRNID(value: string, dateOfBirth: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 13 ? `${dateOfBirth.slice(0, 4)}${digits}` : digits;
}

async function finalize(
  verificationId: string,
  userId: string,
  correlationId: string,
  status: EKYCStatus,
  reasonCodes: EKYCReasonCode[],
  webhookQueue: Queue<any>,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await EKYCVerification.updateOne(
    { _id: verificationId },
    { $set: { status, reasonCodes, decidedAt: new Date(), ...extra } }
  );
  await appendAuditEvent({
    verificationId,
    eventType: "VERIFICATION_DECIDED",
    actorType: "SYSTEM",
    correlationId,
    metadata: { status, reasonCodes },
  });
  await enqueueStatusWebhook(webhookQueue, {
    verificationId,
    userId,
    status,
    reasonCodes,
    occurredAt: new Date().toISOString(),
  });
}

export function createEKYCWorker(deps: WorkerDependencies): Worker<EKYCJobData> {
  return new Worker<EKYCJobData>(EKYC_QUEUE_NAME, async (job) => {
    const verification = await EKYCVerification.findById(job.data.verificationId)
      .select("+nidEncrypted +dateOfBirthEncrypted +claimedNameEncrypted +mediaRefsEncrypted +nidLookupHash");
    if (!verification || verification.attemptId !== job.data.attemptId) return;
    if (!["QUEUED", "PROCESSING"].includes(verification.status)) return;

    verification.status = "PROCESSING";
    await verification.save();

    const config = await deps.dynamicConfig.get();
    const provider = await deps.providerFactory.create();
    const nid = decryptField(verification.nidEncrypted);
    const dateOfBirth = decryptField(verification.dateOfBirthEncrypted);
    const claimedName = decryptField(verification.claimedNameEncrypted);
    const refs = JSON.parse(decryptField(verification.mediaRefsEncrypted)) as PrivateMediaRefs;
    const media = await deps.mediaResolver.createReadUrls(refs, 60);
    const request = { nid, dateOfBirth, claimedName, media, correlationId: verification.correlationId };

    try {
      // Cheap/document gates first. The EC identity/face call is skipped for unusable input.
      const ocr = await provider.parseOCR(request);
      if (ocr.confidence < 70) {
        await finalize(verification.id, verification.userId.toString(), verification.correlationId,
          "PENDING_MANUAL_REVIEW", ["OCR_CONFIDENCE_LOW"], deps.webhookQueue);
        return;
      }
      if (ocr.nid && normalizeOCRNID(ocr.nid, dateOfBirth) !== nid) {
        await finalize(verification.id, verification.userId.toString(), verification.correlationId,
          "PENDING_MANUAL_REVIEW", ["OCR_NID_MISMATCH"], deps.webhookQueue);
        return;
      }
      if (ocr.dateOfBirth && ocr.dateOfBirth !== dateOfBirth) {
        await finalize(verification.id, verification.userId.toString(), verification.correlationId,
          "PENDING_MANUAL_REVIEW", ["OCR_DOB_MISMATCH"], deps.webhookQueue);
        return;
      }

      const liveness = await provider.checkLiveness(request);
      const livenessPolicy = await evaluateLiveness(liveness, config, deps.redis);
      liveness.passed = livenessPolicy.passed;
      liveness.conclusive = liveness.conclusive && livenessPolicy.conclusive;
      if (!liveness.conclusive || !liveness.passed) {
        await finalize(verification.id, verification.userId.toString(), verification.correlationId,
          liveness.conclusive ? "REJECTED" : "PENDING_MANUAL_REVIEW",
          [liveness.conclusive ? "LIVENESS_FAILED" : "LIVENESS_INCONCLUSIVE"],
          deps.webhookQueue,
          { livenessPassed: false });
        return;
      }

      const identity = await provider.verifyIdentity(request);
      const duplicate = identity.faceEmbedding
        ? await deps.vectorStore.findDuplicate(identity.faceEmbedding, config.thresholds.biometricDuplicate)
        : null;
      const decision = decideEKYC({
        identity,
        ocr,
        liveness,
        claimedName,
        possibleBiometricDuplicate: Boolean(duplicate),
      }, config);

      if (decision.status === "VERIFIED") {
        try {
          const screening = await deps.screeningProvider.screen({
            name: claimedName,
            dateOfBirth,
            correlationId: verification.correlationId,
          });
          if (
            screening.sanctionsPotentialMatch ||
            screening.pepOrIpPotentialMatch ||
            screening.adverseMediaPotentialMatch
          ) {
            decision.status = "PENDING_MANUAL_REVIEW";
            decision.reasons = ["COMPLIANCE_SCREENING_REVIEW"];
          }
        } catch {
          decision.status = "PENDING_MANUAL_REVIEW";
          decision.reasons = ["SCREENING_UNAVAILABLE"];
        }
      }

      try {
        await EKYCVerification.updateOne(
          { _id: verification._id },
          { $set: {
            status: decision.status,
            reasonCodes: decision.reasons,
            providerName: provider.name,
            providerReferenceEncrypted: encryptField(identity.providerReference),
            faceScore: decision.faceScore,
            nameScore: decision.nameScore,
            livenessPassed: true,
            possibleDuplicateVectorId: duplicate?.pointId,
            decidedAt: new Date(),
          } }
        );
      } catch (error) {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
          await finalize(verification.id, verification.userId.toString(), verification.correlationId,
            "REJECTED", ["NID_ALREADY_VERIFIED"], deps.webhookQueue);
          return;
        }
        throw error;
      }

      await appendAuditEvent({
        verificationId: verification.id,
        eventType: "VERIFICATION_DECIDED",
        actorType: "SYSTEM",
        correlationId: verification.correlationId,
        metadata: {
          status: decision.status,
          reasons: decision.reasons,
          faceScore: decision.faceScore,
          nameScore: decision.nameScore,
          duplicateScore: duplicate?.score ?? null,
        },
      });
      if (decision.status === "VERIFIED" && identity.faceEmbedding) {
        await deps.vectorStore.saveVerifiedTemplate(
          verification.userId.toString(), verification.id, identity.faceEmbedding
        );
      }
      await enqueueStatusWebhook(deps.webhookQueue, {
        verificationId: verification.id,
        userId: verification.userId.toString(),
        status: decision.status,
        reasonCodes: decision.reasons,
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      const reason: EKYCReasonCode = error instanceof ECProviderError
        ? error.code === "TIMEOUT" ? "PROVIDER_TIMEOUT"
          : error.code === "INVALID_RESPONSE" ? "PROVIDER_RESPONSE_INVALID"
          : "PROVIDER_UNAVAILABLE"
        : "PROVIDER_UNAVAILABLE";
      await finalize(verification.id, verification.userId.toString(), verification.correlationId,
        "PENDING_MANUAL_REVIEW", [reason], deps.webhookQueue);
      // Timeout/5xx deliberately complete as manual review instead of failing/retrying the user flow.
      return;
    }
  }, {
    connection: deps.redis,
    concurrency: 8,
    lockDuration: 30_000,
  });
}
