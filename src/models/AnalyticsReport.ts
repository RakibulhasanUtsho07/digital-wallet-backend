import mongoose, {
  Document,
  Schema,
} from "mongoose";

import type {
  AnalyticsDashboardData,
  AnalyticsRange,
  AnalyticsReportFormat,
  AnalyticsReportStatus,
} from "../types/analytics.js";

export interface IAnalyticsReport
  extends Document {
  requestedByAdminId:
    mongoose.Types.ObjectId;

  range:
    AnalyticsRange;

  format:
    AnalyticsReportFormat;

  status:
    AnalyticsReportStatus;

  snapshot?:
    AnalyticsDashboardData;

  errorMessage?:
    string;

  completedAt?:
    Date;

  expiresAt:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const analyticsReportSchema =
  new Schema<IAnalyticsReport>(
    {
      requestedByAdminId: {
        type:
          Schema.Types.ObjectId,
        ref:
          "User",
        required:
          true,
        index:
          true,
      },

      range: {
        type:
          String,
        enum: [
          "Today",
          "7D",
          "30D",
          "90D",
          "1Y",
        ],
        required:
          true,
        index:
          true,
      },

      format: {
        type:
          String,
        enum: [
          "summary",
          "executive",
          "risk",
        ],
        required:
          true,
      },

      status: {
        type:
          String,
        enum: [
          "queued",
          "processing",
          "ready",
          "failed",
        ],
        default:
          "queued",
        index:
          true,
      },

      snapshot: {
        type:
          Schema.Types.Mixed,
      },

      errorMessage: {
        type:
          String,
        maxlength:
          500,
      },

      completedAt: {
        type:
          Date,
      },

      expiresAt: {
        type:
          Date,
        required:
          true,
        index: {
          expires:
            0,
        },
      },
    },
    {
      timestamps:
        true,
      versionKey:
        false,
      strict:
        "throw",
      minimize:
        false,
    }
  );

analyticsReportSchema.index({
  requestedByAdminId:
    1,
  createdAt:
    -1,
});

export const AnalyticsReport =
  mongoose.models.AnalyticsReport ||
  mongoose.model<IAnalyticsReport>(
    "AnalyticsReport",
    analyticsReportSchema
  );

export default AnalyticsReport;
