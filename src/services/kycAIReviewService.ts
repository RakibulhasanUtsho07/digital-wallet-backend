import mongoose from "mongoose";

import {
    KYC,
} from "../models/KYC.js";

import {
    KYCAIReview,
} from "../models/KYCAIReview.js";

import type {
    KYCAIModelOutput,
    KYCAISanitizedSignals,
    KYCAITriggeredBy,
} from "../types/kycAI.js";

/* =========================================================
   IMPORTANT PRIVACY / DECISION BOUNDARY

   This service intentionally does NOT send:
   - raw document numbers
   - email / phone
   - applicant name
   - document image URLs
   - selfie images
   - addresses
   - access tokens / cookies

   It only sends derived/sanitized operational signals.

   Gemini is a review assistant only. It does NOT update the
   final KYC/User verified state. Final approve/reject remains
   in the protected admin review endpoint.
========================================================= */

interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
            }>;
        };
        finishReason?: string;
    }>;

    promptFeedback?: {
        blockReason?: string;
    };

    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

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
} as const;

const clampConfidence = (
    value: unknown
): number =>
    Math.max(
        0,
        Math.min(
            100,
            Number(value) || 0
        )
    );

const trimList = (
    value: unknown
): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(
            (item) =>
                typeof item === "string"
        )
        .map(
            (item) =>
                item
                    .trim()
                    .slice(0, 300)
        )
        .filter(Boolean)
        .slice(0, 6);
};

const normalizeModelOutput = (
    value: unknown
): KYCAIModelOutput => {
    const item = (
        value &&
            typeof value === "object"
            ? value
            : {}
    ) as Record<string, unknown>;

    const recommendation =
        item.recommendation === "likely_clear" ||
            item.recommendation === "likely_reject"
            ? item.recommendation
            : "manual_review";

    const riskLevel =
        item.riskLevel === "Low" ||
            item.riskLevel === "Medium" ||
            item.riskLevel === "High" ||
            item.riskLevel === "Critical"
            ? item.riskLevel
            : "Medium";

    return {
        recommendation,

        confidence:
            clampConfidence(
                item.confidence
            ),

        riskLevel,

        summary:
            typeof item.summary === "string"
                ? item.summary
                    .trim()
                    .slice(0, 1200)
                : "The automated screening did not return a summary.",

        reasons:
            trimList(
                item.reasons
            ),

        missingSignals:
            trimList(
                item.missingSignals
            ),
    };
};

const buildSignals = (
    kyc: Record<string, unknown>
): KYCAISanitizedSignals => ({
    documentType:
        String(
            kyc.documentType ||
            "unknown"
        ),

    provider:
        String(
            kyc.provider ||
            "manual"
        ),

    status:
        String(
            kyc.status ||
            "unknown"
        ),

    hasFrontImage:
        Boolean(
            kyc.frontImagePublicId
        ),

    hasBackImage:
        Boolean(
            kyc.backImagePublicId
        ),

    hasSelfieImage:
        Boolean(
            kyc.selfieImagePublicId
        ),

    submittedAt:
        kyc.submittedAt instanceof Date
            ? kyc.submittedAt.toISOString()
            : typeof kyc.submittedAt === "string"
                ? kyc.submittedAt
                : null,

    priorRiskLevel:
        typeof kyc.riskLevel === "string"
            ? kyc.riskLevel
            : null,

    priorRiskScore:
        typeof kyc.riskScore === "number" &&
            Number.isFinite(
                kyc.riskScore
            )
            ? kyc.riskScore
            : null,
});

const getGeminiText = (
    body: GeminiResponse
): string => {
    const parts =
        body.candidates?.[0]
            ?.content
            ?.parts;

    if (!Array.isArray(parts)) {
        return "";
    }

    return parts
        .map(
            (part) =>
                typeof part.text === "string"
                    ? part.text
                    : ""
        )
        .join("")
        .trim();
};

