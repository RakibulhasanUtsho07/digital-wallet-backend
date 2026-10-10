import {
  AiSupportCase,
} from "../../../models/AiSupportCase.js";
import {
  AiSupportIncident,
} from "../../../models/AiSupportIncident.js";
import {
  AiSupportAlert,
} from "../../../models/AiSupportAlert.js";
import {
  AiSupportCaseEvent,
} from "../../../models/AiSupportCaseEvent.js";
import {
  AiSupportCaseOutcome,
} from "../../../models/AiSupportCaseOutcome.js";
import {
  AiSupportKnowledgeDraft,
} from "../../../models/AiSupportKnowledgeDraft.js";

export type SupportCommandCenterRange =
  | "24h"
  | "7d"
  | "30d";

export interface SupportCommandCenterSnapshot {
  generatedAt: string;
  range: SupportCommandCenterRange;

  health: {
    status:
      | "healthy"
      | "attention"
      | "critical";
    headline: string;
    summary: string;
  };

  overview: {
    openCases: number;
    investigatingCases: number;
    waitingCustomerCases: number;
    escalatedCases: number;
    resolvedCases: number;
    criticalOpenCases: number;
    urgentOpenCases: number;
    unassignedOpenCases: number;
    openIncidents: number;
    criticalIncidents: number;
  };

  sla: {
    breached: number;
    atRiskHigh: number;
    atRiskMedium: number;
    healthy: number;
    responded: number;
    breachRate: number;
  };

  queues: Array<{
    queue: string;
    openCases: number;
    critical: number;
    urgent: number;
    breached: number;
  }>;

  topFailureCauses: Array<{
    code: string;
    count: number;
  }>;

  providerSignals: Array<{
    code: string;
    count: number;
  }>;

  agentWorkload: Array<{
    userId: string;
    openCases: number;
    urgent: number;
    critical: number;
  }>;

  alerts: {
    open: number;
    critical: number;
    high: number;
    acknowledged: number;
  };

  alertFeed: Array<{
    alertId: string;
    type: string;
    severity: string;
    status: string;
    title: string;
    summary: string;
    lastDetectedAt: string;
  }>;

  incidents: Array<{
    incidentId: string;
    title: string;
    status: string;
    severity: string;
    queue: string;
    causeCode: string | null;
    caseCount: number;
    lastSeenAt: string;
  }>;

  recentEvents: Array<{
    caseId: string;
    eventType: string;
    summary: string;
    createdAt: string;
  }>;

  trend: Array<{
    bucket: string;
    createdCases: number;
    criticalCases: number;
    incidents: number;
  }>;

  resolutionQuality: {
    outcomesInRange: number;
    resolved: number;
    escalated: number;
    reopened: number;
    resolutionRate: number;
    escalationRate: number;
    reopenRate: number;
  };

  knowledgeLearning: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    published: number;
  };

  dailyOperationsSummary: string;
}

function rangeStart(
  range: SupportCommandCenterRange,
): Date {
  const now =
    Date.now();

  const hours =
    range === "24h"
      ? 24
      : range === "7d"
        ? 24 * 7
        : 24 * 30;

  return new Date(
    now -
      hours *
        60 *
        60 *
        1_000,
  );
}

function safeRange(
  value: string | undefined,
): SupportCommandCenterRange {
  if (
    value === "24h" ||
    value === "7d" ||
    value === "30d"
  ) {
    return value;
  }

  return "24h";
}

function percent(
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
      (
        value /
        total
      ) *
      100
    ).toFixed(1),
  );
}

function slaState(
  createdAt: Date,
  slaDueAt: Date,
  firstResponseAt: Date | null,
  responseTargetMinutes: number,
): "breached" | "at_risk_high" | "at_risk_medium" | "healthy" | "responded" {
  if (
    firstResponseAt
  ) {
    return "responded";
  }

  const now =
    Date.now();

  if (
    slaDueAt.getTime() <=
    now
  ) {
    return "breached";
  }

  const elapsed =
    Math.max(
      0,
      now -
        createdAt.getTime(),
    );

  const target =
    Math.max(
      1,
      responseTargetMinutes,
    ) *
    60_000;

  const consumed =
    elapsed /
    target;

  if (
    consumed >=
    0.75
  ) {
    return "at_risk_high";
  }

  if (
    consumed >=
    0.5
  ) {
    return "at_risk_medium";
  }

  return "healthy";
}

