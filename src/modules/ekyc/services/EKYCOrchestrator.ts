import {
  randomUUID,
} from "node:crypto";

import type {
  Queue,
} from "bullmq";

import mongoose from "mongoose";

import {
  EKYCVerification,
} from "../models/EKYCVerification.js";

import {
  enqueueEKYC,
  type EKYCJobData,
} from "../queue/ekycQueue.js";

import type {
  EKYCRateLimiter,
} from "../rate-limit/EKYCRateLimiter.js";

import {
  encryptField,
  keyedLookupHash,
} from "../security/fieldEncryption.js";

import type {
  EKYCSubmission,
  PrivateMediaRefs,
} from "../types.js";

import {
  validateSubmissionIdentity,
} from "../validation.js";

import {
  appendAuditEvent,
} from "./auditService.js";

/* =========================================================
   TYPES
========================================================= */

export type EKYCSubmissionStatus =
  | "QUEUED"
  | "PENDING_MANUAL_REVIEW";

export interface EKYCSubmissionResult {
  verificationId: string;
  attemptId: string;
  status: EKYCSubmissionStatus;
}

export class EKYCAlreadyVerifiedError
  extends Error {
  readonly statusCode = 409;

  constructor() {
    super(
      "This account already has a verified e-KYC record."
    );

    this.name =
      "EKYCAlreadyVerifiedError";
  }
}

/* =========================================================
   PRIVATE OBJECT REFERENCE VALIDATION
========================================================= */

function validateObjectReference(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (
    normalized.length < 8 ||
    normalized.length > 500
  ) {
    throw new Error(
      `${fieldName} object reference is invalid.`
    );
  }

  /*
   * The API accepts an opaque private-storage reference,
   * not a public HTTP image URL.
   */
  if (
    normalized.includes(
      "://"
    )
  ) {
    throw new Error(
      `${fieldName} must be a private object reference, not a public URL.`
    );
  }

  if (
    normalized.includes(
      ".."
    )
  ) {
    throw new Error(
      `${fieldName} contains an invalid path segment.`
    );
  }

  if (
    !/^[A-Za-z0-9/_+=.@:-]+$/.test(
      normalized
    )
  ) {
    throw new Error(
      `${fieldName} contains unsupported characters.`
    );
  }

  return normalized;
}

function validateMediaReferences(
  media: PrivateMediaRefs
): PrivateMediaRefs {
  return {
    nidFrontObjectRef:
      validateObjectReference(
        media.nidFrontObjectRef,
        "NID front"
      ),

    nidBackObjectRef:
      validateObjectReference(
        media.nidBackObjectRef,
        "NID back"
      ),

    selfieObjectRef:
      validateObjectReference(
        media.selfieObjectRef,
        "Selfie"
      ),
  };
}

/* =========================================================
   ORCHESTRATOR
========================================================= */

export class EKYCOrchestrator {
  constructor(
    private readonly limiter:
      EKYCRateLimiter,

    private readonly queue:
      Queue<EKYCJobData>
  ) {}

  async submit(
    input: EKYCSubmission
  ): Promise<EKYCSubmissionResult> {
    /* -----------------------------------------------------
       Authentication identity validation
    ----------------------------------------------------- */

    if (
      !mongoose.Types.ObjectId.isValid(
        input.userId
      )
    ) {
      throw new Error(
        "Invalid authenticated user ID."
      );
    }

    if (
      !input.ipAddress?.trim() ||
      !input.deviceId?.trim()
    ) {
      throw new Error(
        "IP address and verified device ID are required."
      );
    }

    const correlationId =
      input.correlationId
        ?.trim()
        .slice(0, 120) ||
      randomUUID();

    /* -----------------------------------------------------
       Check already verified user
    ----------------------------------------------------- */

    const existingVerification =
      await EKYCVerification
        .exists({
          userId:
            input.userId,

          status:
            "VERIFIED",
        });

    if (
      existingVerification
    ) {
      throw new EKYCAlreadyVerifiedError();
    }

    /* -----------------------------------------------------
       Local validation before provider calls
    ----------------------------------------------------- */

    const identity =
      validateSubmissionIdentity(
        {
          nid:
            input.nid,

          dateOfBirth:
            input.dateOfBirth,

          claimedName:
            input.claimedName,
        }
      );

    const media =
      validateMediaReferences(
        input.media
      );

    const attemptId =
      randomUUID();

    /* -----------------------------------------------------
       Atomic multi-identifier rate limiting

       Tracks:
       - User ID
       - IP address
       - Device ID
    ----------------------------------------------------- */

    await this.limiter.consume({
      userId:
        input.userId,

      ipAddress:
        input.ipAddress,

      deviceId:
        input.deviceId,

      attemptId,
    });

    /* -----------------------------------------------------
       Encrypted database record
    ----------------------------------------------------- */

    const verification =
      await EKYCVerification.create({
        userId:
          input.userId,

        status:
          "QUEUED",

        reasonCodes: [],

        nidLookupHash:
          keyedLookupHash(
            identity.normalizedNid,
            "nid"
          ),

        nidEncrypted:
          encryptField(
            identity.normalizedNid
          ),

        dateOfBirthEncrypted:
          encryptField(
            input.dateOfBirth
          ),

        claimedNameEncrypted:
          encryptField(
            identity.claimedName
          ),

        mediaRefsEncrypted:
          encryptField(
            JSON.stringify(
              media
            )
          ),

        correlationId,
        attemptId,

        submittedAt:
          new Date(),
      });

    /* -----------------------------------------------------
       Submission audit
    ----------------------------------------------------- */

    await appendAuditEvent({
      verificationId:
        verification.id,

      eventType:
        "VERIFICATION_SUBMITTED",

      actorType:
        "USER",

      actorIdHash:
        keyedLookupHash(
          input.userId,
          "vector-user"
        ),

      correlationId,

      metadata: {
        status:
          "QUEUED",

        attemptId,

        inputValidation:
          "PASSED",

        mediaReferenceCount:
          3,
      },
    });

    /* -----------------------------------------------------
       Queue background processing
    ----------------------------------------------------- */

    try {
      await enqueueEKYC(
        this.queue,
        {
          verificationId:
            verification.id,

          attemptId,
        }
      );
    } catch {
      /*
       * Redis/BullMQ failure must not incorrectly reject
       * the customer. Send the verification to the admin
       * review queue instead.
       */

      await EKYCVerification.updateOne(
        {
          _id:
            verification._id,

          status:
            "QUEUED",
        },
        {
          $set: {
            status:
              "PENDING_MANUAL_REVIEW",

            reasonCodes: [
              "PROVIDER_UNAVAILABLE",
            ],

            decidedAt:
              new Date(),
          },
        }
      );

      await appendAuditEvent({
        verificationId:
          verification.id,

        eventType:
          "QUEUE_ENQUEUE_FAILED",

        actorType:
          "SYSTEM",

        correlationId,

        metadata: {
          previousStatus:
            "QUEUED",

          fallbackStatus:
            "PENDING_MANUAL_REVIEW",

          attemptId,
        },
      });

      return {
        verificationId:
          verification.id,

        attemptId,

        status:
          "PENDING_MANUAL_REVIEW",
      };
    }

    await appendAuditEvent({
      verificationId:
        verification.id,

      eventType:
        "VERIFICATION_ENQUEUED",

      actorType:
        "SYSTEM",

      correlationId,

      metadata: {
        queue:
          "ekyc-processing-v1",

        attemptId,
      },
    });

    return {
      verificationId:
        verification.id,

      attemptId,

      status:
        "QUEUED",
    };
  }
}

export default EKYCOrchestrator;