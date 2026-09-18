import type { Queue } from "bullmq";
import mongoose from "mongoose";
import { EKYCVerification } from "../models/EKYCVerification.js";
import { decryptField, encryptField, keyedLookupHash } from "../security/fieldEncryption.js";
import type { EKYCReasonCode } from "../types.js";
import type { IFaceVectorStore } from "../vector/QdrantFaceVectorStore.js";
import { enqueueStatusWebhook, type EKYCWebhookJobData } from "../webhooks/webhookService.js";
import { appendAuditEvent } from "./auditService.js";
import type { EKYCStatusProjector } from "./statusProjectionService.js";

/* =========================================================
   TYPES & ERRORS
========================================================= */

export type ManualReviewDecision = "VERIFIED" | "REJECTED";

export interface ManualReviewInput {
  verificationId: string;
  adminUserId: string;
  decision: ManualReviewDecision;
  reason: string;
}

export interface ManualReviewResult {
  verificationId: string;
  status: ManualReviewDecision;
  webhookQueued: boolean;
}

export class ManualReviewConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ManualReviewConflictError";
  }
}

export class ManualReviewDependencyError extends Error {
  readonly statusCode = 424;
  constructor(message: string) {
    super(message);
    this.name = "ManualReviewDependencyError";
  }
}

export class ManualReviewRequiresRerunError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ManualReviewRequiresRerunError";
  }
}

/* =========================================================
   VALIDATION
========================================================= */

function normalizeReviewReason(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 10) {
    throw new Error("Manual review reason must contain at least 10 characters.");
  }
  if (normalized.length > 500) {
    throw new Error("Manual review reason cannot exceed 500 characters.");
  }
  return normalized;
}

/* =========================================================
   APPLY ADMIN DECISION
========================================================= */

export async function applyManualReviewDecision(
  input: ManualReviewInput,
  dependencies: {
    webhookQueue: Queue<EKYCWebhookJobData>;
    vectorStore: IFaceVectorStore;
    projectStatus: EKYCStatusProjector;
  }
): Promise<ManualReviewResult> {
  if (!mongoose.Types.ObjectId.isValid(input.verificationId)) {
    throw new Error("Invalid verification ID.");
  }

  if (!mongoose.Types.ObjectId.isValid(input.adminUserId)) {
    throw new Error("Invalid admin user ID.");
  }

  const reason = normalizeReviewReason(input.reason);
  const current = await EKYCVerification.findById(input.verificationId)
    .select("+faceEmbeddingEncrypted status reasonCodes userId correlationId");
  if (!current) throw new Error("e-KYC verification was not found.");
  if (current.status !== "PENDING_MANUAL_REVIEW") {
    throw new ManualReviewConflictError("This verification is no longer awaiting manual review.");
  }

  const reasonCodes: EKYCReasonCode[] = [
    ...new Set<EKYCReasonCode>([...(current.reasonCodes || []), "ADMIN_OVERRIDE"]),
  ];
  let vectorSaved = false;

  if (input.decision === "VERIFIED") {
    if (!current.faceEmbeddingEncrypted) {
      throw new ManualReviewRequiresRerunError(
        "Approval requires a successful face embedding. Re-run automated checks first."
      );
    }
    const embedding = JSON.parse(decryptField(current.faceEmbeddingEncrypted)) as number[];
    try {
      await dependencies.vectorStore.saveVerifiedTemplate(
        current.userId.toString(),
        current.id,
        embedding
      );
      vectorSaved = true;
    } catch {
      throw new ManualReviewDependencyError(
        "The biometric duplicate store is unavailable; approval was not saved."
      );
    }
  }

  /*
   * Atomic status condition prevents two admins
   * from reviewing the same record simultaneously.
   */
  let verification;

  try {
    verification = await EKYCVerification.findOneAndUpdate(
      {
        _id: input.verificationId,
        status: "PENDING_MANUAL_REVIEW",
      },
      {
        $set: {
          status: input.decision,
          activeAttempt: false,
          reasonCodes,
          decidedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );
  } catch (error) {
    if (vectorSaved) {
      await dependencies.vectorStore.removeVerifiedTemplate(input.verificationId).catch(() => undefined);
    }
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      throw new ManualReviewConflictError("This NID or user already has a verified e-KYC record.");
    }
    throw error;
  }

  if (!verification) {
    if (vectorSaved) {
      await dependencies.vectorStore.removeVerifiedTemplate(input.verificationId).catch(() => undefined);
    }
    const exists = await EKYCVerification.exists({ _id: input.verificationId });
    if (!exists) {
      throw new Error("e-KYC verification was not found.");
    }
    throw new ManualReviewConflictError("This verification is no longer awaiting manual review.");
  }

  /* =======================================================
     IMMUTABLE AUDIT EVENT
  ======================================================= */

  await appendAuditEvent({
    verificationId: verification.id,
    eventType: "ADMIN_OVERRIDE",
    actorType: "ADMIN",
    actorIdHash: keyedLookupHash(input.adminUserId, "vector-user"),
    correlationId: verification.correlationId,
    metadata: {
      decision: input.decision,
      previousStatus: "PENDING_MANUAL_REVIEW",
      newStatus: input.decision,
      reasonEncrypted: encryptField(reason),
    },
  });

  await dependencies.projectStatus(
    verification.userId.toString(),
    input.decision
  );

  /* =======================================================
     WEBHOOK DELIVERY
  ======================================================= */

  let webhookQueued = false;

  try {
    await enqueueStatusWebhook(dependencies.webhookQueue, {
      verificationId: verification.id,
      userId: verification.userId.toString(),
      status: verification.status,
      reasonCodes,
      occurredAt: new Date().toISOString(),
    });
    webhookQueued = true;
  } catch {
    try {
      await appendAuditEvent({
        verificationId: verification.id,
        eventType: "WEBHOOK_ENQUEUE_FAILED",
        actorType: "SYSTEM",
        correlationId: verification.correlationId,
        metadata: {
          status: verification.status,
          event: "EKYC_STATUS_CHANGED",
        },
      });
    } catch {
      console.error("EKYC AUDIT AND WEBHOOK ENQUEUE FAILURE:", {
        verificationId: verification.id,
      });
    }
  }

  return {
    verificationId: verification.id,
    status: input.decision,
    webhookQueued,
  };
}
