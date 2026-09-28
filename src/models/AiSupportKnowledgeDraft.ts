import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type AiSupportKnowledgeDraftStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "published";

export interface IAiSupportKnowledgeDraft
  extends Document {
  draftId: string;
  fingerprint: string;

  sourceCaseId: string;
  sourceOutcomeId: string;
  sourcePlaybookRunId: string | null;
  sourcePlaybookId: string | null;

  confirmedCauseCode: string;
  resolutionCode: string;
  queue: string;

  title: string;
  slug: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];

  evidenceRefs: string[];

  status:
    AiSupportKnowledgeDraftStatus;

  createdBySupportUserId: string;

  submittedAt: Date | null;

  reviewedByAdminId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;

  publishedArticleId: string | null;
  publishedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const schema =
  new Schema<IAiSupportKnowledgeDraft>(
    {
      draftId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      fingerprint: {
        type: String,
        required: true,
        index: true,
      },

      sourceCaseId: {
        type: String,
        required: true,
        index: true,
      },

      sourceOutcomeId: {
        type: String,
        required: true,
        index: true,
      },

      sourcePlaybookRunId: {
        type: String,
        default: null,
        index: true,
      },

      sourcePlaybookId: {
        type: String,
        default: null,
        index: true,
      },

      confirmedCauseCode: {
        type: String,
        required: true,
        index: true,
      },

      resolutionCode: {
        type: String,
        required: true,
        index: true,
      },

      queue: {
        type: String,
        required: true,
        index: true,
      },

      title: {
        type: String,
        required: true,
        maxlength: 180,
      },

      slug: {
        type: String,
        required: true,
        maxlength: 220,
      },

      summary: {
        type: String,
        required: true,
        maxlength: 400,
      },

      content: {
        type: String,
        required: true,
        maxlength: 12_000,
      },

      category: {
        type: String,
        required: true,
        maxlength: 100,
      },

      tags: {
        type: [String],
        default: [],
      },

      evidenceRefs: {
        type: [String],
        default: [],
      },

      status: {
        type: String,
        enum: [
          "draft",
          "submitted",
          "approved",
          "rejected",
          "published",
        ],
        default: "draft",
        index: true,
      },

      createdBySupportUserId: {
        type: String,
        required: true,
        index: true,
      },

      submittedAt: {
        type: Date,
        default: null,
      },

      reviewedByAdminId: {
        type: String,
        default: null,
        index: true,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      reviewNote: {
        type: String,
        default: null,
        maxlength: 2_000,
      },

      publishedArticleId: {
        type: String,
        default: null,
        index: true,
      },

      publishedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
      collection:
        "ai_support_knowledge_drafts",
    },
  );

schema.index(
  {
    fingerprint: 1,
    status: 1,
    updatedAt: -1,
  },
);

schema.index(
  {
    status: 1,
    createdAt: -1,
  },
);

export const AiSupportKnowledgeDraft =
  mongoose.models.AiSupportKnowledgeDraft ||
  mongoose.model<IAiSupportKnowledgeDraft>(
    "AiSupportKnowledgeDraft",
    schema,
  );
