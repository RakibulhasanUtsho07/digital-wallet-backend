"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminEKYCRouter = createAdminEKYCRouter;
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const zod_1 = require("zod");
const User_js_1 = require("../../../models/User.js");
const EKYCAuditEvent_js_1 = require("../models/EKYCAuditEvent.js");
const EKYCVerification_js_1 = require("../models/EKYCVerification.js");
const ekycRuntime_js_1 = require("../runtime/ekycRuntime.js");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
const auditService_js_1 = require("../services/auditService.js");
const manualReviewService_js_1 = require("../services/manualReviewService.js");
const statusProjectionService_js_1 = require("../services/statusProjectionService.js");
const rerunService_js_1 = require("../services/rerunService.js");
const statusValues = [
    "QUEUED",
    "PROCESSING",
    "VERIFIED",
    "PENDING_MANUAL_REVIEW",
    "REJECTED",
];
const listSchema = zod_1.z.object({
    status: zod_1.z.enum(statusValues).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
    search: zod_1.z.string().trim().max(100).optional(),
});
const decisionSchema = zod_1.z.object({
    decision: zod_1.z.enum(["VERIFIED", "REJECTED"]),
    reason: zod_1.z.string().trim().min(10).max(500),
}).strict();
function adminId(request) {
    const id = request.user?._id?.toString();
    if (!id)
        throw new Error("Authenticated administrator ID is unavailable.");
    return id;
}
function requireObjectId(value) {
    if (!mongoose_1.default.Types.ObjectId.isValid(value))
        throw new Error("Invalid verification ID.");
    return value;
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function safeVerification(value) {
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
        possibleDuplicateScore: typeof value.possibleDuplicateScore === "number" ? value.possibleDuplicateScore : null,
        submittedAt: value.submittedAt,
        processingStartedAt: value.processingStartedAt,
        decidedAt: value.decidedAt,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        hasReviewBiometricTemplate: Boolean(value.faceEmbeddingEncrypted),
    };
}
function routeError(error, response, next) {
    if (error instanceof zod_1.z.ZodError) {
        response.status(400).json({
            success: false,
            message: error.issues[0]?.message || "Invalid request.",
        });
        return;
    }
    if (error instanceof manualReviewService_js_1.ManualReviewConflictError ||
        error instanceof manualReviewService_js_1.ManualReviewDependencyError ||
        error instanceof manualReviewService_js_1.ManualReviewRequiresRerunError ||
        error instanceof rerunService_js_1.EKYCRerunConflictError ||
        error instanceof rerunService_js_1.EKYCRerunDependencyError) {
        response.status(error.statusCode).json({ success: false, message: error.message });
        return;
    }
    if (error instanceof Error && error.message === "Invalid verification ID.") {
        response.status(400).json({ success: false, message: error.message });
        return;
    }
    next(error);
}
function createAdminEKYCRouter() {
    const router = express_1.default.Router();
    router.use((_request, response, next) => {
        response.setHeader("Cache-Control", "no-store");
        next();
    });
    router.get("/overview", async (_request, response, next) => {
        try {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const [queued, processing, manualReview, verified, rejected, submittedToday, decisions] = await Promise.all([
                EKYCVerification_js_1.EKYCVerification.countDocuments({ status: "QUEUED" }),
                EKYCVerification_js_1.EKYCVerification.countDocuments({ status: "PROCESSING" }),
                EKYCVerification_js_1.EKYCVerification.countDocuments({ status: "PENDING_MANUAL_REVIEW" }),
                EKYCVerification_js_1.EKYCVerification.countDocuments({ status: "VERIFIED" }),
                EKYCVerification_js_1.EKYCVerification.countDocuments({ status: "REJECTED" }),
                EKYCVerification_js_1.EKYCVerification.countDocuments({ submittedAt: { $gte: today } }),
                EKYCVerification_js_1.EKYCVerification.find({
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
                .filter((value) => value !== null && Number.isFinite(value));
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
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/verifications", async (request, response, next) => {
        try {
            const query = listSchema.parse(request.query);
            const filter = {};
            if (query.status)
                filter.status = query.status;
            if (query.search) {
                const users = await User_js_1.User.find({ name: new RegExp(escapeRegex(query.search), "i") })
                    .select("_id")
                    .limit(200)
                    .lean();
                filter.userId = { $in: users.map((user) => user._id) };
            }
            const [records, total] = await Promise.all([
                EKYCVerification_js_1.EKYCVerification.find(filter)
                    .select("+faceEmbeddingEncrypted")
                    .populate("userId", "name role kycStatus")
                    .sort({ submittedAt: -1 })
                    .skip((query.page - 1) * query.limit)
                    .limit(query.limit)
                    .lean(),
                EKYCVerification_js_1.EKYCVerification.countDocuments(filter),
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
        }
        catch (error) {
            routeError(error, response, next);
        }
    });
    router.get("/verifications/:id", async (request, response, next) => {
        try {
            const id = requireObjectId(String(request.params.id));
            const verification = await EKYCVerification_js_1.EKYCVerification.findById(id)
                .select("+faceEmbeddingEncrypted")
                .populate("userId", "name role kycStatus")
                .lean();
            if (!verification) {
                response.status(404).json({ success: false, message: "e-KYC verification was not found." });
                return;
            }
            const audit = await EKYCAuditEvent_js_1.EKYCAuditEvent.find({ verificationId: id })
                .select("sequence eventType actorType createdAt")
                .sort({ sequence: 1 })
                .lean();
            response.status(200).json({
                success: true,
                verification: safeVerification(verification),
                audit,
            });
        }
        catch (error) {
            routeError(error, response, next);
        }
    });
    router.get("/verifications/:id/documents", async (request, response, next) => {
        try {
            const id = requireObjectId(String(request.params.id));
            const verification = await EKYCVerification_js_1.EKYCVerification.findById(id).select("+mediaRefsEncrypted");
            if (!verification) {
                response.status(404).json({ success: false, message: "e-KYC verification was not found." });
                return;
            }
            const runtime = await (0, ekycRuntime_js_1.getEKYCRuntime)();
            const refs = JSON.parse((0, fieldEncryption_js_1.decryptField)(verification.mediaRefsEncrypted));
            runtime.mediaStore.assertOwnedBy(refs, verification.userId.toString());
            const urls = await runtime.mediaStore.createReadUrls(refs, 300);
            await (0, auditService_js_1.appendAuditEvent)({
                verificationId: verification.id,
                eventType: "SENSITIVE_DOCUMENTS_VIEWED",
                actorType: "ADMIN",
                actorIdHash: (0, fieldEncryption_js_1.keyedLookupHash)(adminId(request), "vector-user"),
                correlationId: verification.correlationId,
                metadata: { expiresInSeconds: 300 },
            });
            response.status(200).json({ success: true, documents: urls, expiresInSeconds: 300 });
        }
        catch (error) {
            routeError(error, response, next);
        }
    });
    router.patch("/verifications/:id/decision", async (request, response, next) => {
        try {
            const id = requireObjectId(String(request.params.id));
            const body = decisionSchema.parse(request.body);
            const runtime = await (0, ekycRuntime_js_1.getEKYCRuntime)();
            const result = await (0, manualReviewService_js_1.applyManualReviewDecision)({
                verificationId: id,
                adminUserId: adminId(request),
                decision: body.decision,
                reason: body.reason,
            }, {
                webhookQueue: runtime.webhookQueue,
                vectorStore: runtime.vectorStore,
                projectStatus: statusProjectionService_js_1.projectEKYCStatusToUser,
            });
            response.status(200).json({ success: true, message: "Manual e-KYC decision saved.", result });
        }
        catch (error) {
            routeError(error, response, next);
        }
    });
    router.post("/verifications/:id/rerun", async (request, response, next) => {
        try {
            const id = requireObjectId(String(request.params.id));
            const runtime = await (0, ekycRuntime_js_1.getEKYCRuntime)();
            const result = await (0, rerunService_js_1.rerunEKYCVerification)({ verificationId: id, adminUserId: adminId(request) }, { queue: runtime.queue, projectStatus: statusProjectionService_js_1.projectEKYCStatusToUser });
            response.status(202).json({ success: true, message: "Automated e-KYC verification was requeued.", result });
        }
        catch (error) {
            routeError(error, response, next);
        }
    });
    return router;
}
exports.default = createAdminEKYCRouter;
