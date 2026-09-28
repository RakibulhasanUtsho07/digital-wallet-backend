import mongoose, { Document, Schema } from "mongoose";

export type AiSupportIncidentStatus =
  | "detected"
  | "acknowledged"
  | "investigating"
  | "monitoring"
  | "resolved"
  | "closed";

export type AiSupportIncidentSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low";

export interface IAiSupportIncident extends Document {
  incidentId: string;
  fingerprint: string;
  title: string;
  summary: string;
  status: AiSupportIncidentStatus;
  severity: AiSupportIncidentSeverity;
  queue: string;
  causeCode: string | null;
  signalCodes: string[];
  caseIds: string[];
  caseCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  assignedToUserId: string | null;
  createdBy: "system" | "support";
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAiSupportIncident>(
  {
    incidentId: { type: String, required: true, unique: true, index: true },
    fingerprint: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, maxlength: 240 },
    summary: { type: String, required: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ["detected", "acknowledged", "investigating", "monitoring", "resolved", "closed"],
      default: "detected",
      index: true,
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      required: true,
      index: true,
    },
    queue: { type: String, required: true, index: true },
    causeCode: { type: String, default: null, index: true },
    signalCodes: { type: [String], default: [] },
    caseIds: { type: [String], default: [], index: true },
    caseCount: { type: Number, default: 0, min: 0 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true, index: true },
    assignedToUserId: { type: String, default: null, index: true },
    createdBy: { type: String, enum: ["system", "support"], default: "system" },
  },
  { timestamps: true, collection: "ai_support_incidents" },
);

schema.index({ status: 1, severity: 1, lastSeenAt: -1 });

export const AiSupportIncident =
  mongoose.models.AiSupportIncident ||
  mongoose.model<IAiSupportIncident>("AiSupportIncident", schema);
