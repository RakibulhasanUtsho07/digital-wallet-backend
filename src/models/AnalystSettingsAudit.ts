import mongoose, {
  type Document,
  type Model,
  Schema,
} from "mongoose";

import type {
  AnalystSettingsSection,
} from "../services/analystSettingsTypes.js";

export interface IAnalystSettingsAudit
  extends Document {
  ownerId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  action: "SECTION_UPDATED";
  section: AnalystSettingsSection;
  changedFields: string[];
  revision: number;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAnalystSettingsAudit>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },
    actorRole: {
      type: String,
      trim: true,
      maxlength: 40,
      required: true,
      immutable: true,
    },
    action: {
      type: String,
      enum: ["SECTION_UPDATED"],
      required: true,
      immutable: true,
    },
    section: {
      type: String,
      enum: [
        "general",
        "dataScope",
        "providerMonitoring",
        "alerts",
        "risk",
        "anomalies",
        "reports",
        "aiInsights",
        "export",
        "appearance",
      ],
      required: true,
      index: true,
      immutable: true,
    },
    changedFields: {
      type: [String],
      default: [],
      required: true,
      immutable: true,
    },
    revision: {
      type: Number,
      min: 1,
      required: true,
      index: true,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

schema.index({ ownerId: 1, occurredAt: -1 });

const ModelRef: Model<IAnalystSettingsAudit> =
  (mongoose.models.AnalystSettingsAudit as Model<IAnalystSettingsAudit>) ||
  mongoose.model<IAnalystSettingsAudit>("AnalystSettingsAudit", schema);

export const AnalystSettingsAudit = ModelRef;
export default ModelRef;
