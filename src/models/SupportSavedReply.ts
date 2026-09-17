import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type SupportSavedReplyStatus =
  | "published"
  | "draft";

/* =========================================================
   DOCUMENT
========================================================= */

export interface ISupportSavedReply
  extends Document {
  title: string;
  shortcut: string;
  content: string;
  category: string;
  tags: string[];
  status: SupportSavedReplyStatus;
  createdByAdminId?: mongoose.Types.ObjectId;
  updatedByAdminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const supportSavedReplySchema =
  new Schema<ISupportSavedReply>(
    {
      title: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 140,
      },

      shortcut: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 80,
        index: true,
      },

      content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4000,
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

supportSavedReplySchema.index({
  status: 1,
  category: 1,
  updatedAt: -1,
});

supportSavedReplySchema.index({
  title: "text",
  shortcut: "text",
  content: "text",
  tags: "text",
});

/* =========================================================
   MODEL
========================================================= */

export const SupportSavedReply =
  mongoose.models.SupportSavedReply ||
  mongoose.model<ISupportSavedReply>(
    "SupportSavedReply",
    supportSavedReplySchema
  );

export default SupportSavedReply;