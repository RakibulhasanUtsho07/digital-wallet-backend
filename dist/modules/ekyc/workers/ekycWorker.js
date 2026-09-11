"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEKYCWorker = createEKYCWorker;
const mongoose_1 = __importDefault(require("mongoose"));
const bullmq_1 = require("bullmq");
const livenessPolicy_js_1 = require("../liveness/livenessPolicy.js");
const EKYCVerification_js_1 = require("../models/EKYCVerification.js");
const RealECEKYCProvider_js_1 = require("../providers/RealECEKYCProvider.js");
const ekycQueue_js_1 = require("../queue/ekycQueue.js");
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
const decisionEngine_js_1 = require("../services/decisionEngine.js");
const auditService_js_1 = require("../services/auditService.js");
const webhookService_js_1 = require("../webhooks/webhookService.js");
function normalizeOCRNID(value, dateOfBirth) {
    const digits = value.replace(/\D/g, "");
    return digits.length === 13 ? `${dateOfBirth.slice(0, 4)}${digits}` : digits;
}
async function finalize(verificationId, userId, correlationId, status, reasonCodes, webhookQueue, extra = {}) {
    await EKYCVerification_js_1.EKYCVerification.updateOne({ _id: verificationId }, { $set: { status, reasonCodes, decidedAt: new Date(), ...extra } });
    await (0, auditService_js_1.appendAuditEvent)({
        verificationId,
        eventType: "VERIFICATION_DECIDED",
        actorType: "SYSTEM",
        correlationId,
        metadata: { status, reasonCodes },
    });
    await (0, webhookService_js_1.enqueueStatusWebhook)(webhookQueue, {
        verificationId,
        userId,
        status,
        reasonCodes,
        occurredAt: new Date().toISOString(),
    });
}
function createEKYCWorker(deps) {
    return new bullmq_1.Worker(ekycQueue_js_1.EKYC_QUEUE_NAME, async (job) => {
        const verification = await EKYCVerification_js_1.EKYCVerification.findById(job.data.verificationId)
            .select("+nidEncrypted +dateOfBirthEncrypted +claimedNameEncrypted +mediaRefsEncrypted +nidLookupHash");
        if (!verification || verification.attemptId !== job.data.attemptId)
            return;
        if (!["QUEUED", "PROCESSING"].includes(verification.status))
            return;
        verification.status = "PROCESSING";
        await verification.save();
        const config = await deps.dynamicConfig.get();
        const provider = await deps.providerFactory.create();
        const nid = (0, fieldEncryption_js_1.decryptField)(verification.nidEncrypted);
        const dateOfBirth = (0, fieldEncryption_js_1.decryptField)(verification.dateOfBirthEncrypted);
        const claimedName = (0, fieldEncryption_js_1.decryptField)(verification.claimedNameEncrypted);
        const refs = JSON.parse((0, fieldEncryption_js_1.decryptField)(verification.mediaRefsEncrypted));
        const media = await deps.mediaResolver.createReadUrls(refs, 60);
        const request = { nid, dateOfBirth, claimedName, media, correlationId: verification.correlationId };
        try {
            // Cheap/document gates first. The EC identity/face call is skipped for unusable input.
            const ocr = await provider.parseOCR(request);
            if (ocr.confidence < 70) {
                await finalize(verification.id, verification.userId.toString(), verification.correlationId, "PENDING_MANUAL_REVIEW", ["OCR_CONFIDENCE_LOW"], deps.webhookQueue);
                return;
            }
            if (ocr.nid && normalizeOCRNID(ocr.nid, dateOfBirth) !== nid) {
                await finalize(verification.id, verification.userId.toString(), verification.correlationId, "PENDING_MANUAL_REVIEW", ["OCR_NID_MISMATCH"], deps.webhookQueue);
                return;
            }
            if (ocr.dateOfBirth && ocr.dateOfBirth !== dateOfBirth) {
                await finalize(verification.id, verification.userId.toString(), verification.correlationId, "PENDING_MANUAL_REVIEW", ["OCR_DOB_MISMATCH"], deps.webhookQueue);
                return;
            }
            const liveness = await provider.checkLiveness(request);
            const livenessPolicy = await (0, livenessPolicy_js_1.evaluateLiveness)(liveness, config, deps.redis);
            liveness.passed = livenessPolicy.passed;
            liveness.conclusive = liveness.conclusive && livenessPolicy.conclusive;
            if (!liveness.conclusive || !liveness.passed) {
                await finalize(verification.id, verification.userId.toString(), verification.correlationId, liveness.conclusive ? "REJECTED" : "PENDING_MANUAL_REVIEW", [liveness.conclusive ? "LIVENESS_FAILED" : "LIVENESS_INCONCLUSIVE"], deps.webhookQueue, { livenessPassed: false });
                return;
            }
            const identity = await provider.verifyIdentity(request);
            const duplicate = identity.faceEmbedding
                ? await deps.vectorStore.findDuplicate(identity.faceEmbedding, config.thresholds.biometricDuplicate)
                : null;
            const decision = (0, decisionEngine_js_1.decideEKYC)({
                identity,
                ocr,
                liveness,
                claimedName,
                possibleBiometricDuplicate: Boolean(duplicate),
            }, config);
            if (decision.status === "VERIFIED") {
                try {
                    const screening = await deps.screeningProvider.screen({
                        name: claimedName,
                        dateOfBirth,
                        correlationId: verification.correlationId,
                    });
                    if (screening.sanctionsPotentialMatch ||
                        screening.pepOrIpPotentialMatch ||
                        screening.adverseMediaPotentialMatch) {
                        decision.status = "PENDING_MANUAL_REVIEW";
                        decision.reasons = ["COMPLIANCE_SCREENING_REVIEW"];
                    }
                }
                catch {
                    decision.status = "PENDING_MANUAL_REVIEW";
                    decision.reasons = ["SCREENING_UNAVAILABLE"];
                }
            }
            try {
                await EKYCVerification_js_1.EKYCVerification.updateOne({ _id: verification._id }, { $set: {
                        status: decision.status,
                        reasonCodes: decision.reasons,
                        providerName: provider.name,
                        providerReferenceEncrypted: (0, fieldEncryption_js_1.encryptField)(identity.providerReference),
                        faceScore: decision.faceScore,
                        nameScore: decision.nameScore,
                        livenessPassed: true,
                        possibleDuplicateVectorId: duplicate?.pointId,
                        decidedAt: new Date(),
                    } });
            }
            catch (error) {
                if (error instanceof mongoose_1.default.mongo.MongoServerError && error.code === 11000) {
                    await finalize(verification.id, verification.userId.toString(), verification.correlationId, "REJECTED", ["NID_ALREADY_VERIFIED"], deps.webhookQueue);
                    return;
                }
                throw error;
            }
            await (0, auditService_js_1.appendAuditEvent)({
                verificationId: verification.id,
                eventType: "VERIFICATION_DECIDED",
                actorType: "SYSTEM",
                correlationId: verification.correlationId,
                metadata: {
                    status: decision.status,
                    reasons: decision.reasons,
                    faceScore: decision.faceScore,
                    nameScore: decision.nameScore,
                    duplicateScore: duplicate?.score ?? null,
                },
            });
            if (decision.status === "VERIFIED" && identity.faceEmbedding) {
                await deps.vectorStore.saveVerifiedTemplate(verification.userId.toString(), verification.id, identity.faceEmbedding);
            }
            await (0, webhookService_js_1.enqueueStatusWebhook)(deps.webhookQueue, {
                verificationId: verification.id,
                userId: verification.userId.toString(),
                status: decision.status,
                reasonCodes: decision.reasons,
                occurredAt: new Date().toISOString(),
            });
        }
        catch (error) {
            const reason = error instanceof RealECEKYCProvider_js_1.ECProviderError
                ? error.code === "TIMEOUT" ? "PROVIDER_TIMEOUT"
                    : error.code === "INVALID_RESPONSE" ? "PROVIDER_RESPONSE_INVALID"
                        : "PROVIDER_UNAVAILABLE"
                : "PROVIDER_UNAVAILABLE";
            await finalize(verification.id, verification.userId.toString(), verification.correlationId, "PENDING_MANUAL_REVIEW", [reason], deps.webhookQueue);
            // Timeout/5xx deliberately complete as manual review instead of failing/retrying the user flow.
            return;
        }
    }, {
        connection: deps.redis,
        concurrency: 8,
        lockDuration: 30_000,
    });
}
