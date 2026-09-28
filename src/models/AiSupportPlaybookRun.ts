import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type AiSupportPlaybookRunStatus =
  | "active"
  | "completed"
  | "cancelled";

export type AiSupportPlaybookStepStatus =
  | "pending"
  | "completed"
  | "skipped";

export interface IAiSupportPlaybookRunStep {
  stepId: string;
  title: string;
  kind: string;
  required: boolean;
  status:
    AiSupportPlaybookStepStatus;
  completedByUserId:
    string | null;
  completedAt:
    Date | null;
  note:
    string | null;
}

export interface IAiSupportPlaybookRun
  extends Document {
  runId: string;
  caseId: string;
  playbookId: string;
  playbookTitle: string;
  status:
    AiSupportPlaybookRunStatus;
  recommendationScore: number;
  recommendationReasons: string[];
  steps:
    IAiSupportPlaybookRunStep[];
  startedByUserId: string;
  completedByUserId:
    string | null;
  completedAt:
    Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema =
  new Schema<IAiSupportPlaybookRunStep>(
    {
      stepId: {
        type: String,
        required: true,
      },

      title: {
        type: String,
        required: true,
      },

      kind: {
        type: String,
        required: true,
      },

      required: {
        type: Boolean,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "pending",
          "completed",
          "skipped",
        ],
        default:
          "pending",
      },

      completedByUserId: {
        type: String,
        default: null,
      },

      completedAt: {
        type: Date,
        default: null,
      },

      note: {
        type: String,
        default: null,
        maxlength: 1_000,
      },
    },
    {
      _id: false,
    },
  );

const schema =
  new Schema<IAiSupportPlaybookRun>(
    {
      runId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      caseId: {
        type: String,
        required: true,
        index: true,
      },

      playbookId: {
        type: String,
        required: true,
        index: true,
      },

      playbookTitle: {
        type: String,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "active",
          "completed",
          "cancelled",
        ],
        default:
          "active",
        index: true,
      },

      recommendationScore: {
        type: Number,
        default: 0,
      },

      recommendationReasons: {
        type: [String],
        default: [],
      },

      steps: {
        type: [stepSchema],
        default: [],
      },

      startedByUserId: {
        type: String,
        required: true,
        index: true,
      },

      completedByUserId: {
        type: String,
        default: null,
      },

      completedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
      collection:
        "ai_support_playbook_runs",
    },
  );

schema.index(
  {
    caseId: 1,
    status: 1,
    updatedAt: -1,
  },
);

export const AiSupportPlaybookRun =
  mongoose.models.AiSupportPlaybookRun ||
  mongoose.model<IAiSupportPlaybookRun>(
    "AiSupportPlaybookRun",
    schema,
  );
