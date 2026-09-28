import mongoose, { Document, Schema } from "mongoose";

export type AiSupportCaseEventType =
  | "case_created"
  | "investigation_refreshed"
  | "triage_changed"
  | "assignment_changed"
  | "status_changed"
  | "note_added"
  | "duplicate_detected"
  | "incident_linked"
  | "playbook_started"
  | "playbook_step_updated"
  | "playbook_completed"
  | "outcome_recorded"
  | "case_reopened"
  | "knowledge_draft_created"
  | "knowledge_draft_submitted"
  | "knowledge_draft_reviewed"
  | "knowledge_draft_published";

export interface IAiSupportCaseEvent extends Document {
  caseId: string;
  eventType: AiSupportCaseEventType;
  actorUserId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const SUPPORT_CASE_EVENT_TYPES: AiSupportCaseEventType[] = [
  "case_created",
  "investigation_refreshed",
  "triage_changed",
  "assignment_changed",
  "status_changed",
  "note_added",
  "duplicate_detected",
  "incident_linked",
  "playbook_started",
  "playbook_step_updated",
  "playbook_completed",
  "outcome_recorded",
  "case_reopened",
  "knowledge_draft_created",
  "knowledge_draft_submitted",
  "knowledge_draft_reviewed",
  "knowledge_draft_published",
];

const schema = new Schema<IAiSupportCaseEvent>(
  {
    caseId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
      enum: SUPPORT_CASE_EVENT_TYPES,
    },
    actorUserId: {
      type: String,
      default: null,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    collection: "ai_support_case_events",
  },
);

schema.index({ caseId: 1, createdAt: -1 });

export const AiSupportCaseEvent =
  mongoose.models.AiSupportCaseEvent ||
  mongoose.model<IAiSupportCaseEvent>(
    "AiSupportCaseEvent",
    schema,
  );
