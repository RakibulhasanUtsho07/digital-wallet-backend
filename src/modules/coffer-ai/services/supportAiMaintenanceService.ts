import {
  AiSupportAlert,
} from "../../../models/AiSupportAlert.js";
import {
  AiSupportCaseEvent,
} from "../../../models/AiSupportCaseEvent.js";
import {
  AiSupportKnowledgeDraft,
} from "../../../models/AiSupportKnowledgeDraft.js";

function daysAgo(
  days: number,
): Date {
  return new Date(
    Date.now() -
      Math.max(
        1,
        days,
      ) *
        24 *
        60 *
        60 *
        1_000,
  );
}

export async function runSupportAiMaintenance(input?: {
  eventRetentionDays?: number;
  resolvedAlertRetentionDays?: number;
  rejectedDraftRetentionDays?: number;
}) {
  const eventRetentionDays =
    Math.max(
      30,
      input?.eventRetentionDays ??
        180,
    );

  const resolvedAlertRetentionDays =
    Math.max(
      30,
      input?.resolvedAlertRetentionDays ??
        90,
    );

  const rejectedDraftRetentionDays =
    Math.max(
      30,
      input?.rejectedDraftRetentionDays ??
        180,
    );

  const [
    events,
    alerts,
    drafts,
  ] =
    await Promise.all([
      AiSupportCaseEvent.deleteMany({
        createdAt: {
          $lt:
            daysAgo(
              eventRetentionDays,
            ),
        },
      }),

      AiSupportAlert.deleteMany({
        status:
          "resolved",
        resolvedAt: {
          $lt:
            daysAgo(
              resolvedAlertRetentionDays,
            ),
        },
      }),

      AiSupportKnowledgeDraft.deleteMany({
        status:
          "rejected",
        updatedAt: {
          $lt:
            daysAgo(
              rejectedDraftRetentionDays,
            ),
        },
      }),
    ]);

  return {
    ranAt:
      new Date().toISOString(),
    retention: {
      eventRetentionDays,
      resolvedAlertRetentionDays,
      rejectedDraftRetentionDays,
    },
    deleted: {
      caseEvents:
        events.deletedCount,
      resolvedAlerts:
        alerts.deletedCount,
      rejectedKnowledgeDrafts:
        drafts.deletedCount,
    },
  };
}
