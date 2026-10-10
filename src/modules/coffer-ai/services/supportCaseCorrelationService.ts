import crypto from "node:crypto";

import {
  AiSupportCase,
  type IAiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportIncident,
  type AiSupportIncidentSeverity,
  type AiSupportIncidentStatus,
} from "../../../models/AiSupportIncident.js";
import { CofferAiError } from "../errors/cofferAiError.js";
import { appendSupportCaseEvent } from "./supportCaseTimelineService.js";

const ACTIVE_CASE_STATES = [
  "open",
  "investigating",
  "waiting_customer",
  "escalated",
  "resolved",
];

function warningSignalCodes(row: IAiSupportCase): string[] {
  return Array.from(
    new Set(
      (row.signalSnapshot ?? [])
        .filter((signal) =>
          signal.severity === "blocker" ||
          signal.severity === "warning",
        )
        .map((signal) => signal.code.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort();
}

function fingerprint(row: IAiSupportCase): string {
  const raw = [
    row.subjectKind,
    row.queue,
    row.confirmedCause?.code?.trim().toLowerCase() || "unknown",
    warningSignalCodes(row).slice(0, 4).join(","),
  ].join("|");

  return crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 24);
}

function sharedCount(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
}

function scorePair(current: IAiSupportCase, other: IAiSupportCase) {
  let score = 0;
  const reasons: string[] = [];

  if (
    current.subjectKind === other.subjectKind &&
    current.subjectReference === other.subjectReference
  ) {
    score += 100;
    reasons.push("same subject reference");
  }

  const sharedCustomers = sharedCount(
    current.customerIds ?? [],
    other.customerIds ?? [],
  );
  if (sharedCustomers > 0) {
    score += Math.min(30, 20 + sharedCustomers * 5);
    reasons.push("same customer context");
  }

  if (
    current.confirmedCause?.code &&
    other.confirmedCause?.code &&
    current.confirmedCause.code === other.confirmedCause.code
  ) {
    score += 30;
    reasons.push("same verified cause");
  }

  if (current.queue === other.queue) {
    score += 10;
    reasons.push("same recommended queue");
  }

  const sharedSignals = sharedCount(
    warningSignalCodes(current),
    warningSignalCodes(other),
  );
  if (sharedSignals > 0) {
    score += Math.min(20, sharedSignals * 5);
    reasons.push(`${sharedSignals} shared warning/blocker signal(s)`);
  }

  const ageHours =
    Math.abs(current.createdAt.getTime() - other.createdAt.getTime()) /
    3_600_000;

  if (ageHours <= 24) {
    score += 10;
    reasons.push("occurred within 24 hours");
  } else if (ageHours <= 72) {
    score += 5;
    reasons.push("occurred within 72 hours");
  }

  return { score: Math.min(100, score), reasons };
}

function incidentSeverity(cases: IAiSupportCase[]): AiSupportIncidentSeverity {
  if (cases.some((item) => item.severity === "critical") || cases.length >= 8) {
    return "critical";
  }
  if (cases.some((item) => item.severity === "high") || cases.length >= 5) {
    return "high";
  }
  if (cases.length >= 3) return "medium";
  return "low";
}

function makeIncidentId(): string {
  const now = new Date();
  const stamp =
    `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}`;

  return `INC-${stamp}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function refreshIncident(current: IAiSupportCase) {
  const key = current.correlationFingerprint || fingerprint(current);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const cluster = await AiSupportCase.find({
    correlationFingerprint: key,
    createdAt: { $gte: since },
    status: { $in: ACTIVE_CASE_STATES },
  });

  if (cluster.length < 3) return null;

  const caseIds = Array.from(new Set(cluster.map((row) => row.caseId)));
  const causeCode = current.confirmedCause?.code ?? null;
  const severity = incidentSeverity(cluster);

  let incident = await AiSupportIncident.findOne({
    fingerprint: key,
    status: { $nin: ["closed"] },
  });

  const title = causeCode
    ? `${current.queue.replace("_", "/")} incident: ${causeCode}`
    : `${current.queue.replace("_", "/")} incident candidate`;

  const summary =
    `${caseIds.length} correlated Support cases were detected in the last 24 hours. ` +
    (causeCode
      ? `Shared verified cause: ${causeCode}.`
      : "The cases share queue/signal characteristics but no shared exact cause is proven.");

  if (!incident) {
    incident = await AiSupportIncident.create({
      incidentId: makeIncidentId(),
      fingerprint: key,
      title,
      summary,
      status: "detected",
      severity,
      queue: current.queue,
      causeCode,
      signalCodes: warningSignalCodes(current),
      caseIds,
      caseCount: caseIds.length,
      firstSeenAt: new Date(
        Math.min(...cluster.map((row) => row.createdAt.getTime())),
      ),
      lastSeenAt: new Date(),
      assignedToUserId: null,
      createdBy: "system",
    });
  } else {
    incident.title = title;
    incident.summary = summary;
    incident.severity = severity;
    incident.queue = current.queue;
    incident.causeCode = causeCode;
    incident.signalCodes = warningSignalCodes(current);
    incident.caseIds = caseIds;
    incident.caseCount = caseIds.length;
    incident.lastSeenAt = new Date();
    await incident.save();
  }

  await AiSupportCase.updateMany(
    { caseId: { $in: caseIds } },
    { $set: { incidentId: incident.incidentId } },
  );

  return {
    incidentId: incident.incidentId,
    status: incident.status,
    severity: incident.severity,
    caseCount: incident.caseCount,
  };
}

export async function correlateSupportCase(caseId: string) {
  const current = await AiSupportCase.findOne({ caseId });
  if (!current) {
    throw new CofferAiError({
      code: "AI_SUPPORT_CASE_NOT_FOUND",
      message: "The AI Support case was not found.",
      statusCode: 404,
    });
  }

  const key = fingerprint(current);
  if (current.correlationFingerprint !== key) {
    current.correlationFingerprint = key;
    await current.save();
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = await AiSupportCase.find({
    caseId: { $ne: current.caseId },
    createdAt: { $gte: since },
    status: { $in: ACTIVE_CASE_STATES },
    $or: [
      { correlationFingerprint: key },
      { customerIds: { $in: current.customerIds ?? [] } },
      ...(current.confirmedCause?.code
        ? [{ "confirmedCause.code": current.confirmedCause.code }]
        : []),
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(50);

  const similarCases = candidates
    .map((candidate) => {
      const { score, reasons } = scorePair(current, candidate);
      return {
        caseId: candidate.caseId,
        score,
        relation: score >= 70 ? ("duplicate" as const) : ("similar" as const),
        reasons,
        status: candidate.status,
        priority: candidate.priority,
        queue: candidate.queue,
        updatedAt: candidate.updatedAt.toISOString(),
      };
    })
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score);

  const duplicate =
    similarCases.find((item) => item.relation === "duplicate") ?? null;

  const previousDuplicate = current.duplicateOfCaseId ?? null;
  current.duplicateOfCaseId = duplicate?.caseId ?? null;
  current.relatedCaseIds = similarCases.slice(0, 10).map((item) => item.caseId);
  await current.save();

  if (duplicate && previousDuplicate !== duplicate.caseId) {
    await appendSupportCaseEvent({
      caseId: current.caseId,
      eventType: "duplicate_detected",
      actorUserId: null,
      summary: `Potential duplicate detected: ${duplicate.caseId} (${duplicate.score}% score).`,
      metadata: {
        duplicateCaseId: duplicate.caseId,
        score: duplicate.score,
        reasons: duplicate.reasons,
      },
    });
  }

  const incident = await refreshIncident(current);

  if (incident && current.incidentId !== incident.incidentId) {
    current.incidentId = incident.incidentId;
    await current.save();

    await appendSupportCaseEvent({
      caseId: current.caseId,
      eventType: "incident_linked",
      actorUserId: null,
      summary: `Case linked to incident ${incident.incidentId}.`,
      metadata: incident,
    });
  }

  return {
    fingerprint: key,
    duplicateOfCaseId: duplicate?.caseId ?? null,
    similarCases,
    incident,
  };
}

export async function listSupportIncidents(input: {
  page?: number;
  limit?: number;
  status?: string | null;
  severity?: string | null;
}) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(50, Math.max(5, input.limit ?? 20));
  const query: Record<string, unknown> = {};

  if (input.status) query.status = input.status;
  if (input.severity) query.severity = input.severity;

  const [rows, total] = await Promise.all([
    AiSupportIncident.find(query)
      .sort({ lastSeenAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AiSupportIncident.countDocuments(query),
  ]);

  return {
    incidents: rows.map((row) => ({
      id: row._id.toString(),
      incidentId: row.incidentId,
      title: row.title,
      summary: row.summary,
      status: row.status,
      severity: row.severity,
      queue: row.queue,
      causeCode: row.causeCode ?? null,
      signalCodes: row.signalCodes ?? [],
      caseIds: row.caseIds ?? [],
      caseCount: row.caseCount,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      assignedToUserId: row.assignedToUserId ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getSupportIncident(incidentId: string) {
  const incident = await AiSupportIncident.findOne({
    incidentId: incidentId.trim(),
  }).lean();

  if (!incident) {
    throw new CofferAiError({
      code: "AI_SUPPORT_INCIDENT_NOT_FOUND",
      message: "The correlated Support incident was not found.",
      statusCode: 404,
    });
  }

  const cases = await AiSupportCase.find({
    caseId: { $in: incident.caseIds },
  })
    .sort({ updatedAt: -1 })
    .select(
      "caseId subjectKind subjectReference status severity priority queue verification confidence confirmedCause customerIds updatedAt",
    )
    .lean();

  return {
    incident,
    cases: cases.map((row) => ({
      caseId: row.caseId,
      subjectKind: row.subjectKind,
      subjectReference: row.subjectReference,
      status: row.status,
      severity: row.severity,
      priority: row.priority,
      queue: row.queue,
      verification: row.verification,
      confidence: row.confidence,
      confirmedCause: row.confirmedCause ?? null,
      customerIds: row.customerIds ?? [],
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export async function updateSupportIncident(input: {
  incidentId: string;
  supportUserId: string;
  status?: string;
  assignToMe?: boolean;
}) {
  const allowed = new Set<AiSupportIncidentStatus>([
    "detected",
    "acknowledged",
    "investigating",
    "monitoring",
    "resolved",
    "closed",
  ]);

  const incident = await AiSupportIncident.findOne({
    incidentId: input.incidentId.trim(),
  });

  if (!incident) {
    throw new CofferAiError({
      code: "AI_SUPPORT_INCIDENT_NOT_FOUND",
      message: "The correlated Support incident was not found.",
      statusCode: 404,
    });
  }

  if (input.status) {
    const status = input.status.trim().toLowerCase() as AiSupportIncidentStatus;
    if (!allowed.has(status)) {
      throw new CofferAiError({
        code: "AI_SUPPORT_INCIDENT_STATUS_INVALID",
        message: "The requested incident status is invalid.",
        statusCode: 400,
      });
    }
    incident.status = status;
  }

  if (input.assignToMe) {
    incident.assignedToUserId = input.supportUserId;
    if (incident.status === "detected") incident.status = "acknowledged";
  }

  await incident.save();

  return {
    incidentId: incident.incidentId,
    status: incident.status,
    severity: incident.severity,
    queue: incident.queue,
    caseCount: incident.caseCount,
    assignedToUserId: incident.assignedToUserId ?? null,
    updatedAt: incident.updatedAt.toISOString(),
  };
}
