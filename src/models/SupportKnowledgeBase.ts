import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type SupportKnowledgeBaseStatus =
  | "published"
  | "draft";

/* =========================================================
   DOCUMENT
========================================================= */

export interface ISupportKnowledgeBase
  extends Document {
  title: string;
  slug: string;
  summary?: string;
  content: string;
  category: string;
  tags: string[];
  status: SupportKnowledgeBaseStatus;
  createdByAdminId?: mongoose.Types.ObjectId;
  updatedByAdminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const supportKnowledgeBaseSchema =
  new Schema<ISupportKnowledgeBase>(
    {
      title: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 180,
      },

      slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 220,
        index: true,
      },

      summary: {
        type: String,
        trim: true,
        maxlength: 400,
        default: undefined,
      },

      content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 12000,
      },

      category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
        index: true,
      },

      tags: {
        type: [
          {
            type: String,
            trim: true,
            maxlength: 40,
          },
        ],
        default: [],
      },

      status: {
        type: String,
        enum: [
          "published",
          "draft",
        ],
        default: "published",
        required: true,
        index: true,
      },

      createdByAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
      },

      updatedByAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
      minimize: false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

supportKnowledgeBaseSchema.index({
  status: 1,
  category: 1,
  updatedAt: -1,
});

supportKnowledgeBaseSchema.index({
  title: "text",
  summary: "text",
  content: "text",
  tags: "text",
});

/* =========================================================
   MODEL
========================================================= */

export const SupportKnowledgeBase =
  mongoose.models.SupportKnowledgeBase ||
  mongoose.model<ISupportKnowledgeBase>(
    "SupportKnowledgeBase",
    supportKnowledgeBaseSchema
  );

export default SupportKnowledgeBase;