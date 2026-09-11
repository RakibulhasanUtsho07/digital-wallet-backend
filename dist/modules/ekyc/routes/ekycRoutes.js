"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEKYCRouter = createEKYCRouter;
const node_crypto_1 = require("node:crypto");
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const EKYCVerification_js_1 = require("../models/EKYCVerification.js");
const EKYCRateLimiter_js_1 = require("../rate-limit/EKYCRateLimiter.js");
const EKYCOrchestrator_js_1 = require("../services/EKYCOrchestrator.js");
const validation_js_1 = require("../validation.js");
/* =========================================================
   REQUEST SCHEMA
========================================================= */
const submissionSchema = zod_1.z
    .object({
    nid: zod_1.z
        .string()
        .trim()
        .min(10)
        .max(24),
    dateOfBirth: zod_1.z
        .string()
        .trim()
        .length(10),
    claimedName: zod_1.z
        .string()
        .trim()
        .min(2)
        .max(160),
    media: zod_1.z
        .object({
        nidFrontObjectRef: zod_1.z
            .string()
            .trim()
            .min(8)
            .max(500),
        nidBackObjectRef: zod_1.z
            .string()
            .trim()
            .min(8)
            .max(500),
        selfieObjectRef: zod_1.z
            .string()
            .trim()
            .min(8)
            .max(500),
    })
        .strict(),
})
    .strict();
/* =========================================================
   ROUTER FACTORY
========================================================= */
function createEKYCRouter(orchestrator, getAuthContext) {
    const router = express_1.default.Router();
    /* -------------------------------------------------------
       CREATE VERIFICATION
    ------------------------------------------------------- */
    router.post("/verifications", async (req, res, next) => {
        try {
            const body = submissionSchema.parse(req.body);
            const auth = getAuthContext(req);
            const forwardedCorrelationId = req.get("x-correlation-id");
            const correlationId = (forwardedCorrelationId ||
                (0, node_crypto_1.randomUUID)())
                .replace(/[^A-Za-z0-9_.:-]/g, "")
                .slice(0, 120);
            const result = await orchestrator.submit({
                userId: auth.userId,
                nid: body.nid,
                dateOfBirth: body.dateOfBirth,
                claimedName: body.claimedName,
                media: body.media,
                ipAddress: req.ip ||
                    req.socket
                        .remoteAddress ||
                    "unknown",
                deviceId: auth.deviceId,
                correlationId,
            });
            res.setHeader("Cache-Control", "no-store");
            res.status(202).json({
                success: true,
                message: result.status ===
                    "QUEUED"
                    ? "e-KYC verification has been queued."
                    : "e-KYC verification requires manual review.",
                ...result,
            });
        }
        catch (error) {
            if (error instanceof
                zod_1.z.ZodError) {
                res
                    .status(400)
                    .json({
                    success: false,
                    message: error
                        .issues[0]
                        ?.message ||
                        "Invalid e-KYC request.",
                });
                return;
            }
            if (error instanceof
                validation_js_1.InputValidationError) {
                res
                    .status(400)
                    .json({
                    success: false,
                    code: error.code,
                    message: error.message,
                });
                return;
            }
            if (error instanceof
                EKYCRateLimiter_js_1.EKYCRateLimitError) {
                res
                    .status(429)
                    .json({
                    success: false,
                    message: error.message,
                });
                return;
            }
            if (error instanceof
                EKYCOrchestrator_js_1.EKYCAlreadyVerifiedError) {
                res
                    .status(409)
                    .json({
                    success: false,
                    message: error.message,
                });
                return;
            }
            next(error);
        }
    });
    /* -------------------------------------------------------
       GET VERIFICATION STATUS
    ------------------------------------------------------- */
    router.get("/verifications/:id", async (req, res, next) => {
        try {
            const auth = getAuthContext(req);
            const verificationId = String(req.params.id);
            if (!/^[a-f\d]{24}$/i.test(verificationId)) {
                res
                    .status(400)
                    .json({
                    success: false,
                    message: "Invalid verification ID.",
                });
                return;
            }
            const verification = await EKYCVerification_js_1.EKYCVerification
                .findOne({
                _id: verificationId,
                userId: auth.userId,
            })
                .select([
                "status",
                "reasonCodes",
                "faceScore",
                "nameScore",
                "livenessPassed",
                "submittedAt",
                "decidedAt",
                "createdAt",
                "updatedAt",
            ].join(" "))
                .lean();
            if (!verification) {
                res
                    .status(404)
                    .json({
                    success: false,
                    message: "e-KYC verification was not found.",
                });
                return;
            }
            res.setHeader("Cache-Control", "no-store");
            res
                .status(200)
                .json({
                success: true,
                verification,
            });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
exports.default = createEKYCRouter;
