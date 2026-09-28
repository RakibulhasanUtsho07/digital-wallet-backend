import mongoose, { Schema, type Document, type Model } from "mongoose";

export type AiKnowledgeAudience = "user" | "merchant" | "support" | "analyst" | "admin";
export type AiRoleKnowledgeStatus = "submitted" | "published" | "rejected" | "retired";

export interface IAiRoleKnowledge extends Document {
  audienceRole: AiKnowledgeAudience;
  intent: string;
  title: string;
  summary: string;
  content: string;
  sourceReference: string;
  status: AiRoleKnowledgeStatus;
  submittedByUserId: mongoose.Types.ObjectId;
  reviewedByUserId?: mongoose.Types.ObjectId;
  reviewNote?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAiRoleKnowledge>({
  audienceRole: { type: String, enum: ["user", "merchant", "support", "analyst", "admin"], required: true },
  intent: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  summary: { type: String, required: true, trim: true, maxlength: 400 },
  content: { type: String, required: true, trim: true, maxlength: 2400 },
  sourceReference: { type: String, required: true, trim: true, maxlength: 180 },
  status: { type: String, enum: ["submitted", "published", "rejected", "retired"], required: true, default: "submitted" },
  submittedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reviewedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  reviewNote: { type: String, maxlength: 500 },
  reviewedAt: { type: Date },
}, { timestamps: true, strict: "throw" });

schema.index({ status: 1, audienceRole: 1, intent: 1, updatedAt: -1 });
schema.index({ title: "text", summary: "text", content: "text" });

export const AiRoleKnowledge =
  (mongoose.models.AiRoleKnowledge as Model<IAiRoleKnowledge> | undefined) ??
  mongoose.model<IAiRoleKnowledge>("AiRoleKnowledge", schema);
