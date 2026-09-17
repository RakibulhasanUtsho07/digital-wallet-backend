import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getStoredKycAiReview,
  runKycAiReviewForKyc,
} from "../services/kycAIReviewService.js";

const asString = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const toClientReview = (
  value: any
) => ({
  id:
    value?._id?.toString?.() ??
    undefined,

  kycId:
    value?.kycId?.toString?.() ??
    String(
      value?.kycId ??
      ""
    ),

  status:
    value?.status,

  recommendation:
    value?.recommendation,

  confidence:
    typeof value?.confidence === "number"
      ? value.confidence
      : 0,

  riskLevel:
    value?.riskLevel,

  summary:
    typeof value?.summary === "string"
      ? value.summary
      : "",

  reasons:
    Array.isArray(
      value?.reasons
    )
      ? value.reasons
      : [],

  missingSignals:
    Array.isArray(
      value?.missingSignals
    )
      ? value.missingSignals
      : [],

  provider:
    typeof value?.provider === "string"
      ? value.provider
      : "unknown",

  /*
   * IMPORTANT:
   * MongoDB/Mongoose field = aiModel
   * Frontend API field = model
   *
   * This avoids colliding with Mongoose Document.model().
   */
  model:
    typeof value?.aiModel === "string"
      ? value.aiModel
      : "",

  triggeredBy:
    value?.triggeredBy,

  reviewedAt:
    value?.reviewedAt,

  errorMessage:
    typeof value?.errorMessage === "string"
      ? value.errorMessage
      : undefined,
});

export const getKycAiReviewController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const kycId =
        asString(
          req.params.id
        );

      if (!kycId) {
        res.status(400).json({
          success: false,
          message:
            "KYC ID is required.",
        });

        return;
      }

      const review =
        await getStoredKycAiReview(
          kycId
        );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      if (!review) {
        res.status(404).json({
          success: false,
          message:
            "No automated KYC review exists yet.",
        });

        return;
      }

      res.status(200).json({
        success: true,
        review:
          toClientReview(
            review
          ),
      });
    } catch (error) {
      console.error(
        "GET KYC AI REVIEW ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load automated KYC review.",
      });
    }
  };

export const runKycAiReviewController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const kycId =
        asString(
          req.params.id
        );

      if (!kycId) {
        res.status(400).json({
          success: false,
          message:
            "KYC ID is required.",
        });

        return;
      }

      const review =
        await runKycAiReviewForKyc({
          kycId,

          triggeredBy:
            "admin_rerun",
        });

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      res.status(200).json({
        success: true,
        message:
          "Automated KYC screening completed.",
        review:
          toClientReview(
            review
          ),
      });
    } catch (error) {
      console.error(
        "RUN KYC AI REVIEW ERROR:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Automated KYC screening failed.",
      });
    }
  };
