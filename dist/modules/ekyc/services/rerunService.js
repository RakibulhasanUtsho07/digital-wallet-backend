"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EKYCRerunDependencyError = exports.EKYCRerunConflictError = void 0;
exports.rerunEKYCVerification = rerunEKYCVerification;
const node_crypto_1 = require("node:crypto");
const mongoose_1 = __importDefault(require("mongoose"));
const EKYCVerification_js_1 = require("../models/EKYCVerification.js");
const ekycQueue_js_1 = require("../queue/ekycQueue.js");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
const auditService_js_1 = require("./auditService.js");
class EKYCRerunConflictError extends Error {
    statusCode = 409;
    constructor() {
        super("This verification cannot be rerun because it is not available for manual review.");
        this.name = "EKYCRerunConflictError";
    }
}
exports.EKYCRerunConflictError = EKYCRerunConflictError;
class EKYCRerunDependencyError extends Error {
    statusCode = 503;
    constructor() {
        super("Automated e-KYC processing is temporarily unavailable. The case remains in manual review.");
        this.name = "EKYCRerunDependencyError";
    }
}
exports.EKYCRerunDependencyError = EKYCRerunDependencyError;
async function rerunEKYCVerification(input, dependencies) {
    if (!mongoose_1.default.Types.ObjectId.isValid(input.verificationId))
        throw new Error("Invalid verification ID.");
    if (!mongoose_1.default.Types.ObjectId.isValid(input.adminUserId))
        throw new Error("Invalid admin user ID.");
    const attemptId = (0, node_crypto_1.randomUUID)();
    const now = new Date();
    const verification = await EKYCVerification_js_1.EKYCVerification.findOneAndUpdate({
        _id: input.verificationId,
        status: "PENDING_MANUAL_REVIEW",
        $or: [
            { manualReviewLock: { $exists: false } },
            { manualReviewLockExpiresAt: { $lte: now } },
        ],
    }, {
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
            screeningReferenceEncrypted: 1,
            faceEmbeddingEncrypted: 1,
            faceScore: 1,
            nameScore: 1,
            livenessPassed: 1,
            possibleDuplicateVectorId: 1,
            possibleDuplicateScore: 1,
            manualReviewLock: 1,
            manualReviewLockExpiresAt: 1,
        },
    }, { new: true, runValidators: true });
    if (!verification)
        throw new EKYCRerunConflictError();
    try {
        await (0, ekycQueue_js_1.enqueueEKYC)(dependencies.queue, { verificationId: verification.id, attemptId });
    }
    catch {
        await EKYCVerification_js_1.EKYCVerification.updateOne({ _id: verification._id, attemptId, status: "QUEUED" }, {
            $set: {
                status: "PENDING_MANUAL_REVIEW",
                reasonCodes: ["PROVIDER_UNAVAILABLE"],
                decidedAt: new Date(),
            },
        });
        await (0, auditService_js_1.appendAuditEvent)({
            verificationId: verification.id,
            eventType: "RERUN_QUEUE_ENQUEUE_FAILED",
            actorType: "SYSTEM",
            correlationId: verification.correlationId,
            idempotencyKey: `rerun-queue-failed:${attemptId}`,
            metadata: { fallbackStatus: "PENDING_MANUAL_REVIEW" },
        }).catch(() => undefined);
        await dependencies.projectStatus(verification.userId.toString(), "PENDING_MANUAL_REVIEW").catch(() => undefined);
        throw new EKYCRerunDependencyError();
    }
    await (0, auditService_js_1.appendAuditEvent)({
        verificationId: verification.id,
        eventType: "ADMIN_RERUN_REQUESTED",
        actorType: "ADMIN",
        actorIdHash: (0, fieldEncryption_js_1.keyedLookupHash)(input.adminUserId, "vector-user"),
        correlationId: verification.correlationId,
        idempotencyKey: `rerun:${attemptId}`,
        metadata: { status: "QUEUED" },
    });
    await dependencies.projectStatus(verification.userId.toString(), "QUEUED");
    return { verificationId: verification.id, status: "QUEUED" };
}
