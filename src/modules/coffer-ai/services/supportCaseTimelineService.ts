import {
  AiSupportCaseEvent,
  type AiSupportCaseEventType,
} from "../../../models/AiSupportCaseEvent.js";

export async function appendSupportCaseEvent(input: {
  caseId: string;
  eventType: AiSupportCaseEventType;
  actorUserId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  return AiSupportCaseEvent.create({
    caseId: input.caseId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    summary: input.summary.trim().slice(0, 2000),
    metadata: input.metadata ?? {},
  });
}

export async function getSupportCaseTimeline(
  caseId: string,
  limit = 100,
) {
  const rows = await AiSupportCaseEvent.find({ caseId })
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(10, limit)))
    .lean();

  return rows.map((row) => ({
    id: row._id.toString(),
    caseId: row.caseId,
    eventType: row.eventType,
    actorUserId: row.actorUserId ?? null,
    summary: row.summary,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}
