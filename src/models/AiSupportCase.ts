import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type AiSupportCaseStatus =
  | "open"
  | "investigating"
  | "waiting_customer"
  | "escalated"
  | "resolved"
  | "closed";

export type AiSupportCaseSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type AiSupportCasePriority =
  | "urgent"
  | "high"
  | "medium"
  | "low";

export type AiSupportCaseQueue =
  | "support"
  | "payments"
  | "provider"
  | "risk_security"
  | "kyc"
  | "engineering";

export interface IAiSupportCaseNote {
  authorUserId: string;
  body: string;
  createdAt: Date;
}

export interface IAiSupportCase
  extends Document {
  caseId: string;

  subjectKind:
    | "payment"
    | "transaction"
    | "customer";

  subjectReference: string;
  customerIds: string[];

  status:
    AiSupportCaseStatus;

  severity:
    AiSupportCaseSeverity;

  priority:
    AiSupportCasePriority;

  queue:
    AiSupportCaseQueue;

  responseTargetMinutes: number;

  verification:
    | "verified"
    | "partial"
    | "unknown";

  confidence:
    | "high"
    | "medium"
    | "low";

  confirmedCause: {
    code: string;
    label: string;
    evidenceRefs: string[];
  } | null;

  reasonCodes: string[];
  agentSummary: string;
  customerFacingMessage: string;
  agentChecklist: string[];

  signalSnapshot: Array<{
    code: string;
    title: string;
    detail: string;
    severity:
      | "blocker"
      | "warning"
      | "context"
      | "positive";
    confirmedCause: boolean;
    evidenceRefs: string[];
  }>;

  sourceSnapshot: Array<{
    type: string;
    label: string;
    reference: string;
  }>;

  timelineSnapshot: Array<{
    at: string;
    category: string;
    label: string;
    reference: string | null;
  }>;

  escalation: {
    required: boolean;
    team: string;
    reason: string;
  };

  correlationFingerprint: string | null;
  duplicateOfCaseId: string | null;
  relatedCaseIds: string[];
  incidentId: string | null;
  slaDueAt: Date;
  firstResponseAt: Date | null;

  assignedToUserId:
    string | null;

  createdByUserId:
    string;

  lastInvestigatedAt:
    Date;

  notes:
    IAiSupportCaseNote[];

  createdAt: Date;
  updatedAt: Date;
}

const noteSchema =
  new Schema<IAiSupportCaseNote>(
    {
      authorUserId: {
        type: String,
        required: true,
        trim: true,
      },

      body: {
        type: String,
        required: true,
        trim: true,
        maxlength: 2_000,
      },

      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    {
      _id: true,
    },
  );

const aiSupportCaseSchema =
  new Schema<IAiSupportCase>(
    {
      caseId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      subjectKind: {
        type: String,
        enum: [
          "payment",
          "transaction",
          "customer",
        ],
        required: true,
        index: true,
      },

      subjectReference: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      customerIds: {
        type: [String],
        default: [],
        index: true,
      },

      status: {
        type: String,
        enum: [
          "open",
          "investigating",
          "waiting_customer",
          "escalated",
          "resolved",
          "closed",
        ],
        default:
          "open",
        index: true,
      },

      severity: {
        type: String,
        enum: [
          "critical",
          "high",
          "medium",
          "low",
        ],
        required: true,
        index: true,
      },

      priority: {
        type: String,
        enum: [
          "urgent",
          "high",
          "medium",
          "low",
        ],
        required: true,
        index: true,
      },

      queue: {
        type: String,
        enum: [
          "support",
          "payments",
          "provider",
          "risk_security",
          "kyc",
          "engineering",
        ],
        required: true,
        index: true,
      },

      responseTargetMinutes: {
        type: Number,
        required: true,
        min: 1,
      },

      verification: {
        type: String,
        enum: [
          "verified",
          "partial",
          "unknown",
        ],
        required: true,
      },

      confidence: {
        type: String,
        enum: [
          "high",
          "medium",
          "low",
        ],
        required: true,
      },

      confirmedCause: {
        type: new Schema(
          {
            code: {
              type: String,
              required: true,
            },

            label: {
              type: String,
              required: true,
            },

            evidenceRefs: {
              type: [String],
              default: [],
            },
          },
          {
            _id: false,
          },
        ),
        default:
          null,
      },

      reasonCodes: {
        type: [String],
        default: [],
      },

      agentSummary: {
        type: String,
        required: true,
        maxlength: 8_000,
      },

      customerFacingMessage: {
        type: String,
        required: true,
        maxlength: 4_000,
      },

      agentChecklist: {
        type: [String],
        default: [],
      },

      signalSnapshot: {
        type: [
          new Schema(
            {
              code: String,
              title: String,
              detail: String,
              severity: String,
              confirmedCause:
                Boolean,
              evidenceRefs: {
                type: [String],
                default: [],
              },
            },
            {
              _id: false,
            },
          ),
        ],
        default: [],
      },

      sourceSnapshot: {
        type: [
          new Schema(
            {
              type: String,
              label: String,
              reference:
                String,
            },
            {
              _id: false,
            },
          ),
        ],
        default: [],
      },

      timelineSnapshot: {
        type: [
          new Schema(
            {
              at: String,
              category: String,
              label: String,
              reference: {
                type: String,
                default: null,
              },
            },
            {
              _id: false,
            },
          ),
        ],
        default: [],
      },

      escalation: {
        type: new Schema(
          {
            required: {
              type: Boolean,
              required: true,
            },

            team: {
              type: String,
              required: true,
            },

            reason: {
              type: String,
              required: true,
            },
          },
          {
            _id: false,
          },
        ),
        required: true,
      },

      correlationFingerprint: {
        type: String,
        default: null,
        index: true,
      },

      duplicateOfCaseId: {
        type: String,
        default: null,
        index: true,
      },

      relatedCaseIds: {
        type: [String],
        default: [],
      },

      incidentId: {
        type: String,
        default: null,
        index: true,
      },

      slaDueAt: {
        type: Date,
        required: true,
        index: true,
      },

      firstResponseAt: {
        type: Date,
        default: null,
      },

      assignedToUserId: {
        type: String,
        default: null,
        index: true,
      },

      createdByUserId: {
        type: String,
        required: true,
        index: true,
      },

      lastInvestigatedAt: {
        type: Date,
        default:
          Date.now,
        index: true,
      },

      notes: {
        type: [
          noteSchema,
        ],
        default: [],
      },
    },
    {
      timestamps: true,
      collection:
        "ai_support_cases",
    },
  );

aiSupportCaseSchema.index(
  {
    subjectKind: 1,
    subjectReference: 1,
    status: 1,
  },
);

aiSupportCaseSchema.index(
  {
    queue: 1,
    priority: 1,
    updatedAt: -1,
  },
);

aiSupportCaseSchema.index(
  {
    createdByUserId: 1,
    updatedAt: -1,
  },
);

aiSupportCaseSchema.index({
  correlationFingerprint: 1,
  status: 1,
  updatedAt: -1,
});

aiSupportCaseSchema.index({
  incidentId: 1,
  updatedAt: -1,
});

export const AiSupportCase =
  mongoose.models.AiSupportCase ||
  mongoose.model<IAiSupportCase>(
    "AiSupportCase",
    aiSupportCaseSchema,
  );