const callGemini = async (
    signals: KYCAISanitizedSignals
): Promise<{
    result: KYCAIModelOutput;
    aiModel: string;
}> => {
    const apiKey =
        process.env.GEMINI_API_KEY
            ?.trim();

    const aiModel =
        process.env.KYC_AI_MODEL
            ?.trim();
    console.log(
        "KYC AI MODEL:",
        process.env.KYC_AI_MODEL
    );
    if (!apiKey) {
        throw new Error(
            "GEMINI_API_KEY is not configured."
        );
    }

    if (!aiModel) {
        throw new Error(
            "KYC_AI_MODEL is not configured."
        );
    }

    const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModel)}:generateContent`;

    const response =
        await fetch(
            endpoint,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "x-goog-api-key":
                        apiKey,
                },

                body:
                    JSON.stringify({
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
                                        text:
                                            JSON.stringify({
                                                purpose:
                                                    "KYC triage based on sanitized backend signals",

                                                signals,
                                            }),
                                    },
                                ],
                            },
                        ],

                        generationConfig: {
                            responseMimeType:
                                "application/json",

                            responseJsonSchema:
                                REVIEW_SCHEMA,

                            temperature:
                                0.1,
                        },
                    }),
            }
        );

    let body: GeminiResponse;

    try {
        body =
            await response.json() as
            GeminiResponse;
    } catch {
        throw new Error(
            `Gemini returned an unreadable response (HTTP ${response.status}).`
        );
    }

    if (!response.ok) {
        throw new Error(
            body.error?.message ||
            `Gemini returned HTTP ${response.status}.`
        );
    }

    if (
        body.promptFeedback
            ?.blockReason
    ) {
        throw new Error(
            `Gemini blocked the screening request: ${body.promptFeedback.blockReason}.`
        );
    }

    const outputText =
        getGeminiText(body);

    if (!outputText) {
        throw new Error(
            "Gemini returned no structured output."
        );
    }

    let parsed: unknown;

    try {
        parsed =
            JSON.parse(
                outputText
            );
    } catch {
        throw new Error(
            "Gemini returned invalid structured JSON."
        );
    }

    return {
        result:
            normalizeModelOutput(
                parsed
            ),

        aiModel,
    };
};

/* =========================================================
   RUN / STORE REVIEW
========================================================= */

export const runKycAiReviewForKyc =
    async ({
        kycId,
        triggeredBy,
    }: {
        kycId: string;
        triggeredBy: KYCAITriggeredBy;
    }) => {
        if (
            !mongoose.Types.ObjectId.isValid(
                kycId
            )
        ) {
            throw new Error(
                "Invalid KYC ID."
            );
        }

        const kyc =
            await KYC.findById(
                kycId
            )
                .select(
                    [
                        "documentType",
                        "provider",
                        "status",
                        "frontImagePublicId",
                        "backImagePublicId",
                        "selfieImagePublicId",
                        "submittedAt",
                        "riskLevel",
                        "riskScore",
                    ].join(" ")
                )
                .lean();

        if (!kyc) {
            throw new Error(
                "KYC request not found."
            );
        }

        const review =
            await KYCAIReview.findOneAndUpdate(
                {
                    kycId,
                },
                {
                    $set: {
                        status:
                            "processing",

                        recommendation:
                            "manual_review",

                        confidence:
                            0,

                        riskLevel:
                            "Medium",

                        summary:
                            "Automated screening is running.",

                        reasons:
                            [],

                        missingSignals:
                            [],

                        provider:
                            "gemini",

                        aiModel:
                            process.env
                                .KYC_AI_MODEL
                                ?.trim() ||
                            "",

                        triggeredBy,

                        reviewedAt:
                            new Date(),

                        errorMessage:
                            undefined,
                    },
                },
                {
                    returnDocument:
                        "after",

                    upsert:
                        true,

                    setDefaultsOnInsert:
                        true,
                }
            );

        if (!review) {
            throw new Error(
                "Unable to initialize the KYC automated review record."
            );
        }

        try {
            const signals =
                buildSignals(
                    kyc as unknown as
                    Record<string, unknown>
                );

            const {
                result,
                aiModel,
            } =
                await callGemini(
                    signals
                );

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
        } catch (error) {
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

export const getStoredKycAiReview =
    async (
        kycId: string
    ) => {
        if (
            !mongoose.Types.ObjectId.isValid(
                kycId
            )
        ) {
            return null;
        }

        return KYCAIReview.findOne({
            kycId,
        }).lean();
    };
