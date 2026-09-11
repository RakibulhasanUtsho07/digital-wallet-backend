"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EKYCOrchestrator = exports.EKYCAlreadyVerifiedError = void 0;
const node_crypto_1 = require("node:crypto");
const mongoose_1 = __importDefault(require("mongoose"));
const EKYCVerification_js_1 = require("../models/EKYCVerification.js");
const ekycQueue_js_1 = require("../queue/ekycQueue.js");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
const validation_js_1 = require("../validation.js");
const auditService_js_1 = require("./auditService.js");
class EKYCAlreadyVerifiedError extends Error {
    statusCode = 409;
    constructor() {
        super("This account already has a verified e-KYC record.");
        this.name =
            "EKYCAlreadyVerifiedError";
    }
}
exports.EKYCAlreadyVerifiedError = EKYCAlreadyVerifiedError;
/* =========================================================
   PRIVATE OBJECT REFERENCE VALIDATION
========================================================= */
function validateObjectReference(value, fieldName) {
    const normalized = value.trim();
    if (normalized.length < 8 ||
        normalized.length > 500) {
        throw new Error(`${fieldName} object reference is invalid.`);
    }
    /*
     * The API accepts an opaque private-storage reference,
     * not a public HTTP image URL.
     */
    if (normalized.includes("://")) {
        throw new Error(`${fieldName} must be a private object reference, not a public URL.`);
    }
    if (normalized.includes("..")) {
        throw new Error(`${fieldName} contains an invalid path segment.`);
    }
    if (!/^[A-Za-z0-9/_+=.@:-]+$/.test(normalized)) {
        throw new Error(`${fieldName} contains unsupported characters.`);
    }
    return normalized;
}
function validateMediaReferences(media) {
    return {
        nidFrontObjectRef: validateObjectReference(media.nidFrontObjectRef, "NID front"),
        nidBackObjectRef: validateObjectReference(media.nidBackObjectRef, "NID back"),
        selfieObjectRef: validateObjectReference(media.selfieObjectRef, "Selfie"),
    };
}
/* =========================================================
   ORCHESTRATOR
========================================================= */
class EKYCOrchestrator {
    limiter;
    queue;
    constructor(limiter, queue) {
        this.limiter = limiter;
        this.queue = queue;
    }
    async submit(input) {
        /* -----------------------------------------------------
           Authentication identity validation
        ----------------------------------------------------- */
        if (!mongoose_1.default.Types.ObjectId.isValid(input.userId)) {
            throw new Error("Invalid authenticated user ID.");
        }
        if (!input.ipAddress?.trim() ||
            !input.deviceId?.trim()) {
            throw new Error("IP address and verified device ID are required.");
        }
        const correlationId = input.correlationId
            ?.trim()
            .slice(0, 120) ||
            (0, node_crypto_1.randomUUID)();
        /* -----------------------------------------------------
           Check already verified user
        ----------------------------------------------------- */
        const existingVerification = await EKYCVerification_js_1.EKYCVerification
            .exists({
            userId: input.userId,
            status: "VERIFIED",
        });
        if (existingVerification) {
            throw new EKYCAlreadyVerifiedError();
        }
        /* -----------------------------------------------------
           Local validation before provider calls
        ----------------------------------------------------- */
        const identity = (0, validation_js_1.validateSubmissionIdentity)({
            nid: input.nid,
            dateOfBirth: input.dateOfBirth,
            claimedName: input.claimedName,
        });
        const media = validateMediaReferences(input.media);
        const attemptId = (0, node_crypto_1.randomUUID)();
        /* -----------------------------------------------------
           Atomic multi-identifier rate limiting
    
           Tracks:
           - User ID
           - IP address
           - Device ID
        ----------------------------------------------------- */
        await this.limiter.consume({
            userId: input.userId,
            ipAddress: input.ipAddress,
            deviceId: input.deviceId,
            attemptId,
        });
        /* -----------------------------------------------------
           Encrypted database record
        ----------------------------------------------------- */
        const verification = await EKYCVerification_js_1.EKYCVerification.create({
            userId: input.userId,
            status: "QUEUED",
            reasonCodes: [],
            nidLookupHash: (0, fieldEncryption_js_1.keyedLookupHash)(identity.normalizedNid, "nid"),
            nidEncrypted: (0, fieldEncryption_js_1.encryptField)(identity.normalizedNid),
            dateOfBirthEncrypted: (0, fieldEncryption_js_1.encryptField)(input.dateOfBirth),
            claimedNameEncrypted: (0, fieldEncryption_js_1.encryptField)(identity.claimedName),
            mediaRefsEncrypted: (0, fieldEncryption_js_1.encryptField)(JSON.stringify(media)),
            correlationId,
            attemptId,
            submittedAt: new Date(),
        });
        /* -----------------------------------------------------
           Submission audit
        ----------------------------------------------------- */
        await (0, auditService_js_1.appendAuditEvent)({
            verificationId: verification.id,
            eventType: "VERIFICATION_SUBMITTED",
            actorType: "USER",
            actorIdHash: (0, fieldEncryption_js_1.keyedLookupHash)(input.userId, "vector-user"),
            correlationId,
            metadata: {
                status: "QUEUED",
                attemptId,
                inputValidation: "PASSED",
                mediaReferenceCount: 3,
            },
        });
        /* -----------------------------------------------------
           Queue background processing
        ----------------------------------------------------- */
        try {
            await (0, ekycQueue_js_1.enqueueEKYC)(this.queue, {
                verificationId: verification.id,
                attemptId,
            });
        }
        catch {
            /*
             * Redis/BullMQ failure must not incorrectly reject
             * the customer. Send the verification to the admin
             * review queue instead.
             */
            await EKYCVerification_js_1.EKYCVerification.updateOne({
                _id: verification._id,
                status: "QUEUED",
            }, {
                $set: {
                    status: "PENDING_MANUAL_REVIEW",
                    reasonCodes: [
                        "PROVIDER_UNAVAILABLE",
                    ],
                    decidedAt: new Date(),
                },
            });
            await (0, auditService_js_1.appendAuditEvent)({
                verificationId: verification.id,
                eventType: "QUEUE_ENQUEUE_FAILED",
                actorType: "SYSTEM",
                correlationId,
                metadata: {
                    previousStatus: "QUEUED",
                    fallbackStatus: "PENDING_MANUAL_REVIEW",
                    attemptId,
                },
            });
            return {
                verificationId: verification.id,
                attemptId,
                status: "PENDING_MANUAL_REVIEW",
            };
        }
        await (0, auditService_js_1.appendAuditEvent)({
            verificationId: verification.id,
            eventType: "VERIFICATION_ENQUEUED",
            actorType: "SYSTEM",
            correlationId,
            metadata: {
                queue: "ekyc-processing-v1",
                attemptId,
            },
        });
        return {
            verificationId: verification.id,
            attemptId,
            status: "QUEUED",
        };
    }
}
exports.EKYCOrchestrator = EKYCOrchestrator;
exports.default = EKYCOrchestrator;
