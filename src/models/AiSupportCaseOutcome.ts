import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type AiSupportOutcomeStatus =
  | "resolved"
  | "escalated"
  | "unresolved"
  | "duplicate"
  | "reopened";

export type AiSupportResolutionSource =
  | "playbook"
  | "manual"
  | "escalation"
  | "duplicate";

export type AiSupportResolutionCode =
  | "customer_action_success"
  | "provider_recovered"
  | "payment_final_state_confirmed"
  | "duplicate_case"
  | "internal_fix"
  | "kyc_flow_completed"
  | "risk_review_completed"
  | "issue_no_longer_reproducible"
  | "other"
  | "unknown";

export interface IAiSupportCaseOutcome
  extends Document {
  outcomeId: string;
  caseId: string;

  status:
    AiSupportOutcomeStatus;

  resolutionSource:
    AiSupportResolutionSource;

  resolutionCode:
    AiSupportResolutionCode;

  playbookRunId:
    string | null;

  playbookId:
    string | null;

  confirmedCauseCode:
    string | null;

  queueAtResolution:
    string;

  customerConfirmedResolved:
    boolean | null;

  agentConfirmed:
    boolean;

  resolvedByUserId:
    string | null;

  escalationTeam:
    string | null;

  duplicateOfCaseId:
    string | null;

  resolutionNote:
    string | null;

  firstResolvedAt:
    Date | null;

  lastResolvedAt:
    Date | null;

  timeToResolutionMinutes:
    number | null;

  reopenedCount:
    number;

  lastReopenedAt:
    Date | null;

  lastReopenedByUserId:
    string | null;

  createdAt: Date;
  updatedAt: Date;
}

const schema =
  new Schema<IAiSupportCaseOutcome>(
    {
      outcomeId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      caseId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      status: {
        type: String,
        required: true,
        index: true,
        enum: [
          "resolved",
          "escalated",
          "unresolved",
          "duplicate",
          "reopened",
        ],
      },

      resolutionSource: {
        type: String,
        required: true,
        enum: [
          "playbook",
          "manual",
          "escalation",
          "duplicate",
        ],
      },

      resolutionCode: {
        type: String,
        required: true,
        index: true,
        enum: [
          "customer_action_success",
          "provider_recovered",
          "payment_final_state_confirmed",
          "duplicate_case",
          "internal_fix",
          "kyc_flow_completed",
          "risk_review_completed",
          "issue_no_longer_reproducible",
          "other",
          "unknown",
        ],
      },

      playbookRunId: {
        type: String,
        default: null,
        index: true,
      },

      playbookId: {
        type: String,
        default: null,
        index: true,
      },

      confirmedCauseCode: {
        type: String,
        default: null,
        index: true,
      },

      queueAtResolution: {
        type: String,
        required: true,
        index: true,
      },

      customerConfirmedResolved: {
        type: Boolean,
        default: null,
      },

      agentConfirmed: {
        type: Boolean,
        required: true,
        default: false,
      },

      resolvedByUserId: {
        type: String,
        default: null,
        index: true,
      },

      escalationTeam: {
        type: String,
        default: null,
      },

      duplicateOfCaseId: {
        type: String,
        default: null,
        index: true,
      },

      resolutionNote: {
        type: String,
        default: null,
        maxlength: 2_000,
      },

      firstResolvedAt: {
        type: Date,
        default: null,
      },

      lastResolvedAt: {
        type: Date,
        default: null,
        index: true,
      },

      timeToResolutionMinutes: {
        type: Number,
        default: null,
        min: 0,
      },

      reopenedCount: {
        type: Number,
        default: 0,
        min: 0,
      },

      lastReopenedAt: {
        type: Date,
        default: null,
        index: true,
      },

      lastReopenedByUserId: {
        type: String,
        default: null,
      },
    },
    {
      timestamps: true,
      collection:
        "ai_support_case_outcomes",
    },
  );

schema.index(
  {
    status: 1,
    updatedAt: -1,
  },
);

schema.index(
  {
    playbookId: 1,
    status: 1,
    updatedAt: -1,
  },
);

schema.index(
  {
    confirmedCauseCode: 1,
    status: 1,
    updatedAt: -1,
  },
);

export const AiSupportCaseOutcome =
  mongoose.models.AiSupportCaseOutcome ||
  mongoose.model<IAiSupportCaseOutcome>(
    "AiSupportCaseOutcome",
    schema,
  );
