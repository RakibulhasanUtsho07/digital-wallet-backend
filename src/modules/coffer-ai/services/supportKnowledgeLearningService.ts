import crypto from "node:crypto";

import {
  AiSupportCase,
  type IAiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportCaseOutcome,
} from "../../../models/AiSupportCaseOutcome.js";
import {
  AiSupportKnowledgeDraft,
  type AiSupportKnowledgeDraftStatus,
} from "../../../models/AiSupportKnowledgeDraft.js";
import {
  AiSupportPlaybookRun,
} from "../../../models/AiSupportPlaybookRun.js";
import {
  SupportKnowledgeBase,
} from "../../../models/SupportKnowledgeBase.js";
import {
  createSupportKnowledgeBaseArticle,
} from "../../../services/supportKnowledgeBaseService.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";
import {
  getSupportPlaybook,
} from "../playbooks/supportPlaybookRegistry.js";
import {
  appendSupportCaseEvent,
} from "./supportCaseTimelineService.js";

function clean(
  value: string,
  max: number,
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

function slugify(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /^-+|-+$/g,
      "",
    )
    .slice(
      0,
      190,
    );
}

function makeDraftId(): string {
  const date =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      )
      .replace(
        /-/g,
        "",
      );

  return `KBD-${date}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function makeFingerprint(input: {
  causeCode: string;
  playbookId: string | null;
  resolutionCode: string;
  queue: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.causeCode,
        input.playbookId ?? "-",
        input.resolutionCode,
        input.queue,
      ]
        .map(
          (value) =>
            value
              .trim()
              .toLowerCase(),
        )
        .join("|"),
    )
    .digest("hex")
    .slice(
      0,
      24,
    );
}

function humanize(
  value: string,
): string {
  return value
    .replace(
      /[_-]+/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function toDraftView(
  row: any,
) {
  return {
    id:
      String(
        row._id,
      ),
    draftId:
      row.draftId,
    fingerprint:
      row.fingerprint,
    sourceCaseId:
      row.sourceCaseId,
    sourceOutcomeId:
      row.sourceOutcomeId,
    sourcePlaybookRunId:
      row.sourcePlaybookRunId ??
      null,
    sourcePlaybookId:
      row.sourcePlaybookId ??
      null,
    confirmedCauseCode:
      row.confirmedCauseCode,
    resolutionCode:
      row.resolutionCode,
    queue:
      row.queue,
    title:
      row.title,
    slug:
      row.slug,
    summary:
      row.summary,
    content:
      row.content,
    category:
      row.category,
    tags:
      row.tags ??
      [],
    evidenceRefs:
      row.evidenceRefs ??
      [],
    status:
      row.status,
    createdBySupportUserId:
      row.createdBySupportUserId,
    submittedAt:
      row.submittedAt
        ? new Date(
            row.submittedAt,
          ).toISOString()
        : null,
    reviewedByAdminId:
      row.reviewedByAdminId ??
      null,
    reviewedAt:
      row.reviewedAt
        ? new Date(
            row.reviewedAt,
          ).toISOString()
        : null,
    reviewNote:
      row.reviewNote ??
      null,
    publishedArticleId:
      row.publishedArticleId ??
      null,
    publishedAt:
      row.publishedAt
        ? new Date(
            row.publishedAt,
          ).toISOString()
        : null,
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

function buildArticleContent(input: {
  causeCode: string;
  resolutionCode: string;
  queue: string;
  customerMessage: string;
  playbookId: string | null;
  playbookTitle: string | null;
  playbookSteps: Array<{
    title: string;
    instruction: string;
    safeCustomerFacing: boolean;
  }>;
  escalationRequired: boolean;
  escalationTeam: string;
}): string {
  const safeSteps =
    input.playbookSteps.length >
    0
      ? input.playbookSteps
          .map(
            (
              step,
              index,
            ) =>
              `${index + 1}. ${step.title}: ${step.instruction}`,
          )
          .join("\n")
      : "1. Verify the exact payment/transaction reference.\n2. Confirm the recorded backend cause before explaining it.\n3. Follow the case triage and authorized escalation path.";

  return [
    "## Issue pattern",
    `Verified cause: ${input.causeCode}.`,
    `Recorded successful resolution category: ${input.resolutionCode}.`,
    "",
    "## Approved support procedure",
    safeSteps,
    "",
    "## Customer-safe response",
    input.customerMessage,
    "",
    "## Escalation guidance",
    input.escalationRequired
      ? `If the issue is not resolved by the approved procedure, route it to ${input.escalationTeam}.`
      : `Follow normal ${input.queue} Support handling if the issue repeats.`,
    "",
    "## Evidence boundary",
    "Use this article only when live backend evidence matches the documented cause/signals. Do not infer this cause from a generic failed status. Never request OTPs, passwords, access tokens, API secrets, full payment credentials, or KYC document numbers/images.",
  ].join("\n");
}

export async function createKnowledgeDraftFromCase(input: {
  caseId: string;
  supportUserId: string;
}) {
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
    !outcome ||
    outcome.status !==
      "resolved" ||
    outcome.agentConfirmed !==
      true
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_RESOLVED_OUTCOME_REQUIRED",
      message:
        "A human-confirmed resolved outcome is required before creating a reusable knowledge draft.",
      statusCode:
        422,
    });
  }

  const causeCode =
    outcome.confirmedCauseCode
      ?.trim()
      .toLowerCase();

  if (
    !causeCode ||
    outcome.resolutionCode ===
      "unknown"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_VERIFIED_CAUSE_REQUIRED",
      message:
        "Knowledge learning requires a verified cause and a specific recorded resolution. Unknown-cause cases are not converted into reusable guidance.",
      statusCode:
        422,
    });
  }

  let playbookRun =
    null as any;

  if (
    outcome.playbookRunId
  ) {
    playbookRun =
      await AiSupportPlaybookRun.findOne({
        runId:
          outcome.playbookRunId,
        caseId:
          supportCase.caseId,
        status:
          "completed",
      });
  }

  const playbook =
    playbookRun?.playbookId
      ? getSupportPlaybook(
          playbookRun.playbookId,
        )
      : null;

  const fingerprint =
    makeFingerprint({
      causeCode,
      playbookId:
        playbook?.id ??
        null,
      resolutionCode:
        outcome.resolutionCode,
      queue:
        supportCase.queue,
    });

  const existing =
    await AiSupportKnowledgeDraft.findOne({
      fingerprint,
      status: {
        $in: [
          "draft",
          "submitted",
          "approved",
          "published",
        ],
      },
    }).sort({
      updatedAt: -1,
    });

  if (
    existing
  ) {
    return {
      created:
        false,
      draft:
        toDraftView(
          existing,
        ),
    };
  }

  const title =
    `${humanize(causeCode)} — Support Resolution Guide`;

  const summary =
    `Human-reviewed reusable Support guidance for cases with verified cause ${causeCode} and recorded resolution ${outcome.resolutionCode}.`;

  const articleContent =
    buildArticleContent({
      causeCode,
      resolutionCode:
        outcome.resolutionCode,
      queue:
        supportCase.queue,
      customerMessage:
        supportCase.customerFacingMessage,
      playbookId:
        playbook?.id ??
        null,
      playbookTitle:
        playbook?.title ??
        null,
      playbookSteps:
        playbook?.steps.map(
          (step) => ({
            title:
              step.title,
            instruction:
              step.instruction,
            safeCustomerFacing:
              step.safeCustomerFacing,
          }),
        ) ??
        [],
      escalationRequired:
        supportCase.escalation.required,
      escalationTeam:
        supportCase.escalation.team,
    });

  const evidenceRefs =
    Array.from(
      new Set(
        (
          supportCase.sourceSnapshot ??
          []
        )
          .map(
            (source: IAiSupportCase["sourceSnapshot"][number]) =>
              `${source.type}:${source.reference}`,
          )
          .filter(Boolean),
      ),
    ).slice(
      0,
      30,
    );

  const draftId =
    makeDraftId();

  const draft =
    await AiSupportKnowledgeDraft.create({
      draftId,
      fingerprint,
      sourceCaseId:
        supportCase.caseId,
      sourceOutcomeId:
        outcome.outcomeId,
      sourcePlaybookRunId:
        playbookRun?.runId ??
        null,
      sourcePlaybookId:
        playbook?.id ??
        null,
      confirmedCauseCode:
        causeCode,
      resolutionCode:
        outcome.resolutionCode,
      queue:
        supportCase.queue,
      title:
        clean(
          title,
          180,
        ),
      slug:
        slugify(
          `${causeCode}-${playbook?.id ?? outcome.resolutionCode}`,
        ),
      summary:
        clean(
          summary,
          400,
        ),
      content:
        articleContent.slice(
          0,
          12_000,
        ),
      category:
        "Troubleshooting",
      tags:
        Array.from(
          new Set(
            [
              causeCode,
              supportCase.queue,
              outcome.resolutionCode,
              playbook?.id ??
              "",
            ].filter(Boolean),
          ),
        ).slice(
          0,
          20,
        ),
      evidenceRefs,
      status:
        "draft",
      createdBySupportUserId:
        input.supportUserId,
      submittedAt:
        null,
      reviewedByAdminId:
        null,
      reviewedAt:
        null,
      reviewNote:
        null,
      publishedArticleId:
        null,
      publishedAt:
        null,
    });

  await appendSupportCaseEvent({
    caseId:
      supportCase.caseId,
    eventType:
      "knowledge_draft_created",
    actorUserId:
      input.supportUserId,
    summary:
      `Reusable knowledge draft created from the verified resolved case: ${draft.draftId}.`,
    metadata: {
      draftId:
        draft.draftId,
      fingerprint:
        draft.fingerprint,
      causeCode,
      playbookId:
        playbook?.id ??
        null,
    },
  });

  return {
    created:
      true,
    draft:
      toDraftView(
        draft,
      ),
  };
}

export async function submitKnowledgeDraft(input: {
  draftId: string;
  supportUserId: string;
}) {
  const row =
    await AiSupportKnowledgeDraft.findOne({
      draftId:
        input.draftId.trim(),
    });

  if (
    !row
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_NOT_FOUND",
      message:
        "The Support knowledge draft was not found.",
      statusCode:
        404,
    });
  }

  if (
    row.status !==
      "draft" &&
    row.status !==
      "rejected"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_NOT_SUBMITTABLE",
      message:
        "Only a draft or rejected draft can be submitted for review.",
      statusCode:
        409,
    });
  }

  row.status =
    "submitted";
  row.submittedAt =
    new Date();
  row.reviewedByAdminId =
    null;
  row.reviewedAt =
    null;

  await row.save();

  await appendSupportCaseEvent({
    caseId:
      row.sourceCaseId,
    eventType:
      "knowledge_draft_submitted",
    actorUserId:
      input.supportUserId,
    summary:
      `Knowledge draft ${row.draftId} submitted for human admin review.`,
    metadata: {
      draftId:
        row.draftId,
    },
  });

  return toDraftView(
    row,
  );
}

export async function reviewKnowledgeDraft(input: {
  draftId: string;
  adminId: string;
  action: "approve" | "reject";
  note?: string | null;
}) {
  const row =
    await AiSupportKnowledgeDraft.findOne({
      draftId:
        input.draftId.trim(),
    });

  if (
    !row
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_NOT_FOUND",
      message:
        "The Support knowledge draft was not found.",
      statusCode:
        404,
    });
  }

  if (
    row.status !==
    "submitted"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_NOT_REVIEWABLE",
      message:
        "Only a submitted knowledge draft can be reviewed.",
      statusCode:
        409,
    });
  }

  row.status =
    input.action ===
      "approve"
      ? "approved"
      : "rejected";

  row.reviewedByAdminId =
    input.adminId;

  row.reviewedAt =
    new Date();

  row.reviewNote =
    input.note
      ?.trim()
      .slice(
        0,
        2_000,
      ) ||
    null;

  await row.save();

  await appendSupportCaseEvent({
    caseId:
      row.sourceCaseId,
    eventType:
      "knowledge_draft_reviewed",
    actorUserId:
      input.adminId,
    summary:
      `Knowledge draft ${row.draftId} was ${row.status} by a human administrator.`,
    metadata: {
      draftId:
        row.draftId,
      status:
        row.status,
    },
  });

  return toDraftView(
    row,
  );
}

async function uniquePublishedSlug(
  preferred: string,
  draftId: string,
): Promise<string> {
  const base =
    slugify(
      preferred,
    );

  const existing =
    await SupportKnowledgeBase.findOne({
      slug:
        base,
    })
      .select(
        "_id",
      )
      .lean();

  if (
    !existing
  ) {
    return base;
  }

  return slugify(
    `${base}-${draftId.toLowerCase()}`,
  );
}

export async function publishKnowledgeDraft(input: {
  draftId: string;
  adminId: string;
}) {
  const row =
    await AiSupportKnowledgeDraft.findOne({
      draftId:
        input.draftId.trim(),
    });

  if (
    !row
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_NOT_FOUND",
      message:
        "The Support knowledge draft was not found.",
      statusCode:
        404,
    });
  }

  if (
    row.status ===
      "published" &&
    row.publishedArticleId
  ) {
    return toDraftView(
      row,
    );
  }

  if (
    row.status !==
      "approved"
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_APPROVAL_REQUIRED",
      message:
        "A human administrator must approve the knowledge draft before publication.",
      statusCode:
        422,
    });
  }

  const slug =
    await uniquePublishedSlug(
      row.slug,
      row.draftId,
    );

  const article =
    await createSupportKnowledgeBaseArticle({
      title:
        row.title,
      slug,
      summary:
        row.summary,
      content:
        row.content,
      category:
        row.category,
      tags:
        row.tags,
      adminId:
        input.adminId,
    });

  row.status =
    "published";

  row.slug =
    article.slug;

  row.publishedArticleId =
    article._id.toString();

  row.publishedAt =
    new Date();

  await row.save();

  await appendSupportCaseEvent({
    caseId:
      row.sourceCaseId,
    eventType:
      "knowledge_draft_published",
    actorUserId:
      input.adminId,
    summary:
      `Approved knowledge draft ${row.draftId} published to the Support Knowledge Base.`,
    metadata: {
      draftId:
        row.draftId,
      articleId:
        row.publishedArticleId,
      slug:
        row.slug,
    },
  });

  return toDraftView(
    row,
  );
}

export async function getKnowledgeDraft(
  draftId: string,
) {
  const row =
    await AiSupportKnowledgeDraft.findOne({
      draftId:
        draftId.trim(),
    }).lean();

  if (
    !row
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_KNOWLEDGE_DRAFT_NOT_FOUND",
      message:
        "The Support knowledge draft was not found.",
      statusCode:
        404,
    });
  }

  return toDraftView(
    row,
  );
}

export async function listKnowledgeDrafts(input?: {
  status?: string | null;
  page?: number;
  limit?: number;
}) {
  const page =
    Math.max(
      1,
      input?.page ??
        1,
    );

  const limit =
    Math.min(
      50,
      Math.max(
        5,
        input?.limit ??
          20,
      ),
    );

  const query:
    Record<string, unknown> =
    {};

  const allowed =
    new Set<AiSupportKnowledgeDraftStatus>([
      "draft",
      "submitted",
      "approved",
      "rejected",
      "published",
    ]);

  if (
    input?.status &&
    allowed.has(
      input.status as AiSupportKnowledgeDraftStatus,
    )
  ) {
    query.status =
      input.status;
  }

  const [
    rows,
    total,
  ] =
    await Promise.all([
      AiSupportKnowledgeDraft.find(
        query,
      )
        .sort({
          updatedAt: -1,
        })
        .skip(
          (
            page -
            1
          ) *
            limit,
        )
        .limit(
          limit,
        )
        .lean(),

      AiSupportKnowledgeDraft.countDocuments(
        query,
      ),
    ]);

  return {
    drafts:
      rows.map(
        toDraftView,
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
