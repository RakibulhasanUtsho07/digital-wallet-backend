import type { Queue } from "bullmq";
import mongoose from "mongoose";
import { EKYCVerification } from "../models/EKYCVerification.js";
import { encryptField, keyedLookupHash } from "../security/fieldEncryption.js";
import type { EKYCReasonCode } from "../types.js";
import { enqueueStatusWebhook, type EKYCWebhookJobData } from "../webhooks/webhookService.js";
import { appendAuditEvent } from "./auditService.js";

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
    vectorStore?: any;
    projectStatus?: any;
  }
): Promise<ManualReviewResult> {
  if (!mongoose.Types.ObjectId.isValid(input.verificationId)) {
    throw new Error("Invalid verification ID.");
  }

  if (!mongoose.Types.ObjectId.isValid(input.adminUserId)) {
    throw new Error("Invalid admin user ID.");
  }

  const reason = normalizeReviewReason(input.reason);
  const reasonCodes: EKYCReasonCode[] = ["ADMIN_OVERRIDE"];

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
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      throw new ManualReviewConflictError("This NID or user already has a verified e-KYC record.");
    }
    throw error;
  }

  if (!verification) {
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