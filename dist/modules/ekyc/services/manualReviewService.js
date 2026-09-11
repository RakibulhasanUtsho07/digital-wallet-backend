"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualReviewRequiresRerunError = exports.ManualReviewDependencyError = exports.ManualReviewConflictError = void 0;
exports.applyManualReviewDecision = applyManualReviewDecision;
const mongoose_1 = __importDefault(require("mongoose"));
const EKYCVerification_js_1 = require("../models/EKYCVerification.js");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
const webhookService_js_1 = require("../webhooks/webhookService.js");
const auditService_js_1 = require("./auditService.js");
class ManualReviewConflictError extends Error {
    statusCode = 409;
    constructor(message) {
        super(message);
        this.name = "ManualReviewConflictError";
    }
}
exports.ManualReviewConflictError = ManualReviewConflictError;
class ManualReviewDependencyError extends Error {
    statusCode = 424;
    constructor(message) {
        super(message);
        this.name = "ManualReviewDependencyError";
    }
}
exports.ManualReviewDependencyError = ManualReviewDependencyError;
class ManualReviewRequiresRerunError extends Error {
    statusCode = 400;
    constructor(message) {
        super(message);
        this.name = "ManualReviewRequiresRerunError";
    }
}
exports.ManualReviewRequiresRerunError = ManualReviewRequiresRerunError;
/* =========================================================
   VALIDATION
========================================================= */
function normalizeReviewReason(value) {
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
async function applyManualReviewDecision(input, dependencies) {
    if (!mongoose_1.default.Types.ObjectId.isValid(input.verificationId)) {
        throw new Error("Invalid verification ID.");
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(input.adminUserId)) {
        throw new Error("Invalid admin user ID.");
    }
    const reason = normalizeReviewReason(input.reason);
    const reasonCodes = ["ADMIN_OVERRIDE"];
    /*
     * Atomic status condition prevents two admins
     * from reviewing the same record simultaneously.
     */
    let verification;
    try {
        verification = await EKYCVerification_js_1.EKYCVerification.findOneAndUpdate({
            _id: input.verificationId,
            status: "PENDING_MANUAL_REVIEW",
        }, {
            $set: {
                status: input.decision,
                reasonCodes,
                decidedAt: new Date(),
            },
        }, {
            new: true,
            runValidators: true,
        });
    }
    catch (error) {
        if (error instanceof mongoose_1.default.mongo.MongoServerError && error.code === 11000) {
            throw new ManualReviewConflictError("This NID or user already has a verified e-KYC record.");
        }
        throw error;
    }
    if (!verification) {
        const exists = await EKYCVerification_js_1.EKYCVerification.exists({ _id: input.verificationId });
        if (!exists) {
            throw new Error("e-KYC verification was not found.");
        }
        throw new ManualReviewConflictError("This verification is no longer awaiting manual review.");
    }
    /* =======================================================
       IMMUTABLE AUDIT EVENT
    ======================================================= */
    await (0, auditService_js_1.appendAuditEvent)({
        verificationId: verification.id,
        eventType: "ADMIN_OVERRIDE",
        actorType: "ADMIN",
        actorIdHash: (0, fieldEncryption_js_1.keyedLookupHash)(input.adminUserId, "vector-user"),
        correlationId: verification.correlationId,
        metadata: {
            decision: input.decision,
            previousStatus: "PENDING_MANUAL_REVIEW",
            newStatus: input.decision,
            reasonEncrypted: (0, fieldEncryption_js_1.encryptField)(reason),
        },
    });
    /* =======================================================
       WEBHOOK DELIVERY
    ======================================================= */
    let webhookQueued = false;
    try {
        await (0, webhookService_js_1.enqueueStatusWebhook)(dependencies.webhookQueue, {
            verificationId: verification.id,
            userId: verification.userId.toString(),
            status: verification.status,
            reasonCodes,
            occurredAt: new Date().toISOString(),
        });
        webhookQueued = true;
    }
    catch {
        try {
            await (0, auditService_js_1.appendAuditEvent)({
                verificationId: verification.id,
                eventType: "WEBHOOK_ENQUEUE_FAILED",
                actorType: "SYSTEM",
                correlationId: verification.correlationId,
                metadata: {
                    status: verification.status,
                    event: "EKYC_STATUS_CHANGED",
                },
            });
        }
        catch {
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
