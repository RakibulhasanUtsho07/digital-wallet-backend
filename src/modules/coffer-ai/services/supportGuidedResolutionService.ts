import crypto from "node:crypto";

import {
  AiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportPlaybookRun,
  type AiSupportPlaybookStepStatus,
  type IAiSupportPlaybookRunStep,
} from "../../../models/AiSupportPlaybookRun.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";
import {
  triageSupportCase,
} from "../diagnostics/supportCaseTriageService.js";
import type {
  SupportCaseReport,
} from "../diagnostics/supportCaseIntelligenceService.js";
import {
  getSupportPlaybook,
  listSupportPlaybooks,
} from "../playbooks/supportPlaybookRegistry.js";
import {
  recommendSupportPlaybooks,
} from "../playbooks/supportPlaybookRecommendationService.js";
import {
  appendSupportCaseEvent,
} from "./supportCaseTimelineService.js";

function runId(): string {
  return `PBR-${new Date()
    .toISOString()
    .slice(
      0,
      10,
    )
    .replace(
      /-/g,
      "",
    )}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function caseReportFromCase(
  row: any,
): SupportCaseReport {
  return {
    subject: {
      kind:
        row.subjectKind,
      id:
        row.subjectReference,
      status:
        null,
    },

    resolution:
      row.escalation?.required
        ? "needs_internal_escalation"
        : row.confirmedCause
          ? "needs_customer_action"
          : "insufficient_evidence",

    verification:
      row.verification,

    confidence:
      row.confidence,

    confirmedCause:
      row.confirmedCause ??
      null,

    signals:
      row.signalSnapshot ??
      [],

    customers: [],

    paymentLifecycle:
      null,

    escalation:
      {
        required:
          row.escalation?.required ??
          false,
        team:
          row.escalation?.team ??
          "none",
        reason:
          row.escalation?.reason ??
          "",
      },

    agentSummary:
      row.agentSummary,

    agentChecklist:
      row.agentChecklist ??
      [],

    customerFacingMessage:
      row.customerFacingMessage,

    timeline:
      row.timelineSnapshot ??
      [],

    sources:
      row.sourceSnapshot ??
      [],

    suggestedActions: [],
  };
}

function toRunView(
  run: any,
) {
  return {
    id:
      String(
        run._id,
      ),
    runId:
      run.runId,
    caseId:
      run.caseId,
    playbookId:
      run.playbookId,
    playbookTitle:
      run.playbookTitle,
    status:
      run.status,
    recommendationScore:
      run.recommendationScore,
    recommendationReasons:
      run.recommendationReasons ??
      [],
    steps:
      (
        run.steps ??
        []
      ).map(
        (step: any) => ({
          stepId:
            step.stepId,
          title:
            step.title,
          kind:
            step.kind,
          required:
            step.required,
          status:
            step.status,
          completedByUserId:
            step.completedByUserId ??
            null,
          completedAt:
            step.completedAt
              ? new Date(
                  step.completedAt,
                ).toISOString()
              : null,
          note:
            step.note ??
            null,
        }),
      ),
    startedByUserId:
      run.startedByUserId,
    completedByUserId:
      run.completedByUserId ??
      null,
    completedAt:
      run.completedAt
        ? new Date(
            run.completedAt,
          ).toISOString()
        : null,
    createdAt:
      new Date(
        run.createdAt,
      ).toISOString(),
    updatedAt:
      new Date(
        run.updatedAt,
      ).toISOString(),
  };
}

export function getPlaybookCatalog() {
  return listSupportPlaybooks();
}

export function getPlaybookDefinition(
  playbookId: string,
) {
  const playbook =
    getSupportPlaybook(
      playbookId,
    );

  if (
    !playbook
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_NOT_FOUND",
      message:
        "The Support playbook was not found.",
      statusCode:
        404,
    });
  }

  return playbook;
}

export async function recommendPlaybooksForCase(
  caseId: string,
) {
  const row =
    await AiSupportCase.findOne({
      caseId:
        caseId.trim(),
    }).lean();

  if (
    !row
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

  const report =
    caseReportFromCase(
      row,
    );

  const triage =
    triageSupportCase(
      report,
    );

  const recommendations =
    recommendSupportPlaybooks({
      report,
      triage,
    });

  return {
    caseId:
      row.caseId,
    recommendations:
      recommendations.map(
        (item) => ({
          playbook:
            item.playbook,
          score:
            item.score,
          confidence:
            item.confidence,
          reasons:
            item.reasons,
        }),
      ),
  };
}

export async function startPlaybookForCase(input: {
  caseId: string;
  playbookId: string;
  supportUserId: string;
}) {
  const row =
    await AiSupportCase.findOne({
      caseId:
        input.caseId.trim(),
    });

  if (
    !row
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

  const recommendation =
    await recommendPlaybooksForCase(
      row.caseId,
    );

  const selected =
    recommendation.recommendations.find(
      (item) =>
        item.playbook.id ===
        input.playbookId,
    );

  if (
    !selected
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_NOT_RECOMMENDED",
      message:
        "That playbook does not match the current case evidence. Refresh the case or choose one of the recommended playbooks.",
      statusCode:
        422,
    });
  }

  const existing =
    await AiSupportPlaybookRun.findOne({
      caseId:
        row.caseId,
      status:
        "active",
    });

  if (
    existing
  ) {
    return {
      created:
        false,
      run:
        toRunView(
          existing,
        ),
      playbook:
        getPlaybookDefinition(
          existing.playbookId,
        ),
    };
  }

  const created =
    await AiSupportPlaybookRun.create({
      runId:
        runId(),
      caseId:
        row.caseId,
      playbookId:
        selected.playbook.id,
      playbookTitle:
        selected.playbook.title,
      status:
        "active",
      recommendationScore:
        selected.score,
      recommendationReasons:
        selected.reasons,
      steps:
        selected.playbook.steps.map(
          (step) => ({
            stepId:
              step.id,
            title:
              step.title,
            kind:
              step.kind,
            required:
              step.required,
            status:
              "pending",
            completedByUserId:
              null,
            completedAt:
              null,
            note:
              null,
          }),
        ),
      startedByUserId:
        input.supportUserId,
      completedByUserId:
        null,
      completedAt:
        null,
    });

  await appendSupportCaseEvent({
    caseId:
      row.caseId,
    eventType:
      "playbook_started",
    actorUserId:
      input.supportUserId,
    summary:
      `Guided Support playbook started: ${selected.playbook.title}.`,
    metadata: {
      runId:
        created.runId,
      playbookId:
        selected.playbook.id,
      score:
        selected.score,
      reasons:
        selected.reasons,
    },
  });

  return {
    created:
      true,
    run:
      toRunView(
        created,
      ),
    playbook:
      selected.playbook,
  };
}

export async function getPlaybookRun(
  runIdValue: string,
) {
  const run =
    await AiSupportPlaybookRun.findOne({
      runId:
        runIdValue.trim(),
    });

  if (
    !run
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_NOT_FOUND",
      message:
        "The Support playbook run was not found.",
      statusCode:
        404,
    });
  }

  return {
    run:
      toRunView(
        run,
      ),
    playbook:
      getPlaybookDefinition(
        run.playbookId,
      ),
  };
}

export async function updatePlaybookStep(input: {
  runId: string;
  stepId: string;
  supportUserId: string;
  status: "completed" | "skipped";
  note?: string | null;
}) {
  const run =
    await AiSupportPlaybookRun.findOne({
      runId:
        input.runId.trim(),
    });

  if (
    !run
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_NOT_FOUND",
      message:
        "The Support playbook run was not found.",
      statusCode:
        404,
    });
  }

  if (
    run.status !==
    "active"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_NOT_ACTIVE",
      message:
        "Only an active playbook run can be updated.",
      statusCode:
        409,
    });
  }

  const playbook =
    getPlaybookDefinition(
      run.playbookId,
    );

  const definitionStep =
    playbook.steps.find(
      (step) =>
        step.id ===
        input.stepId,
    );

  if (
    !definitionStep
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_STEP_NOT_FOUND",
      message:
        "The playbook step was not found.",
      statusCode:
        404,
    });
  }

  if (
    input.status ===
      "skipped" &&
    definitionStep.required
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_REQUIRED_STEP_CANNOT_BE_SKIPPED",
      message:
        "This guided-resolution step is required and cannot be skipped.",
      statusCode:
        422,
    });
  }

  const runStep =
    run.steps.find(
      (step: IAiSupportPlaybookRunStep) =>
        step.stepId ===
        input.stepId,
    );

  if (
    !runStep
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_STEP_NOT_FOUND",
      message:
        "The playbook run step was not found.",
      statusCode:
        404,
    });
  }

  runStep.status =
    input.status as AiSupportPlaybookStepStatus;

  runStep.completedByUserId =
    input.supportUserId;

  runStep.completedAt =
    new Date();

  runStep.note =
    input.note
      ?.trim()
      .slice(
        0,
        1_000,
      ) ||
    null;

  await run.save();

  await appendSupportCaseEvent({
    caseId:
      run.caseId,
    eventType:
      "playbook_step_updated",
    actorUserId:
      input.supportUserId,
    summary:
      `Playbook step ${definitionStep.title} marked ${input.status}.`,
    metadata: {
      runId:
        run.runId,
      playbookId:
        run.playbookId,
      stepId:
        input.stepId,
      status:
        input.status,
    },
  });

  return getPlaybookRun(
    run.runId,
  );
}

export async function completePlaybookRun(input: {
  runId: string;
  supportUserId: string;
}) {
  const run =
    await AiSupportPlaybookRun.findOne({
      runId:
        input.runId.trim(),
    });

  if (
    !run
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_RUN_NOT_FOUND",
      message:
        "The Support playbook run was not found.",
      statusCode:
        404,
    });
  }

  if (
    run.status !==
    "active"
  ) {
    return getPlaybookRun(
      run.runId,
    );
  }

  const playbook =
    getPlaybookDefinition(
      run.playbookId,
    );

  const requiredStepIds =
    new Set(
      playbook.steps
        .filter(
          (step) =>
            step.required,
        )
        .map(
          (step) =>
            step.id,
        ),
    );

  const incomplete =
    run.steps.filter(
      (step: IAiSupportPlaybookRunStep) =>
        requiredStepIds.has(
          step.stepId,
        ) &&
        step.status !==
          "completed",
    );

  if (
    incomplete.length >
    0
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_PLAYBOOK_REQUIRED_STEPS_INCOMPLETE",
      message:
        `Complete the required playbook steps first: ${incomplete
          .map(
            (step: IAiSupportPlaybookRunStep) =>
              step.title,
          )
          .join(", ")}.`,
      statusCode:
        422,
    });
  }

  run.status =
    "completed";

  run.completedByUserId =
    input.supportUserId;

  run.completedAt =
    new Date();

  await run.save();

  await appendSupportCaseEvent({
    caseId:
      run.caseId,
    eventType:
      "playbook_completed",
    actorUserId:
      input.supportUserId,
    summary:
      `Guided Support playbook completed: ${run.playbookTitle}.`,
    metadata: {
      runId:
        run.runId,
      playbookId:
        run.playbookId,
    },
  });

  return getPlaybookRun(
    run.runId,
  );
}
