import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import type { AuthRequest } from "../../../middlewares/authMiddleware.js";
import { User } from "../../../models/User.js";
import { ActiveLivenessSessionError } from "../biometrics/activeLivenessService.js";
import { getOrIssueEKYCDeviceId } from "../middleware/deviceIdentity.js";
import { ekycEvidenceUpload } from "../middleware/ekycUpload.js";
import {
  EKYCMediaValidationError,
  type EKYCEvidenceFiles,
} from "../media/CloudinaryPrivateMediaStore.js";
import { EKYCVerification } from "../models/EKYCVerification.js";
import { EKYCRateLimitError } from "../rate-limit/EKYCRateLimiter.js";
import { getEKYCRuntime } from "../runtime/ekycRuntime.js";
import {
  EKYCActiveAttemptError,
  EKYCAlreadyVerifiedError,
  EKYCSubmissionRecoveryError,
} from "../services/EKYCOrchestrator.js";
import type {
  ActiveLivenessAction,
  EKYCReasonCode,
  EKYCStatus,
  FingerprintEvidence,
  PrivateMediaRefs,
} from "../types.js";
import { InputValidationError } from "../validation.js";

const submissionSchema = z.object({
  claimedName: z.string().trim().min(2).max(160).optional(),
  dateOfBirth: z.string().trim().length(10),
  nid: z.string().trim().min(10).max(24).optional(),
  documentNumber: z.string().trim().min(10).max(24).optional(),
  documentType: z.string().trim().toLowerCase().optional(),
  livenessSessionId: z.string().uuid(),
  livenessChallenges: z.string().trim().min(2).max(200),
  livenessStartedAt: z.string().datetime(),
  livenessCompletedAt: z.string().datetime(),
  fingerprintProviderCaptureReference: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .regex(/^[A-Za-z0-9._:-]+$/, "Invalid provider fingerprint capture reference.")
    .optional(),
  fingerprintCapturedAt: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (!value.nid && !value.documentNumber) {
    context.addIssue({ code: "custom", message: "NID number is required." });
  }
  if (value.documentType && value.documentType !== "nid") {
    context.addIssue({ code: "custom", message: "Advanced e-KYC currently supports Bangladesh NID only." });
  }
});

function requiresProviderFingerprint(): boolean {
  const configured = process.env.EKYC_REQUIRE_PROVIDER_FINGERPRINT?.trim();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

function parseLivenessChallenges(value: string): ActiveLivenessAction[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      parsed.some((item) => !["BLINK", "TURN_LEFT", "TURN_RIGHT"].includes(String(item)))
    ) {
      throw new Error("Invalid challenge sequence.");
    }
    return parsed as ActiveLivenessAction[];
  } catch {
    throw new InputValidationError(
      "The active-liveness challenge sequence is invalid.",
      "LIVENESS_CHALLENGE_INVALID"
    );
  }
}

const publicRejectionReasons = new Set<EKYCReasonCode>([
  "AGE_UNDER_18",
  "INVALID_IDENTITY_INPUT",
  "NID_MISMATCH",
  "DOB_MISMATCH",
  "OCR_NID_MISMATCH",
  "OCR_DOB_MISMATCH",
  "FACE_SCORE_REJECTED",
  "LIVENESS_FAILED",
  "FINGERPRINT_MISMATCH",
  "NID_ALREADY_VERIFIED",
  "ADMIN_OVERRIDE",
]);

function getUserId(request: Request): string {
  const user = (request as AuthRequest).user;
  const userId = user?._id?.toString();
  if (!userId) throw new Error("Authenticated user ID is unavailable.");
  return userId;
}

function toClientVerification(value: {
  _id: unknown;
  status: EKYCStatus;
  reasonCodes?: EKYCReasonCode[];
  submittedAt?: Date;
  decidedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: String(value._id),
    status: value.status,
    reasonCodes: value.status === "REJECTED"
      ? (value.reasonCodes || []).filter((reason) => publicRejectionReasons.has(reason))
      : [],
    submittedAt: value.submittedAt,
    decidedAt: value.decidedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    canResubmit: value.status === "REJECTED",
  };
}

function getFiles(request: Request): EKYCEvidenceFiles {
  const files = request.files as Record<string, Express.Multer.File[]> | undefined;
  const nidFront = files?.frontImage?.[0];
  const nidBack = files?.backImage?.[0];
  const selfie = files?.selfieImage?.[0];
  const livenessVideo = files?.livenessEvidence?.[0];
  if (!nidFront || !nidBack || !selfie || !livenessVideo) {
    throw new InputValidationError(
      "NID front, NID back, selfie, and active-liveness recording are all required.",
      "MEDIA_REQUIRED"
    );
  }
  return { nidFront, nidBack, selfie, livenessVideo };
}