function makeBucketLabel(
  date: Date,
  range: SupportCommandCenterRange,
): string {
  if (
    range === "24h"
  ) {
    return `${String(
      date.getUTCHours(),
    ).padStart(
      2,
      "0",
    )}:00`;
  }

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function bucketKeyFor(
  value: Date,
  range: SupportCommandCenterRange,
): string {
  if (
    range === "24h"
  ) {
    return `${value
      .toISOString()
      .slice(
        0,
        13,
      )}:00`;
  }

  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

function buildTrendBuckets(
  range: SupportCommandCenterRange,
): Array<{
  key: string;
  bucket: string;
  createdCases: number;
  criticalCases: number;
  incidents: number;
}> {
  const result = [];
  const now =
    new Date();

  const count =
    range === "24h"
      ? 24
      : range === "7d"
        ? 7
        : 30;

  for (
    let offset =
      count -
      1;
    offset >=
    0;
    offset -=
      1
  ) {
    const date =
      new Date(now);

    if (
      range === "24h"
    ) {
      date.setUTCMinutes(
        0,
        0,
        0,
      );
      date.setUTCHours(
        date.getUTCHours() -
          offset,
      );
    } else {
      date.setUTCHours(
        0,
        0,
        0,
        0,
      );
      date.setUTCDate(
        date.getUTCDate() -
          offset,
      );
    }

    result.push({
      key:
        bucketKeyFor(
          date,
          range,
        ),
      bucket:
        makeBucketLabel(
          date,
          range,
        ),
      createdCases:
        0,
      criticalCases:
        0,
      incidents:
        0,
    });
  }

  return result;
}

function determineHealth(input: {
  criticalOpenCases: number;
  breached: number;
  criticalIncidents: number;
  openIncidents: number;
}): {
  status:
    | "healthy"
    | "attention"
    | "critical";
  headline: string;
  summary: string;
} {
  if (
    input.criticalIncidents >
      0 ||
    input.criticalOpenCases >=
      3 ||
    input.breached >=
      5
  ) {
    return {
      status:
        "critical",
      headline:
        "Support operations require immediate attention",
      summary:
        "Critical cases, critical incidents, or multiple SLA breaches are active. Prioritize urgent queues before normal backlog.",
    };
  }

  if (
    input.openIncidents >
      0 ||
    input.criticalOpenCases >
      0 ||
    input.breached >
      0
  ) {
    return {
      status:
        "attention",
      headline:
        "Support operations need focused review",
      summary:
        "The platform has active escalations, incidents, or SLA pressure that should be reviewed by the Support team.",
    };
  }

  return {
    status:
      "healthy",
    headline:
      "Support operations are stable",
    summary:
      "No critical operational condition was detected in the current Support AI workspace snapshot.",
  };
}

function buildDailySummary(input: {
  range: SupportCommandCenterRange;
  openCases: number;
  criticalOpenCases: number;
  urgentOpenCases: number;
  breached: number;
  atRiskHigh: number;
  openIncidents: number;
  criticalIncidents: number;
  topFailureCauses: Array<{
    code: string;
    count: number;
  }>;
  topQueue: {
    queue: string;
    openCases: number;
  } | null;
}): string {
  const topCause =
    input.topFailureCauses[0];

  const pieces = [
    `Support Command Center summary for ${input.range}.`,
    `${input.openCases} open case(s), including ${input.criticalOpenCases} critical and ${input.urgentOpenCases} urgent.`,
    `${input.breached} case(s) breached the deterministic first-response SLA and ${input.atRiskHigh} are high-risk for breach.`,
    `${input.openIncidents} active incident(s), including ${input.criticalIncidents} critical.`,
    topCause
      ? `Most frequent verified failure cause: ${topCause.code} (${topCause.count} case(s)).`
      : "No verified failure cause dominates the current window.",
    input.topQueue
      ? `Largest active queue: ${input.topQueue.queue} (${input.topQueue.openCases} open case(s)).`
      : "No active queue backlog is present.",
  ];

  return pieces.join(
    " ",
  );
}

export async function getSupportCommandCenterSnapshot(input?: {
  range?: string;
}): Promise<SupportCommandCenterSnapshot> {
  const range =
    safeRange(
      input?.range,
    );

  const since =
    rangeStart(
      range,
    );

  const activeStatuses = [
    "open",
    "investigating",
    "waiting_customer",
    "escalated",
  ];

  const [
    allCases,
    recentCases,
    openIncidents,
    recentIncidents,
    recentEvents,
    activeAlerts,
    recentOutcomes,
    knowledgeDrafts,
  ] =
    await Promise.all([
      AiSupportCase.find({
        status: {
          $in:
            activeStatuses,
        },
      })
        .select(
          "caseId status severity priority queue assignedToUserId confirmedCause signalSnapshot createdAt updatedAt slaDueAt firstResponseAt responseTargetMinutes",
        )
        .lean(),

      AiSupportCase.find({
        createdAt: {
          $gte:
            since,
        },
      })
        .select(
          "caseId severity createdAt",
        )
        .lean(),

      AiSupportIncident.find({
        status: {
          $nin: [
            "resolved",
            "closed",
          ],
        },
      })
        .sort({
          lastSeenAt: -1,
        })
        .limit(25)
        .lean(),

      AiSupportIncident.find({
        createdAt: {
          $gte:
            since,
        },
      })
        .select(
          "incidentId severity createdAt",
        )
        .lean(),

      AiSupportCaseEvent.find({
        createdAt: {
          $gte:
            since,
        },
      })
        .sort({
          createdAt: -1,
        })
        .limit(30)
        .lean(),

      AiSupportAlert.find({
        status: {
          $in: [
            "open",
            "acknowledged",
          ],
        },
      })
        .sort({
          severity: 1,
          lastDetectedAt: -1,
        })
        .limit(20)
        .lean(),

      AiSupportCaseOutcome.find({
        updatedAt: {
          $gte:
            since,
        },
      })
        .select(
          "status reopenedCount",
        )
        .lean(),

      AiSupportKnowledgeDraft.find({})
        .select(
          "status",
        )
        .lean(),
    ]);

  const openCases =
    allCases.length;

  const investigatingCases =
    allCases.filter(
      (row) =>
        row.status ===
        "investigating",
    ).length;

  const waitingCustomerCases =
    allCases.filter(
      (row) =>
        row.status ===
        "waiting_customer",
    ).length;

  const escalatedCases =
    allCases.filter(
      (row) =>
        row.status ===
        "escalated",
    ).length;

  const resolvedCases =
    await AiSupportCase.countDocuments({
      status:
        "resolved",
      updatedAt: {
        $gte:
          since,
      },
    });

  const criticalOpenCases =
    allCases.filter(
      (row) =>
        row.severity ===
        "critical",
    ).length;

  const urgentOpenCases =
    allCases.filter(
      (row) =>
        row.priority ===
        "urgent",
    ).length;

  const unassignedOpenCases =
    allCases.filter(
      (row) =>
        !row.assignedToUserId,
    ).length;

  let breached = 0;
  let atRiskHigh = 0;
  let atRiskMedium = 0;
  let healthy = 0;
  let responded = 0;

  const queueMap =
    new Map<
      string,
      {
        openCases: number;
        critical: number;
        urgent: number;
        breached: number;
      }
    >();

  const causeMap =
    new Map<
      string,
      number
    >();

  const providerSignalMap =
    new Map<
      string,
      number
    >();

  const agentMap =
    new Map<
      string,
      {
        openCases: number;
        urgent: number;
        critical: number;
      }
    >();

  for (
    const row of
    allCases
  ) {
    const state =
      slaState(
        new Date(
          row.createdAt,
        ),
        new Date(
          row.slaDueAt,
        ),
        row.firstResponseAt
          ? new Date(
              row.firstResponseAt,
            )
          : null,
        row.responseTargetMinutes,
      );

    if (
      state ===
      "breached"
    ) {
      breached += 1;
    } else if (
      state ===
      "at_risk_high"
    ) {
      atRiskHigh += 1;
    } else if (
      state ===
      "at_risk_medium"
    ) {
      atRiskMedium += 1;
    } else if (
      state ===
      "responded"
    ) {
      responded += 1;
    } else {
      healthy += 1;
    }

    const queue =
      row.queue ||
      "support";

    const queueStats =
      queueMap.get(
        queue,
      ) ?? {
        openCases: 0,
        critical: 0,
        urgent: 0,
        breached: 0,
      };

    queueStats.openCases +=
      1;

    if (
      row.severity ===
      "critical"
    ) {
      queueStats.critical +=
        1;
    }

    if (
      row.priority ===
      "urgent"
    ) {
      queueStats.urgent +=
        1;
    }

    if (
      state ===
      "breached"
    ) {
      queueStats.breached +=
        1;
    }

    queueMap.set(
      queue,
      queueStats,
    );

    const causeCode =
      row.confirmedCause?.code
        ?.trim()
        .toLowerCase();

    if (
      causeCode
    ) {
      causeMap.set(
        causeCode,
        (
          causeMap.get(
            causeCode,
          ) ??
          0
        ) +
          1,
      );
    }

    for (
      const signal of
      row.signalSnapshot ??
      []
    ) {
      const code =
        signal.code
          ?.trim()
          .toLowerCase();

      if (
        !code
      ) {
        continue;
      }

      if (
        code.includes(
          "provider",
        ) ||
        code.includes(
          "payment_attempt",
        )
      ) {
        providerSignalMap.set(
          code,
          (
            providerSignalMap.get(
              code,
            ) ??
            0
          ) +
            1,
        );
      }
    }

    if (
      row.assignedToUserId
    ) {
      const workload =
        agentMap.get(
          row.assignedToUserId,
        ) ?? {
          openCases: 0,
          urgent: 0,
          critical: 0,
        };

      workload.openCases +=
        1;

      if (
        row.priority ===
        "urgent"
      ) {
        workload.urgent +=
          1;
      }

      if (
        row.severity ===
        "critical"
      ) {
        workload.critical +=
          1;
      }

      agentMap.set(
        row.assignedToUserId,
        workload,
      );
    }
  }

  const queues =
    Array.from(
      queueMap.entries(),
    )
      .map(
        ([
          queue,
          stats,
        ]) => ({
          queue,
          ...stats,
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.openCases -
          left.openCases,
      );

  const topFailureCauses =
    Array.from(
      causeMap.entries(),
    )
      .map(
        ([
          code,
          count,
        ]) => ({
          code,
          count,
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.count -
          left.count,
      )
      .slice(
        0,
        8,
      );

  const providerSignals =
    Array.from(
      providerSignalMap.entries(),
    )
      .map(
        ([
          code,
          count,
        ]) => ({
          code,
          count,
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.count -
          left.count,
      )
      .slice(
        0,
        8,
      );

  const agentWorkload =
    Array.from(
      agentMap.entries(),
    )
      .map(
        ([
          userId,
          stats,
        ]) => ({
          userId,
          ...stats,
        }),
      )
      .sort(
        (
          left,
          right,
        ) =>
          right.openCases -
          left.openCases,
      );

  const criticalIncidents =
    openIncidents.filter(
      (incident) =>
        incident.severity ===
        "critical",
    ).length;

  const health =
    determineHealth({
      criticalOpenCases,
      breached,
      criticalIncidents,
      openIncidents:
        openIncidents.length,
    });

  const trend =
    buildTrendBuckets(
      range,
    );

  const trendMap =
    new Map(
      trend.map(
        (item) => [
          item.key,
          item,
        ],
      ),
    );

  for (
    const row of
    recentCases
  ) {
    const key =
      bucketKeyFor(
        new Date(
          row.createdAt,
        ),
        range,
      );

    const bucket =
      trendMap.get(
        key,
      );

    if (
      bucket
    ) {
      bucket.createdCases +=
        1;

      if (
        row.severity ===
        "critical"
      ) {
        bucket.criticalCases +=
          1;
      }
    }
  }

  for (
    const incident of
    recentIncidents
  ) {
    const key =
      bucketKeyFor(
        new Date(
          incident.createdAt,
        ),
        range,
      );

    const bucket =
      trendMap.get(
        key,
      );

    if (
      bucket
    ) {
      bucket.incidents +=
        1;
    }
  }

  const summary =
    buildDailySummary({
      range,
      openCases,
      criticalOpenCases,
      urgentOpenCases,
      breached,
      atRiskHigh,
      openIncidents:
        openIncidents.length,
      criticalIncidents,
      topFailureCauses,
      topQueue:
        queues[0]
          ? {
              queue:
                queues[0].queue,
              openCases:
                queues[0].openCases,
            }
          : null,
    });

  const outcomeCount =
    recentOutcomes.length;

  const resolvedOutcomeCount =
    recentOutcomes.filter(
      (row) =>
        row.status ===
        "resolved",
    ).length;

  const escalatedOutcomeCount =
    recentOutcomes.filter(
      (row) =>
        row.status ===
        "escalated",
    ).length;

  const reopenedOutcomeCount =
    recentOutcomes.filter(
      (row) =>
        (
          row.reopenedCount ??
          0
        ) >
        0,
    ).length;

  return {
    generatedAt:
      new Date().toISOString(),

    range,

    health,

    overview: {
      openCases,
      investigatingCases,
      waitingCustomerCases,
      escalatedCases,
      resolvedCases,
      criticalOpenCases,
      urgentOpenCases,
      unassignedOpenCases,
      openIncidents:
        openIncidents.length,
      criticalIncidents,
    },

    sla: {
      breached,
      atRiskHigh,
      atRiskMedium,
      healthy,
      responded,
      breachRate:
        percent(
          breached,
          openCases,
        ),
    },

    queues,

    topFailureCauses,

    providerSignals,

    agentWorkload,

    alerts: {
      open:
        activeAlerts.filter(
          (alert) =>
            alert.status ===
            "open",
        ).length,
      critical:
        activeAlerts.filter(
          (alert) =>
            alert.severity ===
            "critical",
        ).length,
      high:
        activeAlerts.filter(
          (alert) =>
            alert.severity ===
            "high",
        ).length,
      acknowledged:
        activeAlerts.filter(
          (alert) =>
            alert.status ===
            "acknowledged",
        ).length,
    },

    alertFeed:
      activeAlerts
        .slice(
          0,
          12,
        )
        .map(
          (alert) => ({
            alertId:
              alert.alertId,
            type:
              alert.type,
            severity:
              alert.severity,
            status:
              alert.status,
            title:
              alert.title,
            summary:
              alert.summary,
            lastDetectedAt:
              alert.lastDetectedAt.toISOString(),
          }),
        ),

    incidents:
      openIncidents
        .slice(
          0,
          12,
        )
        .map(
          (incident) => ({
            incidentId:
              incident.incidentId,
            title:
              incident.title,
            status:
              incident.status,
            severity:
              incident.severity,
            queue:
              incident.queue,
            causeCode:
              incident.causeCode ??
              null,
            caseCount:
              incident.caseCount,
            lastSeenAt:
              incident.lastSeenAt.toISOString(),
          }),
        ),

    recentEvents:
      recentEvents
        .slice(
          0,
          20,
        )
        .map(
          (event) => ({
            caseId:
              event.caseId,
            eventType:
              event.eventType,
            summary:
              event.summary,
            createdAt:
              event.createdAt.toISOString(),
          }),
        ),

    trend:
      trend.map(
        ({
          key: _key,
          ...item
        }) =>
          item,
      ),

    resolutionQuality: {
      outcomesInRange:
        outcomeCount,
      resolved:
        resolvedOutcomeCount,
      escalated:
        escalatedOutcomeCount,
      reopened:
        reopenedOutcomeCount,
      resolutionRate:
        outcomeCount > 0
          ? Number(
              (
                resolvedOutcomeCount /
                outcomeCount *
                100
              ).toFixed(
                1,
              ),
            )
          : 0,
      escalationRate:
        outcomeCount > 0
          ? Number(
              (
                escalatedOutcomeCount /
                outcomeCount *
                100
              ).toFixed(
                1,
              ),
            )
          : 0,
      reopenRate:
        outcomeCount > 0
          ? Number(
              (
                reopenedOutcomeCount /
                outcomeCount *
                100
              ).toFixed(
                1,
              ),
            )
          : 0,
    },

    knowledgeLearning: {
      draft:
        knowledgeDrafts.filter(
          (row) =>
            row.status ===
            "draft",
        ).length,
      submitted:
        knowledgeDrafts.filter(
          (row) =>
            row.status ===
            "submitted",
        ).length,
      approved:
        knowledgeDrafts.filter(
          (row) =>
            row.status ===
            "approved",
        ).length,
      rejected:
        knowledgeDrafts.filter(
          (row) =>
            row.status ===
            "rejected",
        ).length,
      published:
        knowledgeDrafts.filter(
          (row) =>
            row.status ===
            "published",
        ).length,
    },

    dailyOperationsSummary:
      summary,
  };
}
