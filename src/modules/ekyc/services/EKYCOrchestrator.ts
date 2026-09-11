import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { Queue } from "bullmq";
import { EKYCVerification } from "../models/EKYCVerification.js";
import { enqueueEKYC, type EKYCJobData } from "../queue/ekycQueue.js";
import type { EKYCRateLimiter } from "../rate-limit/EKYCRateLimiter.js";
import { encryptField, keyedLookupHash } from "../security/fieldEncryption.js";
import type { EKYCSubmission } from "../types.js";
import { validateSubmissionIdentity } from "../validation.js";
import { appendAuditEvent } from "./auditService.js";
import type { EKYCStatusProjector } from "./statusProjectionService.js";

export class EKYCAlreadyVerifiedError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("This account already has a verified identity.");
    this.name = "EKYCAlreadyVerifiedError";
  }
}

export class EKYCActiveAttemptError extends Error {
  readonly statusCode = 409;
  constructor(readonly verificationId?: string) {
    super("An e-KYC verification is already in progress for this account.");
    this.name = "EKYCActiveAttemptError";
  }
}

export class EKYCSubmissionRecoveryError extends Error {
  readonly statusCode = 503;

  constructor(readonly verificationId: string) {
    super(
      "The verification was accepted but processing could not be scheduled. Support can recover it using the verification ID."
    );
    this.name = "EKYCSubmissionRecoveryError";
  }
}

export class EKYCOrchestrator {
  constructor(
    private readonly limiter: EKYCRateLimiter,
    private readonly queue: Queue<EKYCJobData>,
    private readonly projectStatus: EKYCStatusProjector
  ) {}

  async submit(input: EKYCSubmission): Promise<{
    verificationId: string;
    status: "QUEUED" | "PENDING_MANUAL_REVIEW";
  }> {
    if (!mongoose.Types.ObjectId.isValid(input.userId)) {
      throw new Error("Invalid authenticated user ID.");
    }

    const identity = validateSubmissionIdentity(input);
    const verified = await EKYCVerification.exists({ userId: input.userId, status: "VERIFIED" });
    if (verified) throw new EKYCAlreadyVerifiedError();

    const active = await EKYCVerification.findOne({
      userId: input.userId,
      activeAttempt: true,
    }).select("_id").lean();
    if (active) throw new EKYCActiveAttemptError(String(active._id));

    const attemptId = randomUUID();

    const fingerprintMaterial = input.fingerprint
      ? input.fingerprint.mode === "MOCK"
        ? input.fingerprint.templateBase64
        : input.fingerprint.providerCaptureReference
      : undefined;

    if (input.fingerprint && !fingerprintMaterial) {
      throw new Error("The supplied fingerprint evidence is invalid.");
    }
    await this.limiter.consume({
      userId: input.userId,
      ipAddress: input.ipAddress,
      deviceId: input.deviceId,
      attemptId,
    });

    let verification;
    try {
      verification = await EKYCVerification.create({
        userId: input.userId,
        status: "QUEUED",
        activeAttempt: true,
        reasonCodes: [],
        nidLookupHash: keyedLookupHash(identity.normalizedNid, "nid"),
        nidEncrypted: encryptField(identity.normalizedNid),
        dateOfBirthEncrypted: encryptField(input.dateOfBirth),
        claimedNameEncrypted: encryptField(identity.claimedName),
        mediaRefsEncrypted: encryptField(JSON.stringify(input.media)),
        livenessEvidenceEncrypted: encryptField(JSON.stringify(input.liveness)),
        ...(input.fingerprint && fingerprintMaterial
          ? {
              fingerprintEvidenceEncrypted: encryptField(JSON.stringify(input.fingerprint)),
              fingerprintTemplateHash: keyedLookupHash(fingerprintMaterial, "fingerprint"),
            }
          : {}),
        correlationId: input.correlationId,
        attemptId,
        submittedAt: new Date(),
      });
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
        throw new EKYCActiveAttemptError();
      }
      throw error;
    }

    try {
      await appendAuditEvent({
        verificationId: verification.id,
        eventType: "VERIFICATION_SUBMITTED",
        actorType: "USER",
        actorIdHash: keyedLookupHash(input.userId, "vector-user"),
        correlationId: input.correlationId,
        idempotencyKey: `submitted:${attemptId}`,
        metadata: {
          status: "QUEUED",
          mediaReferenceCount: 4,
          livenessChallengeCount: input.liveness.challenges.length,
          fingerprintMode: input.fingerprint?.mode ?? "NOT_COLLECTED",
        },
      });
    } catch (error) {
      console.error("EKYC SUBMISSION AUDIT WRITE FAILED:", {
        verificationId: verification.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    try {
      await this.projectStatus(input.userId, "QUEUED");
    } catch (error) {
      console.error("EKYC INITIAL STATUS PROJECTION FAILED:", {
        verificationId: verification.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    try {
      await enqueueEKYC(this.queue, { verificationId: verification.id, attemptId });
    } catch {
      try {
        await EKYCVerification.updateOne(
          { _id: verification._id, status: "QUEUED" },
          {
            $set: {
              status: "PENDING_MANUAL_REVIEW",
              reasonCodes: ["PROVIDER_UNAVAILABLE"],
              decidedAt: new Date(),
            },
          }
        );
      } catch (recoveryError) {
        console.error("EKYC QUEUE FAILURE RECOVERY FAILED:", {
          verificationId: verification.id,
          message: recoveryError instanceof Error ? recoveryError.message : "Unknown error",
        });
        throw new EKYCSubmissionRecoveryError(verification.id);
      }

      await appendAuditEvent({
        verificationId: verification.id,
        eventType: "QUEUE_ENQUEUE_FAILED",
        actorType: "SYSTEM",
        correlationId: input.correlationId,
        idempotencyKey: `queue-failed:${attemptId}`,
        metadata: { fallbackStatus: "PENDING_MANUAL_REVIEW" },
      }).catch((auditError) => {
        console.error("EKYC QUEUE FAILURE AUDIT WRITE FAILED:", {
          verificationId: verification.id,
          message: auditError instanceof Error ? auditError.message : "Unknown error",
        });
      });
      await this.projectStatus(input.userId, "PENDING_MANUAL_REVIEW").catch((projectionError) => {
        console.error("EKYC FALLBACK STATUS PROJECTION FAILED:", {
          verificationId: verification.id,
          message: projectionError instanceof Error ? projectionError.message : "Unknown error",
        });
      });
      return { verificationId: verification.id, status: "PENDING_MANUAL_REVIEW" };
    }

    return { verificationId: verification.id, status: "QUEUED" };
  }
}
