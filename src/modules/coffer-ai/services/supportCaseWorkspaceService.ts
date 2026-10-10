import crypto from "node:crypto";

import {
  AiSupportCase,
  type AiSupportCasePriority,
  type AiSupportCaseQueue,
  type AiSupportCaseSeverity,
  type AiSupportCaseStatus,
} from "../../../models/AiSupportCase.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";
import {
  investigateSupportIssue,
  type SupportInvestigationResult,
} from "../diagnostics/supportInvestigationService.js";
import type {
  SupportCaseReport,
} from "../diagnostics/supportCaseIntelligenceService.js";
import {
  triageSupportCase,
  type SupportCaseTriageDecision,
} from "../diagnostics/supportCaseTriageService.js";
import {
  correlateSupportCase,
} from "./supportCaseCorrelationService.js";
import {
  calculateSlaDueAt,
  forecastSupportCaseSla,
} from "./supportCaseSlaService.js";
import {
  appendSupportCaseEvent,
} from "./supportCaseTimelineService.js";

export interface SupportCaseWorkspaceView {
  id: string;
  caseId: string;
  subjectKind:
    | "payment"
    | "transaction"
    | "customer";
  subjectReference: string;
  customerIds: string[];
  status: AiSupportCaseStatus;
  severity: AiSupportCaseSeverity;
  priority: AiSupportCasePriority;
  queue: AiSupportCaseQueue;
  responseTargetMinutes: number;
  verification:
    | "verified"
    | "partial"
    | "unknown";
  confidence:
    | "high"
    | "medium"
    | "low";
  confirmedCause: {
    code: string;
    label: string;
    evidenceRefs: string[];
  } | null;
  reasonCodes: string[];
  agentSummary: string;
  customerFacingMessage: string;
  agentChecklist: string[];
  escalation: {
    required: boolean;
    team: string;
    reason: string;
  };
  correlationFingerprint: string | null;
  duplicateOfCaseId: string | null;
  relatedCaseIds: string[];
  incidentId: string | null;
  sla: ReturnType<typeof forecastSupportCaseSla>;
  assignedToUserId:
    string | null;
  createdByUserId:
    string;
  lastInvestigatedAt:
    string;
  notes: Array<{
    id: string;
    authorUserId: string;
    body: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  signalSnapshot: unknown[];
  sourceSnapshot: unknown[];
  timelineSnapshot: unknown[];
}

const ALLOWED_STATUS =
  new Set<AiSupportCaseStatus>([
    "open",
    "investigating",
    "waiting_customer",
    "escalated",
    "resolved",
    "closed",
  ]);

const ALLOWED_QUEUE =
  new Set<AiSupportCaseQueue>([
    "support",
    "payments",
    "provider",
    "risk_security",
    "kyc",
    "engineering",
  ]);

const ALLOWED_PRIORITY =
  new Set<AiSupportCasePriority>([
    "urgent",
    "high",
    "medium",
    "low",
  ]);

function clean(
  value: string,
  max = 180,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    )
    .slice(
      0,
      max,
    );
}

