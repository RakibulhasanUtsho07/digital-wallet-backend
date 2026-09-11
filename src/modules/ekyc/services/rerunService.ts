import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";
import mongoose from "mongoose";
import { EKYCVerification } from "../models/EKYCVerification.js";
import { enqueueEKYC, type EKYCJobData } from "../queue/ekycQueue.js";
import { keyedLookupHash } from "../security/fieldEncryption.js";
import { appendAuditEvent } from "./auditService.js";
import type { EKYCStatusProjector } from "./statusProjectionService.js";

export class EKYCRerunConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("This verification cannot be rerun because it is not available for manual review.");
    this.name = "EKYCRerunConflictError";
  }
}

export class EKYCRerunDependencyError extends Error {
  readonly statusCode = 503;

  constructor() {
    super("Automated e-KYC processing is temporarily unavailable. The case remains in manual review.");
    this.name = "EKYCRerunDependencyError";
  }
}

export async function rerunEKYCVerification(
  input: { verificationId: string; adminUserId: string },
  dependencies: { queue: Queue<EKYCJobData>; projectStatus: EKYCStatusProjector }
): Promise<{ verificationId: string; status: "QUEUED" }> {
  if (!mongoose.Types.ObjectId.isValid(input.verificationId)) throw new Error("Invalid verification ID.");
  if (!mongoose.Types.ObjectId.isValid(input.adminUserId)) throw new Error("Invalid admin user ID.");

  const attemptId = randomUUID();
  const now = new Date();
  const verification = await EKYCVerification.findOneAndUpdate(
    {
      _id: input.verificationId,
      status: "PENDING_MANUAL_REVIEW",
      $or: [
        { manualReviewLock: { $exists: false } },
        { manualReviewLockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: "QUEUED",
        activeAttempt: true,
        attemptId,
        reasonCodes: [],
      },
      $unset: {
        decidedAt: 1,
        processingStartedAt: 1,
        providerReferenceEncrypted: 1,
        fingerprintProviderReferenceEncrypted: 1,
        screeningReferenceEncrypted: 1,
        faceEmbeddingEncrypted: 1,
        faceScore: 1,
        nameScore: 1,
        livenessPassed: 1,
        fingerprintMatched: 1,
        fingerprintConclusive: 1,
        fingerprintScore: 1,
        possibleDuplicateVectorId: 1,
        possibleDuplicateScore: 1,
        manualReviewLock: 1,
        manualReviewLockExpiresAt: 1,
      },
    },
    { new: true, runValidators: true }
  );
  if (!verification) throw new EKYCRerunConflictError();

  try {
    await enqueueEKYC(dependencies.queue, { verificationId: verification.id, attemptId });
  } catch {
    await EKYCVerification.updateOne(
      { _id: verification._id, attemptId, status: "QUEUED" },
      {
        $set: {
          status: "PENDING_MANUAL_REVIEW",
          reasonCodes: ["PROVIDER_UNAVAILABLE"],
          decidedAt: new Date(),
        },
      }
    );
    await appendAuditEvent({
      verificationId: verification.id,
      eventType: "RERUN_QUEUE_ENQUEUE_FAILED",
      actorType: "SYSTEM",
      correlationId: verification.correlationId,
      idempotencyKey: `rerun-queue-failed:${attemptId}`,
      metadata: { fallbackStatus: "PENDING_MANUAL_REVIEW" },
    }).catch(() => undefined);
    await dependencies.projectStatus(
      verification.userId.toString(),
      "PENDING_MANUAL_REVIEW"
    ).catch(() => undefined);
    throw new EKYCRerunDependencyError();
  }

  await appendAuditEvent({
    verificationId: verification.id,
    eventType: "ADMIN_RERUN_REQUESTED",
    actorType: "ADMIN",
    actorIdHash: keyedLookupHash(input.adminUserId, "vector-user"),
    correlationId: verification.correlationId,
    idempotencyKey: `rerun:${attemptId}`,
    metadata: { status: "QUEUED" },
  });
  await dependencies.projectStatus(verification.userId.toString(), "QUEUED");
  return { verificationId: verification.id, status: "QUEUED" };
}
