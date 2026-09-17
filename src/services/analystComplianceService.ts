import {
  AuditLog,
} from "../models/AuditLog.js";

import {
  KYC,
} from "../models/KYC.js";

import {
  KYCAIReview,
} from "../models/KYCAIReview.js";

import {
  PlatformSettingsAudit,
} from "../models/PlatformSettingsAudit.js";

import {
  SecurityEvent,
} from "../models/SecurityEvent.js";

import {
  SystemLog,
} from "../models/SystemLog.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
} from "../types/analystTypes.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export interface AnalystComplianceInsight {
  id:
    string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "kyc"
    | "ai_review"
    | "security"
    | "audit"
    | "system"
    | "data_quality";

  title:
    string;

  description:
    string;

  evidence:
    string;

  recommendedReview:
    string;
}

/* =========================================================
   COMPLIANCE RESPONSE
========================================================= */

export interface AnalystComplianceData {
  generatedAt:
    string;

  filters: {
    range:
      AnalystDateFilters["range"];

    bucket:
      AnalystDateFilters["bucket"];

    from:
      string;

    to:
      string;

    previousFrom:
      string;

    previousTo:
      string;
  };

  population: {
    totalKycRecords:
      number;

    notStarted:
      number;

    pending:
      number;

    underReview:
      number;

    verified:
      number;

    rejected:
      number;

    verificationCoverage:
      number;
  };

  metrics: {
    submittedKycCount:
      AnalystMetric;

    verifiedKycCount:
      AnalystMetric;

    aiReviewCount:
      AnalystMetric;

    highRiskAiReviewCount:
      AnalystMetric;

    securityWarningCount:
      AnalystMetric;

    auditEventCount:
      AnalystMetric;

    criticalSettingsChangeCount:
      AnalystMetric;

    systemErrorCount:
      AnalystMetric;
  };

  trend:
    Array<{
      bucket:
        string;

      submittedKycCount:
        number;

      verifiedKycCount:
        number;

      highRiskAiReviewCount:
        number;

      securityWarningCount:
        number;

      systemErrorCount:
        number;
    }>;

  kycStatuses:
    Array<{
      status:
        string;

      count:
        number;

      percentage:
        number;
    }>;

  aiRiskLevels:
    Array<{
      riskLevel:
        string;

      count:
        number;

      percentage:
        number;
    }>;

  securityEvents:
    Array<{
      eventType:
        string;

      count:
        number;

      percentage:
        number;
    }>;

  auditActions:
    Array<{
      action:
        string;

      count:
        number;

      percentage:
        number;
    }>;

  systemServices:
    Array<{
      service:
        string;

      errorCount:
        number;

      percentage:
        number;
    }>;

  insights:
    AnalystComplianceInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface CompliancePeriodData {
  submittedKycCount:
    number;

  verifiedKycCount:
    number;

  aiReviewCount:
    number;

  highRiskAiReviewCount:
    number;

  securityWarningCount:
    number;

  auditEventCount:
    number;

  criticalSettingsChangeCount:
    number;

  systemErrorCount:
    number;
}

interface AggregateCountRow {
  _id?:
    unknown;

  count?:
    unknown;
}

interface BreakdownItem {
  key:
    string;

  count:
    number;

  percentage:
    number;
}

interface TimelineAggregateRow {
  _id?:
    unknown;

