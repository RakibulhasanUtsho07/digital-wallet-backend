import mongoose, {
  Document,
  Schema,
} from "mongoose";

import type {
  SupportSettingsSection,
} from "../services/supportSettingsTypes.js";

/* =========================================================
   INTERFACE
========================================================= */

export interface ISupportSettingsAudit
  extends Document {
  actorId:
    mongoose.Types.ObjectId;

  actorRole:
    string;

  action:
    "SECTION_UPDATED";

  section:
    SupportSettingsSection;

  changedFields:
    string[];

  revision:
    number;

  requestId:
    string;

  occurredAt:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const supportSettingsAuditSchema =
  new Schema<ISupportSettingsAudit>(
    {
      actorId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      actorRole: {
        type:
          String,

        trim:
          true,

        default:
          "support",

        maxlength:
          40,

        required:
          true,

        immutable:
          true,
      },

      action: {
        type:
          String,

        enum: [
          "SECTION_UPDATED",
        ],

        required:
          true,

        immutable:
          true,
      },

      section: {
        type:
          String,

        enum: [
          "general",
          "tickets",
          "assignment",
          "sla",
          "escalation",
          "notifications",
          "aiCopilot",
          "knowledgeBase",
          "savedReplies",
          "security",
          "appearance",
        ],

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      changedFields: {
        type: [
          String,
        ],

        required:
          true,

        default:
          [],

        immutable:
          true,
      },

      revision: {
        type:
          Number,

        required:
          true,

        min:
          1,

        immutable:
          true,

        index:
          true,
      },

      requestId: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        required:
          true,

        immutable:
          true,

        index:
          true,
      },

      occurredAt: {
        type:
          Date,

        default:
          Date.now,

        required:
          true,

        immutable:
          true,

        index:
          true,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

supportSettingsAuditSchema.index(
  {
    occurredAt:
      -1,
  }
);

supportSettingsAuditSchema.index(
  {
    section:
      1,

    occurredAt:
      -1,
  }
);

supportSettingsAuditSchema.index(
  {
    actorId:
      1,

    occurredAt:
      -1,
  }
);

/* =========================================================
   MODEL
========================================================= */

export const SupportSettingsAudit =
  mongoose.models
    .SupportSettingsAudit ||
  mongoose.model<ISupportSettingsAudit>(
    "SupportSettingsAudit",
    supportSettingsAuditSchema
  );

export default SupportSettingsAudit;