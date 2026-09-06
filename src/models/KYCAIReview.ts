import mongoose, {
  Schema,
  type Model,
} from "mongoose";

import type {
  KYCAIRecommendation,
  KYCAIRiskLevel,
  KYCAIReviewStatus,
  KYCAITriggeredBy,
} from "../types/kycAI.js";

/* =========================================================
   KYC AI REVIEW INTERFACE

   IMPORTANT:
   This interface intentionally DOES NOT extend mongoose.Document.

   Mongoose documents already expose a built-in `model()` member.
   Therefore the persisted AI model name must NOT use the schema
   path `model`. We store it as `aiModel` instead.

   API responses may still expose the public property name `model`
   by mapping `aiModel -> model` in the controller.
========================================================= */

export interface IKYCAIReview {
  kycId:
    mongoose.Types.ObjectId;

  status:
    KYCAIReviewStatus;

  recommendation:
    KYCAIRecommendation;

  confidence:
    number;

  riskLevel:
    KYCAIRiskLevel;

  summary:
    string;

  reasons:
    string[];

  missingSignals:
    string[];

  provider:
    string;

  aiModel:
    string;

  triggeredBy:
    KYCAITriggeredBy;

  errorMessage?:
    string;

  reviewedAt:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const kycAIReviewSchema =
  new Schema<IKYCAIReview>(
    {
      kycId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "KYC",

        required:
          true,

        unique:
          true,

        index:
          true,
      },

      status: {
        type:
          String,

        enum: [
          "processing",
          "completed",
          "failed",
        ],

        required:
          true,

        default:
          "processing",

        index:
          true,
      },

      recommendation: {
        type:
          String,

        enum: [
          "likely_clear",
          "manual_review",
          "likely_reject",
        ],

        required:
          true,

        default:
          "manual_review",
      },

      confidence: {
        type:
          Number,

        min:
          0,

        max:
          100,

        default:
          0,
      },

      riskLevel: {
        type:
          String,

        enum: [
          "Low",
          "Medium",
          "High",
          "Critical",
        ],

        default:
          "Medium",

        index:
          true,
      },

      summary: {
        type:
          String,

        trim:
          true,

        maxlength:
          1200,

        default:
          "",
      },

      reasons: {
        type: [
          {
            type:
              String,

            trim:
              true,

            maxlength:
              300,
          },
        ],

        default:
          [],
      },

      missingSignals: {
        type: [
          {
            type:
              String,

            trim:
              true,

            maxlength:
              300,
          },
        ],

        default:
          [],
      },

      provider: {
        type:
          String,

        trim:
          true,

        maxlength:
          80,

        default:
          "gemini",
      },

      aiModel: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        default:
          "",
      },

      triggeredBy: {
        type:
          String,

        enum: [
          "automatic_submission",
          "admin_rerun",
        ],

        required:
          true,
      },

      errorMessage: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,
      },

      reviewedAt: {
        type:
          Date,

        default:
          Date.now,

        index:
          true,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,

      strict:
        "throw",
    }
  );

/* =========================================================
   MODEL

   Explicit typing keeps an already-compiled mongoose model from
   widening to Model<any> during hot reload / serverless reuse.
========================================================= */

const existingKYCAIReviewModel =
  mongoose.models
    .KYCAIReview as
    | Model<IKYCAIReview>
    | undefined;

export const KYCAIReview:
  Model<IKYCAIReview> =
  existingKYCAIReviewModel ??
  mongoose.model<IKYCAIReview>(
    "KYCAIReview",
    kycAIReviewSchema
  );

export default KYCAIReview;