  count?:
    unknown;
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(
  value: unknown
): number {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function safeCount(
  value: unknown
): number {
  return Math.max(
    0,
    Math.round(
      safeNumber(value)
    )
  );
}

function round(
  value: number
): number {
  return Number(
    value.toFixed(2)
  );
}

function percentage(
  part: number,
  total: number
): number {
  if (
    total <= 0
  ) {
    return 0;
  }

  return round(
    (
      part /
      total
    ) *
      100
  );
}

function changePercent(
  current: number,
  previous: number
): number | null {
  if (
    previous === 0
  ) {
    return current === 0
      ? 0
      : null;
  }

  return round(
    (
      (
        current -
        previous
      ) /
      Math.abs(
        previous
      )
    ) *
      100
  );
}

function metric(
  current: number,
  previous: number
): AnalystMetric {
  return {
    value:
      current,

    previousValue:
      previous,

    changePercent:
      changePercent(
        current,
        previous
      ),
  };
}

/* =========================================================
   PERIOD COUNTS
========================================================= */

async function loadPeriodData(
  from: Date,
  to: Date
): Promise<CompliancePeriodData> {
  const [
    submittedKycCount,
    verifiedKycCount,
    aiReviewCount,
    highRiskAiReviewCount,
    securityWarningCount,
    auditEventCount,
    criticalSettingsChangeCount,
    systemErrorCount,
  ] =
    await Promise.all([
      KYC.countDocuments({
        submittedAt: {
          $gte:
            from,

          $lt:
            to,
        },
      }),

      KYC.countDocuments({
        verifiedAt: {
          $gte:
            from,

          $lt:
            to,
        },
      }),

      KYCAIReview.countDocuments({
        reviewedAt: {
          $gte:
            from,

          $lt:
            to,
        },
      }),

      KYCAIReview.countDocuments({
        reviewedAt: {
          $gte:
            from,

          $lt:
            to,
        },

        riskLevel: {
          $in: [
            "High",
            "Critical",
          ],
        },
      }),

      SecurityEvent.countDocuments({
        createdAt: {
          $gte:
            from,

          $lt:
            to,
        },

        status:
          "warning",
      }),

      AuditLog.countDocuments({
        createdAt: {
          $gte:
            from,

          $lt:
            to,
        },
      }),

      PlatformSettingsAudit.countDocuments({
        occurredAt: {
          $gte:
            from,

          $lt:
            to,
        },

        severity:
          "critical",
      }),

      SystemLog.countDocuments({
        timestamp: {
          $gte:
            from,

          $lt:
            to,
        },

        level: {
          $in: [
            "ERROR",
            "CRITICAL",
          ],
        },
      }),
    ]);

  return {
    submittedKycCount,
    verifiedKycCount,
    aiReviewCount,
    highRiskAiReviewCount,
    securityWarningCount,
    auditEventCount,
    criticalSettingsChangeCount,
    systemErrorCount,
  };
}

/* =========================================================
   BREAKDOWN NORMALIZER
========================================================= */

function normalizeBreakdown(
  rows:
    AggregateCountRow[]
): BreakdownItem[] {
  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        safeCount(
          row.count
        ),
      0
    );

  return rows.map(
    (
      row
    ): BreakdownItem => {
      const count =
        safeCount(
          row.count
        );

      return {
        key:
          row._id ===
            null ||
          row._id ===
            undefined
            ? "unknown"
            : String(
                row._id
              ),

        count,

        percentage:
          percentage(
            count,
            total
          ),
      };
    }
  );
}

/* =========================================================
   KYC STATUS BREAKDOWN
========================================================= */

async function loadKycStatusBreakdown(): Promise<
  BreakdownItem[]
> {
  const rows =
    await KYC.aggregate<AggregateCountRow>(
      [
        {
          $group: {
            _id: {
              $ifNull: [
                "$status",
                "unknown",
              ],
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            count:
              -1,
          },
        },

        {
          $limit:
            10,
        },
      ]
    );

  return normalizeBreakdown(
    rows
  );
}

/* =========================================================
   AI RISK BREAKDOWN
========================================================= */

async function loadAiRiskBreakdown(
  filters:
    AnalystDateFilters
): Promise<
  BreakdownItem[]
> {
  const rows =
    await KYCAIReview.aggregate<AggregateCountRow>(
      [
        {
          $match: {
            reviewedAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },
          },
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$riskLevel",
                "unknown",
              ],
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            count:
              -1,
          },
        },

        {
          $limit:
            10,
        },
      ]
    );

  return normalizeBreakdown(
    rows
  );
}

/* =========================================================
   SECURITY EVENT BREAKDOWN
========================================================= */

