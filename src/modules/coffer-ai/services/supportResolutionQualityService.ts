import {
  AiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportCaseOutcome,
} from "../../../models/AiSupportCaseOutcome.js";
import {
  AiSupportPlaybookRun,
} from "../../../models/AiSupportPlaybookRun.js";

export type SupportQualityRange =
  | "7d"
  | "30d"
  | "90d";

function safeRange(
  value: string | undefined,
): SupportQualityRange {
  if (
    value === "7d" ||
    value === "30d" ||
    value === "90d"
  ) {
    return value;
  }

  return "30d";
}

function startForRange(
  range: SupportQualityRange,
): Date {
  const days =
    range === "7d"
      ? 7
      : range === "90d"
        ? 90
        : 30;

  return new Date(
    Date.now() -
      days *
        24 *
        60 *
        60 *
        1_000,
  );
}

function rate(
  value: number,
  total: number,
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return Number(
    (
      value /
      total *
      100
    ).toFixed(
      1,
    ),
  );
}

function average(
  values: number[],
): number | null {
  if (
    values.length ===
    0
  ) {
    return null;
  }

  return Number(
    (
      values.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,
        0,
      ) /
      values.length
    ).toFixed(
      1,
    ),
  );
}

function median(
  values: number[],
): number | null {
  if (
    values.length ===
    0
  ) {
    return null;
  }

  const sorted =
    [...values].sort(
      (
        left,
        right,
      ) =>
        left -
        right,
    );

  const middle =
    Math.floor(
      sorted.length /
      2,
    );

  if (
    sorted.length %
      2 ===
    1
  ) {
    return sorted[
      middle
    ];
  }

  return Number(
    (
      (
        sorted[
          middle -
          1
        ] +
        sorted[
          middle
        ]
      ) /
      2
    ).toFixed(
      1,
    ),
  );
}

