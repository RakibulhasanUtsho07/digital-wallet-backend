import mongoose, { Document, Model, Schema } from "mongoose";
import type { AnalystMode, AnalystRange } from "../types/analystTypes.js";

export type AnalystReportFormat = "executive" | "payments" | "risk" | "revenue";
export type AnalystReportStatus = "processing" | "ready" | "failed";

export interface IAnalystReport extends Document {
  requestedById: mongoose.Types.ObjectId;
  range: AnalystRange;
  mode: AnalystMode;
  currency: string;
  format: AnalystReportFormat;
  status: AnalystReportStatus;
  snapshot?: Record<string, unknown>;
  errorMessage?: string;
  completedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAnalystReport>({
  requestedById: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  range: { type: String, enum: ["24h", "7d", "30d", "90d"], required: true, index: true },
  mode: { type: String, enum: ["all", "test", "live"], required: true, default: "all" },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
  format: { type: String, enum: ["executive", "payments", "risk", "revenue"], required: true },
  status: { type: String, enum: ["processing", "ready", "failed"], required: true, default: "processing", index: true },
  snapshot: { type: Schema.Types.Mixed, default: undefined },
  errorMessage: { type: String, maxlength: 500, default: undefined },
  completedAt: { type: Date, default: undefined },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, versionKey: false, strict: "throw", minimize: false });

schema.index({ requestedById: 1, createdAt: -1 });

const ModelRef: Model<IAnalystReport> =
  (mongoose.models.AnalystReport as Model<IAnalystReport>) ||
  mongoose.model<IAnalystReport>("AnalystReport", schema);

export const AnalystReport = ModelRef;
export default ModelRef;