async function loadSecurityEventBreakdown(
  filters:
    AnalystDateFilters
): Promise<
  BreakdownItem[]
> {
  const rows =
    await SecurityEvent.aggregate<AggregateCountRow>(
      [
        {
          $match: {
            createdAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },

            status:
              "warning",
          },
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$eventType",
                "unknown",
              ],
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            count:
              -1,
          },
        },

        {
          $limit:
            10,
        },
      ]
    );

  return normalizeBreakdown(
    rows
  );
}

/* =========================================================
   AUDIT ACTION BREAKDOWN
========================================================= */

async function loadAuditActionBreakdown(
  filters:
    AnalystDateFilters
): Promise<
  BreakdownItem[]
> {
  const rows =
    await AuditLog.aggregate<AggregateCountRow>(
      [
        {
          $match: {
            createdAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },
          },
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$action",
                "unknown",
              ],
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            count:
              -1,
          },
        },

        {
          $limit:
            10,
        },
      ]
    );

  return normalizeBreakdown(
    rows
  );
}

/* =========================================================
   SYSTEM ERROR SERVICE BREAKDOWN
========================================================= */

async function loadSystemServiceBreakdown(
  filters:
    AnalystDateFilters
): Promise<
  BreakdownItem[]
> {
  const rows =
    await SystemLog.aggregate<AggregateCountRow>(
      [
        {
          $match: {
            timestamp: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },

            level: {
              $in: [
                "ERROR",
                "CRITICAL",
              ],
            },
          },
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$service",
                "unknown",
              ],
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            count:
              -1,
          },
        },

        {
          $limit:
            10,
        },
      ]
    );

  return normalizeBreakdown(
    rows
  );
}

/* =========================================================
   TIMELINE MAP
========================================================= */

function timelineMap(
  rows:
    TimelineAggregateRow[]
): Map<
  string,
  number
> {
  const result =
    new Map<
      string,
      number
    >();

  for (
    const row of
    rows
  ) {
    if (
      row._id ===
        null ||
      row._id ===
        undefined
    ) {
      continue;
    }

    const date =
      new Date(
        String(
          row._id
        )
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      continue;
    }

    result.set(
      date.toISOString(),
      safeCount(
        row.count
      )
    );
  }

  return result;
}

/* =========================================================
   KYC SUBMISSION TREND
========================================================= */

