import express, { type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import type { AuthRequest } from "../../../middlewares/authMiddleware.js";
import { User } from "../../../models/User.js";
import { EKYCAuditEvent } from "../models/EKYCAuditEvent.js";
import { EKYCVerification } from "../models/EKYCVerification.js";
import { getEKYCRuntime } from "../runtime/ekycRuntime.js";
import { decryptField, keyedLookupHash } from "../security/fieldEncryption.js";
import { appendAuditEvent } from "../services/auditService.js";
import {
  applyManualReviewDecision,
  ManualReviewConflictError,
  ManualReviewDependencyError,
  ManualReviewRequiresRerunError,
} from "../services/manualReviewService.js";

import { projectEKYCStatusToUser } from "../services/statusProjectionService.js";
import type { EKYCStatus, PrivateMediaRefs } from "../types.js";
import { EKYCRerunConflictError, EKYCRerunDependencyError, rerunEKYCVerification } from "../services/rerunService.js";

const statusValues: EKYCStatus[] = [
  "QUEUED",
  "PROCESSING",
  "VERIFIED",
  "PENDING_MANUAL_REVIEW",
  "REJECTED",
];

const listSchema = z.object({
  status: z.enum(statusValues as [EKYCStatus, ...EKYCStatus[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional(),
});

const decisionSchema = z.object({
  decision: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().trim().min(10).max(500),
}).strict();

function adminId(request: Request): string {
  const id = (request as AuthRequest).user?._id?.toString();
  if (!id) throw new Error("Authenticated administrator ID is unavailable.");
  return id;
}

function requireObjectId(value: string): string {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error("Invalid verification ID.");
  return value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeVerification(value: any) {
  const user = value.userId && typeof value.userId === "object" && "name" in value.userId
    ? value.userId
    : null;
  return {
    id: String(value._id),
    user: user ? {
      id: String(user._id),
      name: String(user.name || "Unknown user"),
      role: String(user.role || "user"),
      kycStatus: String(user.kycStatus || "pending"),
    } : { id: String(value.userId), name: "Unknown user", role: "user", kycStatus: "pending" },
    status: value.status,
    reasonCodes: Array.isArray(value.reasonCodes) ? value.reasonCodes : [],
    providerName: value.providerName,
    faceScore: typeof value.faceScore === "number" ? value.faceScore : null,
    nameScore: typeof value.nameScore === "number" ? value.nameScore : null,
    livenessPassed: typeof value.livenessPassed === "boolean" ? value.livenessPassed : null,
    possibleDuplicateVectorId: value.possibleDuplicateVectorId,
    possibleDuplicateScore:
      typeof value.possibleDuplicateScore === "number" ? value.possibleDuplicateScore : null,
    submittedAt: value.submittedAt,
    processingStartedAt: value.processingStartedAt,
    decidedAt: value.decidedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    hasReviewBiometricTemplate: Boolean(value.faceEmbeddingEncrypted),
  };
}

function routeError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({
      success: false,
      message: error.issues[0]?.message || "Invalid request.",
    });
    return;
  }
  if (
    error instanceof ManualReviewConflictError ||
    error instanceof ManualReviewDependencyError ||
    error instanceof ManualReviewRequiresRerunError ||
    error instanceof EKYCRerunConflictError||
    error instanceof EKYCRerunDependencyError
  ) {
    response.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  if (error instanceof Error && error.message === "Invalid verification ID.") {
    response.status(400).json({ success: false, message: error.message });
    return;
  }
  next(error);
}

export function createAdminEKYCRouter(): express.Router {
  const router = express.Router();

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/overview", async (_request, response, next) => {
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const [queued, processing, manualReview, verified, rejected, submittedToday, decisions] =
        await Promise.all([
          EKYCVerification.countDocuments({ status: "QUEUED" }),
          EKYCVerification.countDocuments({ status: "PROCESSING" }),
          EKYCVerification.countDocuments({ status: "PENDING_MANUAL_REVIEW" }),
          EKYCVerification.countDocuments({ status: "VERIFIED" }),
          EKYCVerification.countDocuments({ status: "REJECTED" }),
          EKYCVerification.countDocuments({ submittedAt: { $gte: today } }),
          EKYCVerification.find({
            submittedAt: { $type: "date" },
            decidedAt: { $type: "date" },
            status: { $in: ["VERIFIED", "REJECTED", "PENDING_MANUAL_REVIEW"] },
          })
            .select("submittedAt decidedAt")
            .sort({ decidedAt: -1 })
            .limit(250)
            .lean(),
        ]);

      const minutes = decisions
        .map((item) => {
          const start = item.submittedAt?.getTime();
          const end = item.decidedAt?.getTime();
          return typeof start === "number" && typeof end === "number" && end >= start
            ? (end - start) / 60_000
            : null;
        })
        .filter((value): value is number => value !== null && Number.isFinite(value));

      response.status(200).json({
        success: true,
        overview: {
          queued,
          processing,
          manualReview,
          verified,
          rejected,
          submittedToday,
          total: queued + processing + manualReview + verified + rejected,
          averageDecisionMinutes: minutes.length
            ? Number((minutes.reduce((sum, value) => sum + value, 0) / minutes.length).toFixed(2))
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/verifications", async (request, response, next) => {
    try {
      const query = listSchema.parse(request.query);
      const filter: Record<string, unknown> = {};
      if (query.status) filter.status = query.status;
      if (query.search) {
        const users = await User.find({ name: new RegExp(escapeRegex(query.search), "i") })
          .select("_id")
          .limit(200)
          .lean();
        filter.userId = { $in: users.map((user) => user._id) };
      }

      const [records, total] = await Promise.all([
        EKYCVerification.find(filter)
          .select("+faceEmbeddingEncrypted")
          .populate("userId", "name role kycStatus")
          .sort({ submittedAt: -1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .lean(),
        EKYCVerification.countDocuments(filter),
      ]);

      response.status(200).json({
        success: true,
        verifications: records.map(safeVerification),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        },
      });
    } catch (error) {
      routeError(error, response, next);
    }
  });

  router.get("/verifications/:id", async (request, response, next) => {
    try {
      const id = requireObjectId(String(request.params.id));
      const verification = await EKYCVerification.findById(id)
        .select("+faceEmbeddingEncrypted")
        .populate("userId", "name role kycStatus")
        .lean();
      if (!verification) {
        response.status(404).json({ success: false, message: "e-KYC verification was not found." });
        return;
      }

      const audit = await EKYCAuditEvent.find({ verificationId: id })
        .select("sequence eventType actorType createdAt")
        .sort({ sequence: 1 })
        .lean();
      response.status(200).json({
        success: true,
        verification: safeVerification(verification),
        audit,
      });
    } catch (error) {
      routeError(error, response, next);
    }
  });

  router.get("/verifications/:id/documents", async (request, response, next) => {
    try {
      const id = requireObjectId(String(request.params.id));
      const verification = await EKYCVerification.findById(id).select("+mediaRefsEncrypted");
      if (!verification) {
        response.status(404).json({ success: false, message: "e-KYC verification was not found." });
        return;
      }
      const runtime = await getEKYCRuntime();
      const refs = JSON.parse(decryptField(verification.mediaRefsEncrypted)) as PrivateMediaRefs;
      runtime.mediaStore.assertOwnedBy(refs, verification.userId.toString());
      const urls = await runtime.mediaStore.createReadUrls(refs, 300);
      await appendAuditEvent({
        verificationId: verification.id,
        eventType: "SENSITIVE_DOCUMENTS_VIEWED",
        actorType: "ADMIN",
        actorIdHash: keyedLookupHash(adminId(request), "vector-user"),
        correlationId: verification.correlationId,
        metadata: { expiresInSeconds: 300 },
      });
      response.status(200).json({ success: true, documents: urls, expiresInSeconds: 300 });
    } catch (error) {
      routeError(error, response, next);
    }
  });

  router.patch("/verifications/:id/decision", async (request, response, next) => {
    try {
      const id = requireObjectId(String(request.params.id));
      const body = decisionSchema.parse(request.body);
      const runtime = await getEKYCRuntime();
      const result = await applyManualReviewDecision(
        {
          verificationId: id,
          adminUserId: adminId(request),
          decision: body.decision,
          reason: body.reason,
        },
        {
          webhookQueue: runtime.webhookQueue,
          vectorStore: runtime.vectorStore,
          projectStatus: projectEKYCStatusToUser,
        }
      );
      response.status(200).json({ success: true, message: "Manual e-KYC decision saved.", result });
    } catch (error) {
      routeError(error, response, next);
    }
  });

  router.post("/verifications/:id/rerun", async (request, response, next) => {
    try {
      const id = requireObjectId(String(request.params.id));
      const runtime = await getEKYCRuntime();
      const result = await rerunEKYCVerification(
        { verificationId: id, adminUserId: adminId(request) },
        { queue: runtime.queue, projectStatus: projectEKYCStatusToUser }
      );
      response.status(202).json({ success: true, message: "Automated e-KYC verification was requeued.", result });
    } catch (error) {
      routeError(error, response, next);
    }
  });

  return router;
}

export default createAdminEKYCRouter;