function handleSubmissionError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof multer.MulterError) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      success: false,
      message: error.code === "LIMIT_FILE_SIZE"
        ? "Images must be 1 MB or smaller and the liveness recording must be 8 MB or smaller."
        : error.message,
    });
    return;
  }
  if (
    error instanceof z.ZodError ||
    error instanceof InputValidationError ||
    error instanceof EKYCMediaValidationError ||
    error instanceof ActiveLivenessSessionError
  ) {
    response.status(400).json({
      success: false,
      code: error instanceof InputValidationError ? error.code : "VALIDATION_ERROR",
      message: error instanceof z.ZodError
        ? error.issues[0]?.message || "Invalid e-KYC request."
        : error.message,
    });
    return;
  }
  if (error instanceof EKYCRateLimitError) {
    response.status(429).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof EKYCAlreadyVerifiedError || error instanceof EKYCActiveAttemptError) {
    response.status(409).json({
      success: false,
      message: error.message,
      ...(error instanceof EKYCActiveAttemptError && error.verificationId
        ? { verificationId: error.verificationId }
        : {}),
    });
    return;
  }
  if (error instanceof EKYCSubmissionRecoveryError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
      verificationId: error.verificationId,
    });
    return;
  }
  next(error);
}

export function createEKYCRouter(): express.Router {
  const router = express.Router();

  router.post("/liveness/challenges", async (request, response, next) => {
    try {
      const userId = getUserId(request);
      const deviceId = getOrIssueEKYCDeviceId(request, response);
      const runtime = await getEKYCRuntime();
      const session = await runtime.activeLiveness.create(userId, deviceId);
      response.setHeader("Cache-Control", "no-store");
      response.status(201).json({ success: true, session });
    } catch (error) {
      handleSubmissionError(error, response, next);
    }
  });

  router.get("/verifications/current", async (request, response, next) => {
    try {
      const userId = getUserId(request);
      const verification = await EKYCVerification.findOne({ userId })
        .sort({ createdAt: -1 })
        .select("status reasonCodes submittedAt decidedAt createdAt updatedAt")
        .lean();
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({
        success: true,
        verification: verification ? toClientVerification(verification) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/verifications/:id", async (request, response, next) => {
    try {
      const userId = getUserId(request);
      const id = String(request.params.id);
      if (!/^[a-f\d]{24}$/i.test(id)) {
        response.status(400).json({ success: false, message: "Invalid verification ID." });
        return;
      }
      const verification = await EKYCVerification.findOne({ _id: id, userId })
        .select("status reasonCodes submittedAt decidedAt createdAt updatedAt")
        .lean();
      if (!verification) {
        response.status(404).json({ success: false, message: "e-KYC verification was not found." });
        return;
      }
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json({ success: true, verification: toClientVerification(verification) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/verifications", (request, response, next) => {
    ekycEvidenceUpload(request, response, (uploadError) => {
      if (uploadError) {
        handleSubmissionError(uploadError, response, next);
        return;
      }

      void (async () => {
        let uploadedRefs: PrivateMediaRefs | undefined;
        try {
          const body = submissionSchema.parse(request.body);
          const userId = getUserId(request);
          const user = await User.findById(userId).select("name accountStatus").lean();
          if (!user || user.accountStatus === "deleted") {
            response.status(404).json({ success: false, message: "User account was not found." });
            return;
          }

          const claimedName = body.claimedName || user.name;
          const nid = body.nid || body.documentNumber || "";
          const files = getFiles(request);
          const runtime = await getEKYCRuntime();
          const deviceId = getOrIssueEKYCDeviceId(request, response);
          const liveness = await runtime.activeLiveness.consume({
            sessionId: body.livenessSessionId,
            userId,
            deviceId,
            challenges: parseLivenessChallenges(body.livenessChallenges),
            startedAt: body.livenessStartedAt,
            completedAt: body.livenessCompletedAt,
          });

          let fingerprint: FingerprintEvidence | undefined;

          if (body.fingerprintProviderCaptureReference && body.fingerprintCapturedAt) {
            fingerprint = {
              captureId: randomUUID(),
              mode: "PROVIDER",
              providerCaptureReference: body.fingerprintProviderCaptureReference,
              qualityScore: 100,
              capturedAt: body.fingerprintCapturedAt,
            };
          } else if (requiresProviderFingerprint()) {
            throw new InputValidationError(
              "A provider-issued fingerprint capture reference is required.",
              "FINGERPRINT_PROVIDER_CAPTURE_REQUIRED"
            );
          }

          uploadedRefs = await runtime.mediaStore.uploadAttempt(userId, files);
          runtime.mediaStore.assertOwnedBy(uploadedRefs, userId);

          const result = await runtime.orchestrator.submit({
            userId,
            nid,
            dateOfBirth: body.dateOfBirth,
            claimedName,
            media: uploadedRefs,
            liveness,
            fingerprint,
            ipAddress: request.ip || request.socket.remoteAddress || "unavailable",
            deviceId,
            correlationId: String(request.get("x-correlation-id") || randomUUID()).slice(0, 120),
          });

          uploadedRefs = undefined;
          response.setHeader("Cache-Control", "no-store");
          response.status(202).json({
            success: true,
            message: result.status === "QUEUED"
              ? "Advanced e-KYC verification was queued successfully."
              : "Your application requires manual review.",
            verification: {
              id: result.verificationId,
              status: result.status,
              reasonCodes: [],
              canResubmit: false,
            },
          });
        } catch (error) {
          if (uploadedRefs && !(error instanceof EKYCSubmissionRecoveryError)) {
            const runtime = await getEKYCRuntime().catch(() => null);
            await runtime?.mediaStore.deleteEvidence(uploadedRefs).catch(() => undefined);
          }
          handleSubmissionError(error, response, next);
        }
      })();
    });
  });

  return router;
}

export default createEKYCRouter;
