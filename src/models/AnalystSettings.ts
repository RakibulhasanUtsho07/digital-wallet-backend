import mongoose, {
  type Document,
  type Model,
  Schema,
} from "mongoose";

import type {
  AnalystSettingsPayload,
} from "../services/analystSettingsTypes.js";

/* =========================================================
   INTERFACE
========================================================= */

export interface IAnalystSettings
  extends Document,
    AnalystSettingsPayload {
  userId:
    mongoose.Types.ObjectId;

  revision:
    number;

  updatedBy:
    mongoose.Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const analystSettingsSchema =
  new Schema<IAnalystSettings>(
    {
      /* =====================================================
         OWNER
      ===================================================== */

      userId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        /*
         * One Analyst Settings document per user.
         *
         * unique: true already creates the unique MongoDB index.
         * Do NOT also add index:true or schema.index({ userId: 1 }).
         */
        unique:
          true,

        immutable:
          true,
      },

      /* =====================================================
         GENERAL
      ===================================================== */

      general: {
        defaultRange: {
          type:
            String,

          enum: [
            "24h",
            "7d",
            "30d",
            "90d",
          ],

          default:
            "30d",

          required:
            true,
        },

        defaultMode: {
          type:
            String,

          enum: [
            "all",
            "test",
            "live",
          ],

          default:
            "all",

          required:
            true,
        },

        currency: {
          type:
            String,

          trim:
            true,

          uppercase:
            true,

          minlength:
            3,

          maxlength:
            3,

          default:
            "BDT",

          required:
            true,
        },

        timezone: {
          type:
            String,

          trim:
            true,

          maxlength:
            80,

          default:
            "Asia/Dhaka",

          required:
            true,
        },

        autoRefreshSeconds: {
          type:
            Number,

          min:
            15,

          max:
            300,

          default:
            30,

          required:
            true,
        },
      },

      /* =====================================================
         DATA SCOPE
      ===================================================== */

      dataScope: {
        provider: {
          type:
            String,

          trim:
            true,

          lowercase:
            true,

          maxlength:
            50,

          /*
           * Empty string means:
           * no provider filter / include all providers.
           */
          default:
            "",

          /*
           * IMPORTANT:
           * Mongoose required:true rejects an empty string.
           *
           * Since "" is a valid application value here,
           * this field must NOT use required:true.
           */
          required:
            false,
        },

        riskSource: {
          type:
            String,

          enum: [
            "all",
            "wallet",
            "card",
            "paypal",
            "local_psp",
          ],

          default:
            "all",

          required:
            true,
        },
      },

      /* =====================================================
         PROVIDER MONITORING
      ===================================================== */

      providerMonitoring: {
        warningSuccessRate: {
          type:
            Number,

          min:
            0,

          max:
            100,

          default:
            95,

          required:
            true,
        },

        criticalSuccessRate: {
          type:
            Number,

          min:
            0,

          max:
            100,

          default:
            85,

          required:
            true,
        },

        maxAverageCompletionSeconds: {
          type:
            Number,

          min:
            1,

          max:
            3600,

          default:
            30,

          required:
            true,
        },
      },

      /* =====================================================
         ALERTS
      ===================================================== */

      alerts: {
        enabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        critical: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        high: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        medium: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        info: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        positive: {
          type:
            Boolean,

          default:
            false,

          required:
            true,
        },
      },

      /* =====================================================
         RISK
      ===================================================== */

      risk: {
        highRiskRateWarning: {
          type:
            Number,

          min:
            0,

          max:
            100,

          default:
            10,

          required:
            true,
        },

        paymentFailureRateWarning: {
          type:
            Number,

          min:
            0,

          max:
            100,

          default:
            8,

          required:
            true,
        },

        disputeExposureRateWarning: {
          type:
            Number,

          min:
            0,

          max:
            100,

          default:
            3,

          required:
            true,
        },
      },

      /* =====================================================
         ANOMALY DETECTION
      ===================================================== */

      anomalies: {
        enabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        sensitivity: {
          type:
            String,

          enum: [
            "low",
            "medium",
            "high",
          ],

          default:
            "medium",

          required:
            true,
        },

        baselineDays: {
          type:
            Number,

          min:
            1,

          max:
            180,

          default:
            30,

          required:
            true,
        },

        minimumSampleSize: {
          type:
            Number,

          min:
            1,

          max:
            100000,

          default:
            100,

          required:
            true,
        },
      },

      /* =====================================================
         REPORTS
      ===================================================== */

      reports: {
        defaultFormat: {
          type:
            String,

          enum: [
            "executive",
            "payments",
            "risk",
            "revenue",
          ],

          default:
            "executive",

          required:
            true,
        },

        defaultRange: {
          type:
            String,

          enum: [
            "24h",
            "7d",
            "30d",
            "90d",
          ],

          default:
            "30d",

          required:
            true,
        },

        defaultMode: {
          type:
            String,

          enum: [
            "all",
            "test",
            "live",
          ],

          default:
            "all",

          required:
            true,
        },
      },

      /* =====================================================
         AI INSIGHTS
      ===================================================== */

      aiInsights: {
        enabled: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        minimumSeverity: {
          type:
            String,

          enum: [
            "critical",
            "high",
            "medium",
            "info",
            "positive",
          ],

          default:
            "info",

          required:
            true,
        },

        showRecommendedActions: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      /* =====================================================
         EXPORT
      ===================================================== */

      export: {
        defaultFormat: {
          type:
            String,

          enum: [
            "csv",
          ],

          default:
            "csv",

          required:
            true,
        },

        fileNamePrefix: {
          type:
            String,

          trim:
            true,

          minlength:
            1,

          maxlength:
            40,

          default:
            "coffer-analyst",

          required:
            true,
        },
      },

      /* =====================================================
         APPEARANCE
      ===================================================== */

      appearance: {
        density: {
          type:
            String,

          enum: [
            "comfortable",
            "compact",
          ],

          default:
            "comfortable",

          required:
            true,
        },

        animations: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        chartMotion: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      /* =====================================================
         REVISION / AUDIT OWNER
      ===================================================== */

      revision: {
        type:
          Number,

        min:
          1,

        default:
          1,

        required:
          true,
      },

      updatedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,
      },
    },
    {
      timestamps:
        true,

      minimize:
        false,

      versionKey:
        false,
    }
  );

/* =========================================================
   MODEL

   NOTE:
   No extra schema.index({ userId: 1 }) here.

   userId.unique = true already creates the unique index.
========================================================= */

const AnalystSettingsModel:
  Model<IAnalystSettings> =
  (
    mongoose.models
      .AnalystSettings as
      Model<IAnalystSettings>
  ) ||
  mongoose.model<IAnalystSettings>(
    "AnalystSettings",
    analystSettingsSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const AnalystSettings =
  AnalystSettingsModel;

export default
  AnalystSettingsModel;