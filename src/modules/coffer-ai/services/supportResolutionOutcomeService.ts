import crypto from "node:crypto";

import {
  AiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportCaseOutcome,
  type AiSupportOutcomeStatus,
  type AiSupportResolutionCode,
  type AiSupportResolutionSource,
} from "../../../models/AiSupportCaseOutcome.js";
import {
  AiSupportPlaybookRun,
} from "../../../models/AiSupportPlaybookRun.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";
import {
  appendSupportCaseEvent,
} from "./supportCaseTimelineService.js";

const OUTCOME_STATUSES =
  new Set<AiSupportOutcomeStatus>([
    "resolved",
    "escalated",
    "unresolved",
    "duplicate",
    "reopened",
  ]);

const RESOLUTION_SOURCES =
  new Set<AiSupportResolutionSource>([
    "playbook",
    "manual",
    "escalation",
    "duplicate",
  ]);

const RESOLUTION_CODES =
  new Set<AiSupportResolutionCode>([
    "customer_action_success",
    "provider_recovered",
    "payment_final_state_confirmed",
    "duplicate_case",
    "internal_fix",
    "kyc_flow_completed",
    "risk_review_completed",
    "issue_no_longer_reproducible",
    "other",
    "unknown",
  ]);

function makeOutcomeId(): string {
  const now =
    new Date();

  const stamp =
    `${now.getUTCFullYear()}${String(
      now.getUTCMonth() +
        1,
    ).padStart(
      2,
      "0",
    )}${String(
      now.getUTCDate(),
    ).padStart(
      2,
      "0",
    )}`;

  return `OUT-${stamp}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function clean(
  value: string,
  max = 2_000,
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

function minutesBetween(
  from: Date,
  to: Date,
): number {
  return Math.max(
    0,
    Math.round(
      (
        to.getTime() -
        from.getTime()
      ) /
        60_000,
    ),
  );
}

function toOutcomeView(
  row: any,
) {
  return {
    id:
      String(
        row._id,
      ),
    outcomeId:
      row.outcomeId,
    caseId:
      row.caseId,
    status:
      row.status,
    resolutionSource:
      row.resolutionSource,
    resolutionCode:
      row.resolutionCode,
    playbookRunId:
      row.playbookRunId ??
      null,
    playbookId:
      row.playbookId ??
      null,
    confirmedCauseCode:
      row.confirmedCauseCode ??
      null,
    queueAtResolution:
      row.queueAtResolution,
    customerConfirmedResolved:
      row.customerConfirmedResolved ??
      null,
    agentConfirmed:
      row.agentConfirmed,
    resolvedByUserId:
      row.resolvedByUserId ??
      null,
    escalationTeam:
      row.escalationTeam ??
      null,
    duplicateOfCaseId:
      row.duplicateOfCaseId ??
      null,
    resolutionNote:
      row.resolutionNote ??
      null,
    firstResolvedAt:
      row.firstResolvedAt
        ? new Date(
            row.firstResolvedAt,
          ).toISOString()
        : null,
    lastResolvedAt:
      row.lastResolvedAt
        ? new Date(
            row.lastResolvedAt,
          ).toISOString()
        : null,
    timeToResolutionMinutes:
      row.timeToResolutionMinutes ??
      null,
    reopenedCount:
      row.reopenedCount ??
      0,
    lastReopenedAt:
      row.lastReopenedAt
        ? new Date(
            row.lastReopenedAt,
          ).toISOString()
        : null,
    lastReopenedByUserId:
      row.lastReopenedByUserId ??
      null,
    createdAt:
      new Date(
        row.createdAt,
      ).toISOString(),
    updatedAt:
      new Date(
        row.updatedAt,
      ).toISOString(),
  };
}

async function verifyPlaybookRun(input: {
  caseId: string;
  playbookRunId: string | null;
  resolutionSource: AiSupportResolutionSource;
}) {
  if (
    input.resolutionSource !==
    "playbook"
  ) {
    return null;
  }

  if (
    !input.playbookRunId
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_REQUIRED",
      message:
        "A completed playbook run is required when resolutionSource is playbook.",
      statusCode:
        422,
    });
  }

  const run =
    await AiSupportPlaybookRun.findOne({
      runId:
        input.playbookRunId,
      caseId:
        input.caseId,
    });

  if (
    !run
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_NOT_FOUND",
      message:
        "The selected playbook run does not belong to this Support case.",
      statusCode:
        404,
    });
  }

  if (
    run.status !==
    "completed"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_INCOMPLETE",
      message:
        "Complete all required guided-resolution steps before recording a playbook-based resolution.",
      statusCode:
        422,
    });
  }

  return run;
}

export async function recordSupportCaseOutcome(input: {
  caseId: string;
  supportUserId: string;
  status: string;
  resolutionSource: string;
  resolutionCode: string;
  playbookRunId?: string | null;
  customerConfirmedResolved?: boolean | null;
  escalationTeam?: string | null;
  duplicateOfCaseId?: string | null;
  resolutionNote?: string | null;
  agentConfirmed: boolean;
}) {
  const status =
    input.status
      .trim()
      .toLowerCase() as AiSupportOutcomeStatus;

  const resolutionSource =
    input.resolutionSource
      .trim()
      .toLowerCase() as AiSupportResolutionSource;

  const resolutionCode =
    input.resolutionCode
      .trim()
      .toLowerCase() as AiSupportResolutionCode;

  if (
    !OUTCOME_STATUSES.has(
      status,
    ) ||
    status ===
      "reopened"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_OUTCOME_STATUS_INVALID",
      message:
        "Outcome status must be resolved, escalated, unresolved, or duplicate.",
      statusCode:
        400,
    });
  }

  if (
    !RESOLUTION_SOURCES.has(
      resolutionSource,
    )
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_RESOLUTION_SOURCE_INVALID",
      message:
        "The selected resolutionSource is invalid.",
      statusCode:
        400,
    });
  }

  if (
    !RESOLUTION_CODES.has(
      resolutionCode,
    )
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_RESOLUTION_CODE_INVALID",
      message:
        "The selected resolutionCode is invalid.",
      statusCode:
        400,
    });
  }

  if (
    input.agentConfirmed !==
    true
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_OUTCOME_HUMAN_CONFIRMATION_REQUIRED",
      message:
        "A Support Agent must explicitly confirm the case outcome. Coffer AI cannot auto-resolve a case.",
      statusCode:
        422,
    });
  }

  if (
    status ===
      "duplicate" &&
    !input.duplicateOfCaseId?.trim()
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_DUPLICATE_REFERENCE_REQUIRED",
      message:
        "duplicateOfCaseId is required for a duplicate outcome.",
      statusCode:
        422,
    });
  }

  const supportCase =
    await AiSupportCase.findOne({
      caseId:
        input.caseId.trim(),
    });

  if (
    !supportCase
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_CASE_NOT_FOUND",
      message:
        "The AI Support case was not found.",
      statusCode:
        404,
    });
  }

  const playbookRun =
    await verifyPlaybookRun({
      caseId:
        supportCase.caseId,
      playbookRunId:
        input.playbookRunId ??
        null,
      resolutionSource,
    });

  const now =
    new Date();

  const resolutionLike =
    status ===
      "resolved" ||
    status ===
      "duplicate";

  let outcome =
    await AiSupportCaseOutcome.findOne({
      caseId:
        supportCase.caseId,
    });

  if (
    !outcome
  ) {
    outcome =
      await AiSupportCaseOutcome.create({
        outcomeId:
          makeOutcomeId(),
        caseId:
          supportCase.caseId,
        status,
        resolutionSource,
        resolutionCode,
        playbookRunId:
          playbookRun?.runId ??
          null,
        playbookId:
          playbookRun?.playbookId ??
          null,
        confirmedCauseCode:
          supportCase.confirmedCause?.code ??
          null,
        queueAtResolution:
          supportCase.queue,
        customerConfirmedResolved:
          typeof input.customerConfirmedResolved ===
          "boolean"
            ? input.customerConfirmedResolved
            : null,
        agentConfirmed:
          true,
        resolvedByUserId:
          input.supportUserId,
        escalationTeam:
          input.escalationTeam?.trim() ||
          (
            status ===
              "escalated"
              ? supportCase.queue
              : null
          ),
        duplicateOfCaseId:
          input.duplicateOfCaseId?.trim() ||
          null,
        resolutionNote:
          input.resolutionNote
            ? clean(
                input.resolutionNote,
              )
            : null,
        firstResolvedAt:
          resolutionLike
            ? now
            : null,
        lastResolvedAt:
          resolutionLike
            ? now
            : null,
        timeToResolutionMinutes:
          resolutionLike
            ? minutesBetween(
                supportCase.createdAt,
                now,
              )
            : null,
        reopenedCount:
          0,
        lastReopenedAt:
          null,
        lastReopenedByUserId:
          null,
      });
  } else {
    outcome.status =
      status;
    outcome.resolutionSource =
      resolutionSource;
    outcome.resolutionCode =
      resolutionCode;
    outcome.playbookRunId =
      playbookRun?.runId ??
      (
        resolutionSource ===
          "playbook"
          ? outcome.playbookRunId
          : null
      );
    outcome.playbookId =
      playbookRun?.playbookId ??
      (
        resolutionSource ===
          "playbook"
          ? outcome.playbookId
          : null
      );
    outcome.confirmedCauseCode =
      supportCase.confirmedCause?.code ??
      null;
    outcome.queueAtResolution =
      supportCase.queue;
    outcome.customerConfirmedResolved =
      typeof input.customerConfirmedResolved ===
      "boolean"
        ? input.customerConfirmedResolved
        : outcome.customerConfirmedResolved;
    outcome.agentConfirmed =
      true;
    outcome.resolvedByUserId =
      input.supportUserId;
    outcome.escalationTeam =
      input.escalationTeam?.trim() ||
      (
        status ===
          "escalated"
          ? supportCase.queue
          : null
      );
    outcome.duplicateOfCaseId =
      input.duplicateOfCaseId?.trim() ||
      null;
    outcome.resolutionNote =
      input.resolutionNote
        ? clean(
            input.resolutionNote,
          )
        : outcome.resolutionNote;

    if (
      resolutionLike
    ) {
      outcome.firstResolvedAt =
        outcome.firstResolvedAt ??
        now;

      outcome.lastResolvedAt =
        now;

      outcome.timeToResolutionMinutes =
        minutesBetween(
          supportCase.createdAt,
          now,
        );
    }

    await outcome.save();
  }

  if (
    status ===
      "resolved" ||
    status ===
      "duplicate"
  ) {
    supportCase.status =
      "resolved";
  } else if (
    status ===
      "escalated"
  ) {
    supportCase.status =
      "escalated";
  } else {
    supportCase.status =
      "investigating";
  }

  await supportCase.save();

  await appendSupportCaseEvent({
    caseId:
      supportCase.caseId,
    eventType:
      "outcome_recorded",
    actorUserId:
      input.supportUserId,
    summary:
      `Case outcome recorded as ${status} (${resolutionCode}).`,
    metadata: {
      outcomeId:
        outcome.outcomeId,
      status,
      resolutionSource,
      resolutionCode,
      playbookRunId:
        outcome.playbookRunId,
      playbookId:
        outcome.playbookId,
      customerConfirmedResolved:
        outcome.customerConfirmedResolved,
    },
  });

  return toOutcomeView(
    outcome,
  );
}

export async function getSupportCaseOutcome(
  caseId: string,
) {
  const row =
    await AiSupportCaseOutcome.findOne({
      caseId:
        caseId.trim(),
    }).lean();

  return row
    ? toOutcomeView(
        row,
      )
    : null;
}

export async function reopenSupportCase(input: {
  caseId: string;
  supportUserId: string;
  reason: string;
  agentConfirmed: boolean;
}) {
  if (
    input.agentConfirmed !==
    true
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_REOPEN_HUMAN_CONFIRMATION_REQUIRED",
      message:
        "A Support Agent must explicitly confirm reopening the case.",
      statusCode:
        422,
    });
  }

  const reason =
    clean(
      input.reason,
      1_000,
    );

  if (
    reason.length <
    3
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_REOPEN_REASON_REQUIRED",
      message:
        "A reopen reason is required.",
      statusCode:
        400,
    });
  }

  const supportCase =
    await AiSupportCase.findOne({
      caseId:
        input.caseId.trim(),
    });

  if (
    !supportCase
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_CASE_NOT_FOUND",
      message:
        "The AI Support case was not found.",
      statusCode:
        404,
    });
  }

  const outcome =
    await AiSupportCaseOutcome.findOne({
      caseId:
        supportCase.caseId,
    });

  if (
    !outcome
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_OUTCOME_NOT_FOUND",
      message:
        "No previous case outcome exists to reopen.",
      statusCode:
        404,
    });
  }

  outcome.status =
    "reopened";
  outcome.reopenedCount +=
    1;
  outcome.lastReopenedAt =
    new Date();
  outcome.lastReopenedByUserId =
    input.supportUserId;
  outcome.resolutionNote =
    reason;

  await outcome.save();

  supportCase.status =
    "investigating";

  await supportCase.save();

  await appendSupportCaseEvent({
    caseId:
      supportCase.caseId,
    eventType:
      "case_reopened",
    actorUserId:
      input.supportUserId,
    summary:
      "Previously resolved Support case was reopened.",
    metadata: {
      outcomeId:
        outcome.outcomeId,
      reopenCount:
        outcome.reopenedCount,
      reason,
    },
  });

  return toOutcomeView(
    outcome,
  );
}