function makeCaseId(): string {
  const now =
    new Date();

  const day =
    [
      now.getUTCFullYear(),
      String(
        now.getUTCMonth() +
          1,
      ).padStart(
        2,
        "0",
      ),
      String(
        now.getUTCDate(),
      ).padStart(
        2,
        "0",
      ),
    ].join("");

  return `AIC-${day}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function getCaseReport(
  result: SupportInvestigationResult,
): SupportCaseReport {
  const report =
    result.data?.caseReport;

  if (
    !report ||
    typeof report !==
      "object"
  ) {
    throw new CofferAiError({
      code: "AI_SUPPORT_CASE_NOT_ACTIONABLE",
      message:
        "The investigation does not contain an actionable case report. Provide an exact payment, transaction, or customer reference first.",
      statusCode: 422,
    });
  }

  return report as SupportCaseReport;
}

function getTriage(
  result: SupportInvestigationResult,
  report: SupportCaseReport,
): SupportCaseTriageDecision {
  const triage =
    result.data?.triage;

  if (
    triage &&
    typeof triage ===
      "object"
  ) {
    return triage as SupportCaseTriageDecision;
  }

  return triageSupportCase(
    report,
  );
}

function toView(
  value: any,
): SupportCaseWorkspaceView {
  return {
    id:
      String(value._id),

    caseId:
      value.caseId,

    subjectKind:
      value.subjectKind,

    subjectReference:
      value.subjectReference,

    customerIds:
      value.customerIds ??
      [],

    status:
      value.status,

    severity:
      value.severity,

    priority:
      value.priority,

    queue:
      value.queue,

    responseTargetMinutes:
      value.responseTargetMinutes,

    verification:
      value.verification,

    confidence:
      value.confidence,

    confirmedCause:
      value.confirmedCause ??
      null,

    reasonCodes:
      value.reasonCodes ??
      [],

    agentSummary:
      value.agentSummary,

    customerFacingMessage:
      value.customerFacingMessage,

    agentChecklist:
      value.agentChecklist ??
      [],

    escalation:
      value.escalation,

    correlationFingerprint:
      value.correlationFingerprint ?? null,
    duplicateOfCaseId:
      value.duplicateOfCaseId ?? null,
    relatedCaseIds:
      value.relatedCaseIds ?? [],
    incidentId:
      value.incidentId ?? null,
    sla:
      forecastSupportCaseSla({
        createdAt: new Date(value.createdAt),
        dueAt: new Date(value.slaDueAt),
        responseTargetMinutes: value.responseTargetMinutes,
        firstResponseAt: value.firstResponseAt
          ? new Date(value.firstResponseAt)
          : null,
      }),
    assignedToUserId:
      value.assignedToUserId ??
      null,

    createdByUserId:
      value.createdByUserId,

    lastInvestigatedAt:
      new Date(
        value.lastInvestigatedAt,
      ).toISOString(),

    notes:
      (
        value.notes ??
        []
      ).map(
        (note: any) => ({
          id:
            String(
              note._id,
            ),
          authorUserId:
            note.authorUserId,
          body:
            note.body,
          createdAt:
            new Date(
              note.createdAt,
            ).toISOString(),
        }),
      ),

    createdAt:
      new Date(
        value.createdAt,
      ).toISOString(),

    updatedAt:
      new Date(
        value.updatedAt,
      ).toISOString(),

    signalSnapshot:
      value.signalSnapshot ??
      [],

    sourceSnapshot:
      value.sourceSnapshot ??
      [],

    timelineSnapshot:
      value.timelineSnapshot ??
      [],
  };
}

export async function createOrRefreshSupportCase(input: {
  message: string;
  resourceId?: string | null;
  supportUserId: string;
  assignToMe?: boolean;
}): Promise<{
  case: SupportCaseWorkspaceView;
  investigation: SupportInvestigationResult;
  created: boolean;
}> {
  const message =
    clean(
      input.message,
      500,
    );

  const resourceId =
    input.resourceId
      ? clean(
          input.resourceId,
          180,
        )
      : null;

  const investigation =
    await investigateSupportIssue({
      message,
      resourceId,
      limit: 8,
    });

  const report =
    getCaseReport(
      investigation,
    );

  const triage =
    getTriage(
      investigation,
      report,
    );

  const customerIds =
    Array.from(
      new Set(
        report.customers.map(
          (customer) =>
            customer.id,
        ),
      ),
    );

  const existing =
    await AiSupportCase.findOne({
      subjectKind:
        report.subject.kind,
      subjectReference:
        report.subject.id,
      status: {
        $nin: [
          "closed",
        ],
      },
    });

  const snapshot = {
    customerIds,
    severity:
      triage.severity,
    priority:
      triage.priority,
    queue:
      triage.queue,
    responseTargetMinutes:
      triage.responseTargetMinutes,
    verification:
      report.verification,
    confidence:
      report.confidence,
    confirmedCause:
      report.confirmedCause,
    reasonCodes:
      triage.reasonCodes,
    agentSummary:
      report.agentSummary,
    customerFacingMessage:
      report.customerFacingMessage,
    agentChecklist:
      report.agentChecklist,
    signalSnapshot:
      report.signals.slice(
        0,
        30,
      ),
    sourceSnapshot:
      report.sources.slice(
        0,
        50,
      ),
    timelineSnapshot:
      report.timeline.slice(
        0,
        30,
      ),
    escalation:
      {
        required:
          triage.escalationRequired,
        team:
          triage.queue,
        reason:
          triage.explanation,
      },
    lastInvestigatedAt:
      new Date(),
  };

  if (existing) {
    const previousTriage = {
      severity: existing.severity,
      priority: existing.priority,
      queue: existing.queue,
      responseTargetMinutes: existing.responseTargetMinutes,
    };

    existing.customerIds =
      snapshot.customerIds;

    existing.severity =
      snapshot.severity;

    existing.priority =
      snapshot.priority;

    existing.queue =
      snapshot.queue;

    existing.responseTargetMinutes =
      snapshot.responseTargetMinutes;

    existing.verification =
      snapshot.verification;

    existing.confidence =
      snapshot.confidence;

    existing.confirmedCause =
      snapshot.confirmedCause;

    existing.reasonCodes =
      snapshot.reasonCodes;

    existing.agentSummary =
      snapshot.agentSummary;

    existing.customerFacingMessage =
      snapshot.customerFacingMessage;

    existing.agentChecklist =
      snapshot.agentChecklist;

    existing.signalSnapshot =
      snapshot.signalSnapshot;

    existing.sourceSnapshot =
      snapshot.sourceSnapshot;

    existing.timelineSnapshot =
      snapshot.timelineSnapshot;

    existing.escalation =
      snapshot.escalation;

    existing.lastInvestigatedAt =
      snapshot.lastInvestigatedAt;

    existing.slaDueAt =
      calculateSlaDueAt(
        existing.createdAt,
        existing.responseTargetMinutes,
      );

    if (
      input.assignToMe
    ) {
      existing.assignedToUserId =
        input.supportUserId;

      if (
        existing.status ===
        "open"
      ) {
        existing.status =
          "investigating";
      }
    }

    await existing.save();

    await appendSupportCaseEvent({
      caseId: existing.caseId,
      eventType: "investigation_refreshed",
      actorUserId: input.supportUserId,
      summary: "Live evidence was re-investigated and the case snapshot was refreshed.",
      metadata: {
        verification: existing.verification,
        confidence: existing.confidence,
      },
    });

    const triageChanged =
      previousTriage.severity !== existing.severity ||
      previousTriage.priority !== existing.priority ||
      previousTriage.queue !== existing.queue ||
      previousTriage.responseTargetMinutes !== existing.responseTargetMinutes;

    if (triageChanged) {
      await appendSupportCaseEvent({
        caseId: existing.caseId,
        eventType: "triage_changed",
        actorUserId: input.supportUserId,
        summary: `Automatic triage changed to ${existing.severity}/${existing.priority} → ${existing.queue}.`,
        metadata: {
          previous: previousTriage,
          current: {
            severity: existing.severity,
            priority: existing.priority,
            queue: existing.queue,
            responseTargetMinutes: existing.responseTargetMinutes,
          },
        },
      });
    }

    const correlation = await correlateSupportCase(existing.caseId);
    const refreshed = await AiSupportCase.findOne({ caseId: existing.caseId });

    return {
      case: toView(refreshed ?? existing),
      investigation: {
        ...investigation,
        data: {
          ...investigation.data,
          correlation,
        },
      },
      created: false,
    };
  }

  const created =
    await AiSupportCase.create({
      caseId:
        makeCaseId(),

      subjectKind:
        report.subject.kind,

      subjectReference:
        report.subject.id,

      ...snapshot,

      status:
        input.assignToMe
          ? "investigating"
          : "open",

      assignedToUserId:
        input.assignToMe
          ? input.supportUserId
          : null,

      createdByUserId:
        input.supportUserId,

      correlationFingerprint: null,
      duplicateOfCaseId: null,
      relatedCaseIds: [],
      incidentId: null,
      slaDueAt: calculateSlaDueAt(
        new Date(),
        snapshot.responseTargetMinutes,
      ),
      firstResponseAt: null,

      notes: [],
    });

  await appendSupportCaseEvent({
    caseId: created.caseId,
    eventType: "case_created",
    actorUserId: input.supportUserId,
    summary: `AI Support case created with ${created.severity}/${created.priority} triage for ${created.queue}.`,
    metadata: {
      subjectKind: created.subjectKind,
      subjectReference: created.subjectReference,
      responseTargetMinutes: created.responseTargetMinutes,
    },
  });

  const correlation = await correlateSupportCase(created.caseId);
  const refreshed = await AiSupportCase.findOne({ caseId: created.caseId });

  return {
    case: toView(refreshed ?? created),
    investigation: {
      ...investigation,
      data: {
        ...investigation.data,
        correlation,
      },
    },
    created: true,
  };
}

export async function listSupportCases(input: {
  page?: number;
  limit?: number;
  status?: string | null;
  queue?: string | null;
  priority?: string | null;
  assignedToUserId?: string | null;
}): Promise<{
  cases: SupportCaseWorkspaceView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}> {
  const page =
    Math.max(
      1,
      input.page ??
        1,
    );

  const limit =
    Math.min(
      50,
      Math.max(
        5,
        input.limit ??
          20,
      ),
    );

  const query:
    Record<string, unknown> =
    {};

  if (
    input.status &&
    ALLOWED_STATUS.has(
      input.status as AiSupportCaseStatus,
    )
  ) {
    query.status =
      input.status;
  }

  if (
    input.queue &&
    ALLOWED_QUEUE.has(
      input.queue as AiSupportCaseQueue,
    )
  ) {
    query.queue =
      input.queue;
  }

  if (
    input.priority &&
    ALLOWED_PRIORITY.has(
      input.priority as AiSupportCasePriority,
    )
  ) {
    query.priority =
      input.priority;
  }

  if (
    input.assignedToUserId
  ) {
    query.assignedToUserId =
      input.assignedToUserId;
  }

  const [
    rows,
    total,
  ] =
    await Promise.all([
      AiSupportCase.find(
        query,
      )
        .sort({
          priority: 1,
          updatedAt: -1,
        })
        .skip(
          (page - 1) *
            limit,
        )
        .limit(
          limit,
        ),

      AiSupportCase.countDocuments(
        query,
      ),
    ]);

  return {
    cases:
      rows.map(
        toView,
      ),
    page,
    limit,
    total,
    pages:
      Math.max(
        1,
        Math.ceil(
          total /
            limit,
        ),
      ),
  };
}

export async function getSupportCase(
  caseId: string,
): Promise<SupportCaseWorkspaceView> {
  const normalized =
    clean(
      caseId,
      80,
    );

  const row =
    await AiSupportCase.findOne({
      caseId:
        normalized,
    });

  if (!row) {
    throw new CofferAiError({
      code: "AI_SUPPORT_CASE_NOT_FOUND",
      message:
        "The AI Support case was not found.",
      statusCode: 404,
    });
  }

  return toView(
    row,
  );
}

export async function updateSupportCase(input: {
  caseId: string;
  supportUserId: string;
  status?: string;
  assignToMe?: boolean;
}): Promise<SupportCaseWorkspaceView> {
  const row = await AiSupportCase.findOne({
    caseId: clean(input.caseId, 80),
  });

  if (!row) {
    throw new CofferAiError({
      code: "AI_SUPPORT_CASE_NOT_FOUND",
      message: "The AI Support case was not found.",
      statusCode: 404,
    });
  }

  const previousStatus = row.status;
  const previousAssignee = row.assignedToUserId;

  if (input.status) {
    const status = input.status.trim().toLowerCase() as AiSupportCaseStatus;

    if (!ALLOWED_STATUS.has(status)) {
      throw new CofferAiError({
        code: "AI_SUPPORT_CASE_STATUS_INVALID",
        message: "The requested case status is invalid.",
        statusCode: 400,
      });
    }

    row.status = status;
  }

  if (input.assignToMe) {
    row.assignedToUserId = input.supportUserId;
    if (row.status === "open") row.status = "investigating";
  }

  if (
    !row.firstResponseAt &&
    ["investigating", "waiting_customer", "escalated", "resolved"].includes(row.status)
  ) {
    row.firstResponseAt = new Date();
  }

  await row.save();

  if (previousStatus !== row.status) {
    await appendSupportCaseEvent({
      caseId: row.caseId,
      eventType: "status_changed",
      actorUserId: input.supportUserId,
      summary: `Case status changed from ${previousStatus} to ${row.status}.`,
      metadata: { previousStatus, currentStatus: row.status },
    });
  }

  if (previousAssignee !== row.assignedToUserId) {
    await appendSupportCaseEvent({
      caseId: row.caseId,
      eventType: "assignment_changed",
      actorUserId: input.supportUserId,
      summary: "Case assignment changed.",
      metadata: {
        previousAssignee,
        currentAssignee: row.assignedToUserId,
      },
    });
  }

  return toView(row);
}

export async function addSupportCaseNote(input: {
  caseId: string;
  supportUserId: string;
  body: string;
}): Promise<SupportCaseWorkspaceView> {
  const body =
    clean(
      input.body,
      2_000,
    );

  if (
    body.length <
      2
  ) {
    throw new CofferAiError({
      code: "AI_SUPPORT_CASE_NOTE_INVALID",
      message:
        "A case note is required.",
      statusCode: 400,
    });
  }

  const row =
    await AiSupportCase.findOne({
      caseId:
        clean(
          input.caseId,
          80,
        ),
    });

  if (!row) {
    throw new CofferAiError({
      code: "AI_SUPPORT_CASE_NOT_FOUND",
      message:
        "The AI Support case was not found.",
      statusCode: 404,
    });
  }

  row.notes.push({
    authorUserId:
      input.supportUserId,
    body,
    createdAt:
      new Date(),
  });

  await row.save();

  await appendSupportCaseEvent({
    caseId: row.caseId,
    eventType: "note_added",
    actorUserId: input.supportUserId,
    summary: "Internal Support note added.",
    metadata: {
      notePreview: body.slice(0, 160),
    },
  });

  return toView(
    row,
  );
}