async function loadSubmittedKycTrend(
  filters:
    AnalystDateFilters
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    await KYC.aggregate<TimelineAggregateRow>(
      [
        {
          $match: {
            submittedAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },
          },
        },

        {
          $group: {
            _id: {
              $dateTrunc: {
                date:
                  "$submittedAt",

                unit:
                  filters.bucket,

                timezone:
                  "UTC",
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  return timelineMap(
    rows
  );
}

/* =========================================================
   VERIFIED KYC TREND
========================================================= */

async function loadVerifiedKycTrend(
  filters:
    AnalystDateFilters
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    await KYC.aggregate<TimelineAggregateRow>(
      [
        {
          $match: {
            verifiedAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },
          },
        },

        {
          $group: {
            _id: {
              $dateTrunc: {
                date:
                  "$verifiedAt",

                unit:
                  filters.bucket,

                timezone:
                  "UTC",
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  return timelineMap(
    rows
  );
}

/* =========================================================
   HIGH-RISK AI REVIEW TREND
========================================================= */

async function loadHighRiskAiTrend(
  filters:
    AnalystDateFilters
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    await KYCAIReview.aggregate<TimelineAggregateRow>(
      [
        {
          $match: {
            reviewedAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },

            riskLevel: {
              $in: [
                "High",
                "Critical",
              ],
            },
          },
        },

        {
          $group: {
            _id: {
              $dateTrunc: {
                date:
                  "$reviewedAt",

                unit:
                  filters.bucket,

                timezone:
                  "UTC",
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  return timelineMap(
    rows
  );
}

/* =========================================================
   SECURITY WARNING TREND
========================================================= */

async function loadSecurityWarningTrend(
  filters:
    AnalystDateFilters
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    await SecurityEvent.aggregate<TimelineAggregateRow>(
      [
        {
          $match: {
            createdAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },

            status:
              "warning",
          },
        },

        {
          $group: {
            _id: {
              $dateTrunc: {
                date:
                  "$createdAt",

                unit:
                  filters.bucket,

                timezone:
                  "UTC",
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  return timelineMap(
    rows
  );
}

/* =========================================================
   SYSTEM ERROR TREND
========================================================= */

async function loadSystemErrorTrend(
  filters:
    AnalystDateFilters
): Promise<
  Map<
    string,
    number
  >
> {
  const rows =
    await SystemLog.aggregate<TimelineAggregateRow>(
      [
        {
          $match: {
            timestamp: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },

            level: {
              $in: [
                "ERROR",
                "CRITICAL",
              ],
            },
          },
        },

        {
          $group: {
            _id: {
              $dateTrunc: {
                date:
                  "$timestamp",

                unit:
                  filters.bucket,

                timezone:
                  "UTC",
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  return timelineMap(
    rows
  );
}

/* =========================================================
   BUCKET COUNT
========================================================= */

function bucketCount(
  range:
    AnalystDateFilters[
      "range"
    ]
): number {
  switch (
    range
  ) {
    case "24h":
      return 24;

    case "7d":
      return 7;

    case "30d":
      return 30;

    case "90d":
      return 90;
  }
}

/* =========================================================
   BUCKET KEYS
========================================================= */

function bucketKeys(
  filters:
    AnalystDateFilters
): string[] {
  const count =
    bucketCount(
      filters.range
    );

  const end =
    new Date(
      filters.to
    );

  if (
    filters.bucket ===
    "hour"
  ) {
    end.setUTCMinutes(
      0,
      0,
      0
    );
  } else {
    end.setUTCHours(
      0,
      0,
      0,
      0
    );
  }

  const step =
    filters.bucket ===
    "hour"
      ? 60 *
        60 *
        1000
      : 24 *
        60 *
        60 *
        1000;

  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      index
    ) =>
      new Date(
        end.getTime() -
          (
            count -
            1 -
            index
          ) *
            step
      ).toISOString()
  );
}

/* =========================================================
   INSIGHT ENGINE
========================================================= */

function buildInsights(
  current:
    CompliancePeriodData,
  population:
    AnalystComplianceData[
      "population"
    ]
): AnalystComplianceInsight[] {
  const result:
    AnalystComplianceInsight[] =
    [];

  const unresolved =
    population.pending +
    population.underReview;

  /* ---------------------------------------------------------
     NO KYC DATA
  --------------------------------------------------------- */

  if (
    population.totalKycRecords ===
    0
  ) {
    result.push({
      id:
        "no-kyc",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "No KYC records are available",

      description:
        "Compliance coverage cannot be assessed from KYC records yet.",

      evidence:
        "0 KYC records.",

      recommendedReview:
        "Confirm that KYC submissions are being persisted.",
    });
  }

  /* ---------------------------------------------------------
     KYC REVIEW BACKLOG
  --------------------------------------------------------- */

  if (
    unresolved >=
    10
  ) {
    result.push({
      id:
        "kyc-backlog",

      severity:
        unresolved >=
        30
          ? "high"
          : "medium",

      category:
        "kyc",

      title:
        "KYC review backlog is elevated",

      description:
        "Several KYC records remain pending or under review.",

      evidence:
        `${unresolved} KYC records require completion.`,

      recommendedReview:
        "Review verification capacity and aging before changing approval policy.",
    });
  }

  /* ---------------------------------------------------------
     AI HIGH RISK
  --------------------------------------------------------- */

  if (
    current.highRiskAiReviewCount >
    0
  ) {
    result.push({
      id:
        "high-risk-ai-review",

      severity:
        current.highRiskAiReviewCount >=
        10
          ? "high"
          : "medium",

      category:
        "ai_review",

      title:
        "High-risk AI-assisted KYC reviews detected",

      description:
        "One or more KYC AI reviews were classified High or Critical.",

      evidence:
        `${current.highRiskAiReviewCount} high-risk AI review results.`,

      recommendedReview:
        "Treat AI output as a review signal and validate against the authoritative KYC record.",
    });
  }

  /* ---------------------------------------------------------
     PLATFORM SETTINGS AUDIT
  --------------------------------------------------------- */

  if (
    current.criticalSettingsChangeCount >
    0
  ) {
    result.push({
      id:
        "critical-settings",

      severity:
        "high",

      category:
        "audit",

      title:
        "Critical platform settings changes occurred",

      description:
        "Critical settings mutations were recorded by the append-only settings audit.",

      evidence:
        `${current.criticalSettingsChangeCount} critical settings audit events.`,

      recommendedReview:
        "Review changed sections and the audit chain.",
    });
  }

  /* ---------------------------------------------------------
     SYSTEM ERRORS
  --------------------------------------------------------- */

  if (
    current.systemErrorCount >=
    10
  ) {
    result.push({
      id:
        "system-errors",

      severity:
        current.systemErrorCount >=
        30
          ? "high"
          : "medium",

      category:
        "system",

      title:
        "System error volume is elevated",

      description:
        "A material number of ERROR or CRITICAL system logs occurred.",

      evidence:
        `${current.systemErrorCount} ERROR/CRITICAL system logs.`,

      recommendedReview:
        "Check affected services and request traces.",
    });
  }

  /* ---------------------------------------------------------
     POSITIVE SIGNAL
  --------------------------------------------------------- */

  if (
    population.verificationCoverage >=
      90 &&
    unresolved ===
      0 &&
    current.criticalSettingsChangeCount ===
      0
  ) {
    result.push({
      id:
        "healthy-compliance",

      severity:
        "positive",

      category:
        "kyc",

      title:
        "Verification coverage is strong",

      description:
        "KYC verification coverage is high with no current review backlog.",

      evidence:
        `${population.verificationCoverage.toFixed(
          2
        )}% verification coverage.`,

      recommendedReview:
        "Continue monitoring audit and high-risk review signals.",
    });
  }

  /* ---------------------------------------------------------
     FALLBACK
  --------------------------------------------------------- */

  if (
    result.length ===
    0
  ) {
    result.push({
      id:
        "compliance-stable",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "Compliance indicators are within current thresholds",

      description:
        "No major deterministic compliance signal was triggered.",

      evidence:
        `${current.auditEventCount} audit events evaluated.`,

      recommendedReview:
        "Continue monitoring KYC, security, audit and system indicators.",
    });
  }

  return result;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystCompliance(
  filters:
    AnalystDateFilters
): Promise<AnalystComplianceData> {
  const [
    current,
    previous,

    totalKycRecords,

    kycRows,
    aiRows,
    securityRows,
    auditRows,
    systemRows,

    submittedTrend,
    verifiedTrend,
    aiTrend,
    securityTrend,
    systemTrend,
  ] =
    await Promise.all([
      loadPeriodData(
        filters.from,
        filters.to
      ),

      loadPeriodData(
        filters.previousFrom,
        filters.previousTo
      ),

      KYC.countDocuments(),

      loadKycStatusBreakdown(),

      loadAiRiskBreakdown(
        filters
      ),

      loadSecurityEventBreakdown(
        filters
      ),

      loadAuditActionBreakdown(
        filters
      ),

      loadSystemServiceBreakdown(
        filters
      ),

      loadSubmittedKycTrend(
        filters
      ),

      loadVerifiedKycTrend(
        filters
      ),

      loadHighRiskAiTrend(
        filters
      ),

      loadSecurityWarningTrend(
        filters
      ),

      loadSystemErrorTrend(
        filters
      ),
    ]);

  /* =======================================================
     KYC STATUS MAP

     Explicit Map<string, number> prevents:
     number | {} inference problems.
  ======================================================== */

  const statusMap =
    new Map<
      string,
      number
    >(
      kycRows.map(
        (
          row
        ): [
          string,
          number,
        ] => [
          row.key,
          row.count,
        ]
      )
    );

  const notStarted =
    statusMap.get(
      "not_started"
    ) ??
    0;

  const pending =
    statusMap.get(
      "pending"
    ) ??
    0;

  const underReview =
    statusMap.get(
      "under_review"
    ) ??
    0;

  const verified =
    statusMap.get(
      "verified"
    ) ??
    0;

  const rejected =
    statusMap.get(
      "rejected"
    ) ??
    0;

  /* =======================================================
     POPULATION
  ======================================================== */

  const population:
    AnalystComplianceData[
      "population"
    ] = {
    totalKycRecords,

    notStarted,

    pending,

    underReview,

    verified,

    rejected,

    verificationCoverage:
      percentage(
        verified,
        totalKycRecords
      ),
  };

  /* =======================================================
     TREND
  ======================================================== */

  const trend:
    AnalystComplianceData[
      "trend"
    ] =
    bucketKeys(
      filters
    ).map(
      (
        bucket
      ) => ({
        bucket,

        submittedKycCount:
          submittedTrend.get(
            bucket
          ) ??
          0,

        verifiedKycCount:
          verifiedTrend.get(
            bucket
          ) ??
          0,

        highRiskAiReviewCount:
          aiTrend.get(
            bucket
          ) ??
          0,

        securityWarningCount:
          securityTrend.get(
            bucket
          ) ??
          0,

        systemErrorCount:
          systemTrend.get(
            bucket
          ) ??
          0,
      })
    );

  /* =======================================================
     RESPONSE
  ======================================================== */

  return {
    generatedAt:
      new Date()
        .toISOString(),

    filters: {
      range:
        filters.range,

      bucket:
        filters.bucket,

      from:
        filters.from
          .toISOString(),

      to:
        filters.to
          .toISOString(),

      previousFrom:
        filters.previousFrom
          .toISOString(),

      previousTo:
        filters.previousTo
          .toISOString(),
    },

    population,

    metrics: {
      submittedKycCount:
        metric(
          current.submittedKycCount,
          previous.submittedKycCount
        ),

      verifiedKycCount:
        metric(
          current.verifiedKycCount,
          previous.verifiedKycCount
        ),

      aiReviewCount:
        metric(
          current.aiReviewCount,
          previous.aiReviewCount
        ),

      highRiskAiReviewCount:
        metric(
          current.highRiskAiReviewCount,
          previous.highRiskAiReviewCount
        ),

      securityWarningCount:
        metric(
          current.securityWarningCount,
          previous.securityWarningCount
        ),

      auditEventCount:
        metric(
          current.auditEventCount,
          previous.auditEventCount
        ),

      criticalSettingsChangeCount:
        metric(
          current.criticalSettingsChangeCount,
          previous.criticalSettingsChangeCount
        ),

      systemErrorCount:
        metric(
          current.systemErrorCount,
          previous.systemErrorCount
        ),
    },

    trend,

    kycStatuses:
      kycRows.map(
        (
          row
        ) => ({
          status:
            row.key,

          count:
            row.count,

          percentage:
            row.percentage,
        })
      ),

    aiRiskLevels:
      aiRows.map(
        (
          row
        ) => ({
          riskLevel:
            row.key,

          count:
            row.count,

          percentage:
            row.percentage,
        })
      ),

    securityEvents:
      securityRows.map(
        (
          row
        ) => ({
          eventType:
            row.key,

          count:
            row.count,

          percentage:
            row.percentage,
        })
      ),

    auditActions:
      auditRows.map(
        (
          row
        ) => ({
          action:
            row.key,

          count:
            row.count,

          percentage:
            row.percentage,
        })
      ),

    systemServices:
      systemRows.map(
        (
          row
        ) => ({
          service:
            row.key,

          errorCount:
            row.count,

          percentage:
            row.percentage,
        })
      ),

    insights:
      buildInsights(
        current,
        population
      ),
  };
}