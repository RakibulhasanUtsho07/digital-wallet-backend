"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoredKycAiReview = exports.runKycAiReviewForKyc = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const KYC_js_1 = require("../models/KYC.js");
const KYCAIReview_js_1 = require("../models/KYCAIReview.js");
/*
 * Gemini structured-output schema.
 * Keep this to the JSON Schema subset supported by Gemini.
 * Length limits are enforced again locally after parsing.
 */
const REVIEW_SCHEMA = {
    type: "object",
    properties: {
        recommendation: {
            type: "string",
            enum: [
                "likely_clear",
                "manual_review",
                "likely_reject",
            ],
        },
        confidence: {
            type: "number",
            minimum: 0,
            maximum: 100,
        },
        riskLevel: {
            type: "string",
            enum: [
                "Low",
                "Medium",
                "High",
                "Critical",
            ],
        },
        summary: {
            type: "string",
        },
        reasons: {
            type: "array",
            items: {
                type: "string",
            },
            maxItems: 6,
        },
        missingSignals: {
            type: "array",
            items: {
                type: "string",
            },
            maxItems: 6,
        },
    },
    required: [
        "recommendation",
        "confidence",
        "riskLevel",
        "summary",
        "reasons",
        "missingSignals",
    ],
    additionalProperties: false,
};
const clampConfidence = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const trimList = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item) => typeof item === "string")
        .map((item) => item
        .trim()
        .slice(0, 300))
        .filter(Boolean)
        .slice(0, 6);
};
const normalizeModelOutput = (value) => {
    const item = (value &&
        typeof value === "object"
        ? value
        : {});
    const recommendation = item.recommendation === "likely_clear" ||
        item.recommendation === "likely_reject"
        ? item.recommendation
        : "manual_review";
    const riskLevel = item.riskLevel === "Low" ||
        item.riskLevel === "Medium" ||
        item.riskLevel === "High" ||
        item.riskLevel === "Critical"
        ? item.riskLevel
        : "Medium";
    return {
        recommendation,
        confidence: clampConfidence(item.confidence),
        riskLevel,
        summary: typeof item.summary === "string"
            ? item.summary
                .trim()
                .slice(0, 1200)
            : "The automated screening did not return a summary.",
        reasons: trimList(item.reasons),
        missingSignals: trimList(item.missingSignals),
    };
};
const buildSignals = (kyc) => ({
    documentType: String(kyc.documentType ||
        "unknown"),
    provider: String(kyc.provider ||
        "manual"),
    status: String(kyc.status ||
        "unknown"),
    hasFrontImage: Boolean(kyc.frontImagePublicId),
    hasBackImage: Boolean(kyc.backImagePublicId),
    hasSelfieImage: Boolean(kyc.selfieImagePublicId),
    submittedAt: kyc.submittedAt instanceof Date
        ? kyc.submittedAt.toISOString()
        : typeof kyc.submittedAt === "string"
            ? kyc.submittedAt
            : null,
    priorRiskLevel: typeof kyc.riskLevel === "string"
        ? kyc.riskLevel
        : null,
    priorRiskScore: typeof kyc.riskScore === "number" &&
        Number.isFinite(kyc.riskScore)
        ? kyc.riskScore
        : null,
});
const getGeminiText = (body) => {
    const parts = body.candidates?.[0]
        ?.content
        ?.parts;
    if (!Array.isArray(parts)) {
        return "";
    }
    return parts
        .map((part) => typeof part.text === "string"
        ? part.text
        : "")
        .join("")
        .trim();
};
const callGemini = async (signals) => {
    const apiKey = process.env.GEMINI_API_KEY
        ?.trim();
    const aiModel = process.env.KYC_AI_MODEL
        ?.trim();
    console.log("KYC AI MODEL:", process.env.KYC_AI_MODEL);
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }
    if (!aiModel) {
        throw new Error("KYC_AI_MODEL is not configured.");
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModel)}:generateContent`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [
                    {
                        text: [
                            "You are a KYC screening assistant for a financial wallet admin team.",
                            "You are NOT the final decision maker.",
                            "Do not infer identity authenticity, sanctions status, face match, liveness, or document validity unless an explicit verified signal is provided.",
                            "Image-presence booleans only show that files exist; they do not prove validity.",
                            "If required identity-verification signals are missing, recommend manual_review.",
                            "likely_clear means the available signals look internally consistent, but a human must still approve.",
                            "likely_reject means the available signals indicate a concrete review problem, but a human must still reject.",
                            "Return concise operational reasoning only from the supplied sanitized signals.",
                        ].join("\n"),
                    },
                ],
            },
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: JSON.stringify({
                                purpose: "KYC triage based on sanitized backend signals",
                                signals,
                            }),
                        },
                    ],
                },
            ],
            generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: REVIEW_SCHEMA,
                temperature: 0.1,
            },
        }),
    });
    let body;
    try {
        body =
            await response.json();
    }
    catch {
        throw new Error(`Gemini returned an unreadable response (HTTP ${response.status}).`);
    }
    if (!response.ok) {
        throw new Error(body.error?.message ||
            `Gemini returned HTTP ${response.status}.`);
    }
    if (body.promptFeedback
        ?.blockReason) {
        throw new Error(`Gemini blocked the screening request: ${body.promptFeedback.blockReason}.`);
    }
    const outputText = getGeminiText(body);
    if (!outputText) {
        throw new Error("Gemini returned no structured output.");
    }
    let parsed;
    try {
        parsed =
            JSON.parse(outputText);
    }
    catch {
        throw new Error("Gemini returned invalid structured JSON.");
    }
    return {
        result: normalizeModelOutput(parsed),
        aiModel,
    };
};
/* =========================================================
   RUN / STORE REVIEW
========================================================= */
const runKycAiReviewForKyc = async ({ kycId, triggeredBy, }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(kycId)) {
        throw new Error("Invalid KYC ID.");
    }
    const kyc = await KYC_js_1.KYC.findById(kycId)
        .select([
        "documentType",
        "provider",
        "status",
        "frontImagePublicId",
        "backImagePublicId",
        "selfieImagePublicId",
        "submittedAt",
        "riskLevel",
        "riskScore",
    ].join(" "))
        .lean();
    if (!kyc) {
        throw new Error("KYC request not found.");
    }
    const review = await KYCAIReview_js_1.KYCAIReview.findOneAndUpdate({
        kycId,
    }, {
        $set: {
            status: "processing",
            recommendation: "manual_review",
            confidence: 0,
            riskLevel: "Medium",
            summary: "Automated screening is running.",
            reasons: [],
            missingSignals: [],
            provider: "gemini",
            aiModel: process.env
                .KYC_AI_MODEL
                ?.trim() ||
                "",
            triggeredBy,
            reviewedAt: new Date(),
            errorMessage: undefined,
        },
    }, {
        returnDocument: "after",
        upsert: true,
        setDefaultsOnInsert: true,
    });
    if (!review) {
        throw new Error("Unable to initialize the KYC automated review record.");
    }
    try {
        const signals = buildSignals(kyc);
        const { result, aiModel, } = await callGemini(signals);
        review.status =
            "completed";
        review.recommendation =
            result.recommendation;
        review.confidence =
            result.confidence;
        review.riskLevel =
            result.riskLevel;
        review.summary =
            result.summary;
        review.reasons =
            result.reasons;
        review.missingSignals =
            result.missingSignals;
        review.provider =
            "gemini";
        review.aiModel =
            aiModel;
        review.reviewedAt =
            new Date();
        review.errorMessage =
            undefined;
        await review.save();
        return review;
    }
    catch (error) {
        review.status =
            "failed";
        review.recommendation =
            "manual_review";
        review.confidence =
            0;
        review.riskLevel =
            "Medium";
        review.summary =
            "Automated screening could not be completed. Manual review is required.";
        review.reasons =
            [];
        review.missingSignals =
            [
                "Automated screening result unavailable",
            ];
        review.errorMessage =
            error instanceof Error
                ? error.message
                    .slice(0, 500)
                : "Automated screening failed.";
        review.reviewedAt =
            new Date();
        await review.save();
        throw error;
    }
};
exports.runKycAiReviewForKyc = runKycAiReviewForKyc;
const getStoredKycAiReview = async (kycId) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(kycId)) {
        return null;
    }
    return KYCAIReview_js_1.KYCAIReview.findOne({
        kycId,
    }).lean();
};
exports.getStoredKycAiReview = getStoredKycAiReview;