export async function getSupportResolutionQuality(input?: {
  range?: string;
}) {
  const range =
    safeRange(
      input?.range,
    );

  const since =
    startForRange(
      range,
    );

  const [
    outcomes,
    playbookRuns,
    totalCasesCreated,
  ] =
    await Promise.all([
      AiSupportCaseOutcome.find({
        updatedAt: {
          $gte:
            since,
        },
      })
        .sort({
          updatedAt: -1,
        })
        .lean(),

      AiSupportPlaybookRun.find({
        createdAt: {
          $gte:
            since,
        },
      })
        .sort({
          createdAt: -1,
        })
        .lean(),

      AiSupportCase.countDocuments({
        createdAt: {
          $gte:
            since,
        },
      }),
    ]);

  const resolved =
    outcomes.filter(
      (row) =>
        row.status ===
        "resolved",
    );

  const escalated =
    outcomes.filter(
      (row) =>
        row.status ===
        "escalated",
    );

  const unresolved =
    outcomes.filter(
      (row) =>
        row.status ===
        "unresolved",
    );

  const duplicates =
    outcomes.filter(
      (row) =>
        row.status ===
        "duplicate",
    );

  const reopened =
    outcomes.filter(
      (row) =>
        (
          row.reopenedCount ??
          0
        ) >
        0,
    );

  const resolutionTimes =
    outcomes
      .map(
        (row) =>
          row.timeToResolutionMinutes,
      )
      .filter(
        (
          value,
        ): value is number =>
          typeof value ===
            "number" &&
          Number.isFinite(
            value,
          ),
      );

  const customerConfirmed =
    outcomes.filter(
      (row) =>
        row.customerConfirmedResolved ===
        true,
    ).length;

  const playbookBased =
    outcomes.filter(
      (row) =>
        row.resolutionSource ===
        "playbook",
    );

  const manualBased =
    outcomes.filter(
      (row) =>
        row.resolutionSource ===
        "manual",
    );

  const causeMap =
    new Map<
      string,
      {
        outcomes: number;
        resolved: number;
        escalated: number;
        reopened: number;
        resolutionMinutes: number[];
      }
    >();

  for (
    const row of
    outcomes
  ) {
    const cause =
      row.confirmedCauseCode
        ?.trim()
        .toLowerCase() ||
      "unknown";

    const stats =
      causeMap.get(
        cause,
      ) ?? {
        outcomes: 0,
        resolved: 0,
        escalated: 0,
        reopened: 0,
        resolutionMinutes: [],
      };

    stats.outcomes +=
      1;

    if (
      row.status ===
      "resolved"
    ) {
      stats.resolved +=
        1;
    }

    if (
      row.status ===
      "escalated"
    ) {
      stats.escalated +=
        1;
    }

    if (
      (
        row.reopenedCount ??
        0
      ) >
      0
    ) {
      stats.reopened +=
        1;
    }

    if (
      typeof row.timeToResolutionMinutes ===
      "number"
    ) {
      stats.resolutionMinutes.push(
        row.timeToResolutionMinutes,
      );
    }

    causeMap.set(
      cause,
      stats,
    );
  }

  const byFailureCause =
    Array.from(
      causeMap.entries(),
    )
      .map(
        ([
          causeCode,
          stats,
        ]) => ({
          causeCode,
          outcomes:
            stats.outcomes,
          resolved:
            stats.resolved,
          escalated:
            stats.escalated,
          reopened:
            stats.reopened,
          resolutionRate:
            rate(
              stats.resolved,
              stats.outcomes,
            ),
          escalationRate:
            rate(
              stats.escalated,
              stats.outcomes,
            ),
          reopenRate:
            rate(
              stats.reopened,
              stats.outcomes,
            ),
          averageResolutionMinutes:
            average(
              stats.resolutionMinutes,
            ),
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.outcomes -
          left.outcomes,
      );

  const runMap =
    new Map<
      string,
      {
        title: string;
        started: number;
        completed: number;
      }
    >();

  for (
    const run of
    playbookRuns
  ) {
    const id =
      run.playbookId;

    const stats =
      runMap.get(
        id,
      ) ?? {
        title:
          run.playbookTitle,
        started:
          0,
        completed:
          0,
      };

    stats.started +=
      1;

    if (
      run.status ===
      "completed"
    ) {
      stats.completed +=
        1;
    }

    runMap.set(
      id,
      stats,
    );
  }

  const outcomeByPlaybook =
    new Map<
      string,
      {
        linkedOutcomes: number;
        resolved: number;
        escalated: number;
        reopened: number;
        resolutionMinutes: number[];
      }
    >();

  for (
    const row of
    outcomes
  ) {
    if (
      !row.playbookId
    ) {
      continue;
    }

    const stats =
      outcomeByPlaybook.get(
        row.playbookId,
      ) ?? {
        linkedOutcomes:
          0,
        resolved:
          0,
        escalated:
          0,
        reopened:
          0,
        resolutionMinutes:
          [],
      };

    stats.linkedOutcomes +=
      1;

    if (
      row.status ===
      "resolved"
    ) {
      stats.resolved +=
        1;
    }

    if (
      row.status ===
      "escalated"
    ) {
      stats.escalated +=
        1;
    }

    if (
      (
        row.reopenedCount ??
        0
      ) >
      0
    ) {
      stats.reopened +=
        1;
    }

    if (
      typeof row.timeToResolutionMinutes ===
      "number"
    ) {
      stats.resolutionMinutes.push(
        row.timeToResolutionMinutes,
      );
    }

    outcomeByPlaybook.set(
      row.playbookId,
      stats,
    );
  }

  const playbookIds =
    Array.from(
      new Set([
        ...runMap.keys(),
        ...outcomeByPlaybook.keys(),
      ]),
    );

  const playbookEffectiveness =
    playbookIds
      .map(
        (playbookId) => {
          const run =
            runMap.get(
              playbookId,
            ) ?? {
              title:
                playbookId,
              started:
                0,
              completed:
                0,
            };

          const outcome =
            outcomeByPlaybook.get(
              playbookId,
            ) ?? {
              linkedOutcomes:
                0,
              resolved:
                0,
              escalated:
                0,
              reopened:
                0,
              resolutionMinutes:
                [],
            };

          return {
            playbookId,
            title:
              run.title,
            started:
              run.started,
            completed:
              run.completed,
            completionRate:
              rate(
                run.completed,
                run.started,
              ),
            linkedOutcomes:
              outcome.linkedOutcomes,
            resolvedOutcomes:
              outcome.resolved,
            escalatedOutcomes:
              outcome.escalated,
            reopenedOutcomes:
              outcome.reopened,
            resolvedOutcomeRate:
              rate(
                outcome.resolved,
                outcome.linkedOutcomes,
              ),
            escalationRate:
              rate(
                outcome.escalated,
                outcome.linkedOutcomes,
              ),
            reopenRate:
              rate(
                outcome.reopened,
                outcome.linkedOutcomes,
              ),
            averageResolutionMinutes:
              average(
                outcome.resolutionMinutes,
              ),
          };
        },
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.started -
          left.started,
      );

  const outcomeCount =
    outcomes.length;

  return {
    generatedAt:
      new Date().toISOString(),
    range,

    coverage: {
      casesCreated:
        totalCasesCreated,
      casesWithRecordedOutcome:
        outcomeCount,
      outcomeCoverageRate:
        rate(
          outcomeCount,
          totalCasesCreated,
        ),
    },

    outcomes: {
      total:
        outcomeCount,
      resolved:
        resolved.length,
      escalated:
        escalated.length,
      unresolved:
        unresolved.length,
      duplicate:
        duplicates.length,
      reopened:
        reopened.length,
      resolutionRate:
        rate(
          resolved.length,
          outcomeCount,
        ),
      escalationRate:
        rate(
          escalated.length,
          outcomeCount,
        ),
      reopenRate:
        rate(
          reopened.length,
          outcomeCount,
        ),
      customerConfirmedResolved:
        customerConfirmed,
      customerConfirmedResolutionRate:
        rate(
          customerConfirmed,
          outcomeCount,
        ),
    },

    timing: {
      averageResolutionMinutes:
        average(
          resolutionTimes,
        ),
      medianResolutionMinutes:
        median(
          resolutionTimes,
        ),
    },

    resolutionSources: {
      playbook:
        playbookBased.length,
      manual:
        manualBased.length,
      escalation:
        outcomes.filter(
          (row) =>
            row.resolutionSource ===
            "escalation",
        ).length,
      duplicate:
        outcomes.filter(
          (row) =>
            row.resolutionSource ===
            "duplicate",
        ).length,
    },

    byFailureCause,

    playbookEffectiveness,

    notes: [
      "Resolution and playbook metrics are descriptive operational analytics; they are not an automatic agent-quality score.",
      "Reopened cases remain visible because a first resolution did not necessarily remain resolved.",
      "A playbook-linked outcome requires the selected playbook run to be completed first.",
    ],
  };
}

export async function getSupportPlaybookEffectiveness(input?: {
  range?: string;
}) {
  const snapshot =
    await getSupportResolutionQuality(
      input,
    );

  return {
    generatedAt:
      snapshot.generatedAt,
    range:
      snapshot.range,
    playbooks:
      snapshot.playbookEffectiveness,
    overall: {
      playbookBasedOutcomes:
        snapshot.resolutionSources.playbook,
      resolutionRate:
        snapshot.outcomes.resolutionRate,
      escalationRate:
        snapshot.outcomes.escalationRate,
      reopenRate:
        snapshot.outcomes.reopenRate,
    },
  };
}
