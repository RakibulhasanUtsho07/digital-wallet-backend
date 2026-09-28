import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type AiSupportAlertType =
  | "payment_failure_rate_spike"
  | "provider_failure_spike"
  | "failure_code_spike"
  | "support_case_inflow_spike"
  | "sla_pressure"
  | "critical_incident";

export type AiSupportAlertSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type AiSupportAlertStatus =
  | "open"
  | "acknowledged"
  | "resolved";

export interface IAiSupportAlert
  extends Document {
  alertId: string;
  fingerprint: string;
  type: AiSupportAlertType;
  severity: AiSupportAlertSeverity;
  status: AiSupportAlertStatus;

  title: string;
  summary: string;

  source: {
    provider: string | null;
    failureCode: string | null;
    queue: string | null;
  };

  evidence: {
    currentWindowMinutes: number;
    baselineWindowMinutes: number;

    currentTotal: number;
    currentFailures: number;
    currentRate: number;

    baselineTotal: number;
    baselineFailures: number;
    baselineRate: number;

    deltaRatePoints: number;
    multiplier: number | null;
  };

  reasonCodes: string[];

  firstDetectedAt: Date;
  lastDetectedAt: Date;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  resolvedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema =
  new Schema(
    {
      currentWindowMinutes: {
        type: Number,
        required: true,
      },

      baselineWindowMinutes: {
        type: Number,
        required: true,
      },

      currentTotal: {
        type: Number,
        required: true,
      },

      currentFailures: {
        type: Number,
        required: true,
      },

      currentRate: {
        type: Number,
        required: true,
      },

      baselineTotal: {
        type: Number,
        required: true,
      },

      baselineFailures: {
        type: Number,
        required: true,
      },

      baselineRate: {
        type: Number,
        required: true,
      },

      deltaRatePoints: {
        type: Number,
        required: true,
      },

      multiplier: {
        type: Number,
        default: null,
      },
    },
    {
      _id: false,
    },
  );

const aiSupportAlertSchema =
  new Schema<IAiSupportAlert>(
    {
      alertId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      fingerprint: {
        type: String,
        required: true,
        index: true,
        trim: true,
      },

      type: {
        type: String,
        required: true,
        index: true,
        enum: [
          "payment_failure_rate_spike",
          "provider_failure_spike",
          "failure_code_spike",
          "support_case_inflow_spike",
          "sla_pressure",
          "critical_incident",
        ],
      },

      severity: {
        type: String,
        required: true,
        index: true,
        enum: [
          "critical",
          "high",
          "medium",
          "low",
        ],
      },

      status: {
        type: String,
        enum: [
          "open",
          "acknowledged",
          "resolved",
        ],
        default:
          "open",
        index: true,
      },

      title: {
        type: String,
        required: true,
        maxlength: 240,
      },

      summary: {
        type: String,
        required: true,
        maxlength: 4_000,
      },

      source: {
        type: new Schema(
          {
            provider: {
              type: String,
              default: null,
            },

            failureCode: {
              type: String,
              default: null,
            },

            queue: {
              type: String,
              default: null,
            },
          },
          {
            _id: false,
          },
        ),
        required: true,
      },

      evidence: {
        type:
          evidenceSchema,
        required: true,
      },

      reasonCodes: {
        type: [String],
        default: [],
      },

      firstDetectedAt: {
        type: Date,
        required: true,
        index: true,
      },

      lastDetectedAt: {
        type: Date,
        required: true,
        index: true,
      },

      acknowledgedAt: {
        type: Date,
        default: null,
      },

      acknowledgedByUserId: {
        type: String,
        default: null,
        index: true,
      },

      resolvedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
      collection:
        "ai_support_alerts",
    },
  );

aiSupportAlertSchema.index(
  {
    fingerprint: 1,
    status: 1,
    lastDetectedAt: -1,
  },
);

aiSupportAlertSchema.index(
  {
    status: 1,
    severity: 1,
    lastDetectedAt: -1,
  },
);

export const AiSupportAlert =
  mongoose.models.AiSupportAlert ||
  mongoose.model<IAiSupportAlert>(
    "AiSupportAlert",
    aiSupportAlertSchema,
  );
