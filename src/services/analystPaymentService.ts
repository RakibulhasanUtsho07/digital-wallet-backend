import mongoose from "mongoose";

import {
  Payment,
  type PaymentSourceType,
  type PaymentStatus,
} from "../models/Payment.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type AnalystPaymentRange =
  | "24h"
  | "7d"
  | "30d"
  | "90d";

export type AnalystPaymentMode =
  | "all"
  | "test"
  | "live";

export type AnalystPaymentBucket =
  | "hour"
  | "day";

export interface AnalystPaymentFilters {
  range: AnalystPaymentRange;
  mode: AnalystPaymentMode;
  currency: string;
  provider: string;
  status:
    | "all"
    | PaymentStatus;
  source:
    | "all"
    | PaymentSourceType;
}

export interface AnalystPaymentMetric {
  value: number;
  previousValue: number;
  changePercent:
    number | null;
}

export interface AnalystPaymentInsight {
  id: string;
  severity:
    | "critical"
    | "warning"
    | "info"
    | "positive";
  title: string;
  description: string;
  evidence: string;
  recommendedReview: string;
}

export interface AnalystPaymentAnalyticsData {
  generatedAt: string;
  source:
    "mongodb_payment_collection";
  intelligenceEngine: {
    type:
      "deterministic_rules";
    paidProviderUsed:
      false;
    version: string;
  };
  filters: AnalystPaymentFilters & {
    from: string;
    to: string;
    previousFrom: string;
    bucket:
      AnalystPaymentBucket;
  };
  metrics: {
    attemptCount:
      AnalystPaymentMetric;
    completedCount:
      AnalystPaymentMetric;
    failedCount:
      AnalystPaymentMetric;
    paymentVolumeMinor:
      AnalystPaymentMetric;
    feeRevenueMinor:
      AnalystPaymentMetric;
    netVolumeMinor:
      AnalystPaymentMetric;
    averagePaymentMinor:
      AnalystPaymentMetric;
    successRate:
      AnalystPaymentMetric;
    failureRate:
      AnalystPaymentMetric;
    averageCompletionSeconds:
      AnalystPaymentMetric;
  };
  operations: {
    pendingCount: number;
    cancelledCount: number;
    expiredCount: number;
    riskBlockedCount: number;
  };
  trend: Array<{
    bucket: string;
    attemptCount: number;
    completedCount: number;
    failedCount: number;
    pendingCount: number;
    volumeMinor: number;
    successRate: number;
  }>;
  statuses: Array<{
    status: string;
    count: number;
    percentage: number;
    volumeMinor: number;
  }>;
  providers: Array<{
    provider: string;
    attemptCount: number;
    completedCount: number;
    failedCount: number;
    pendingCount: number;
    volumeMinor: number;
    feeRevenueMinor: number;
    successRate: number;
    averageCompletionSeconds:
      number;
    health:
      | "healthy"
      | "attention"
      | "critical";
  }>;
  sources: Array<{
    source: string;
    count: number;
    percentage: number;
    volumeMinor: number;
  }>;
  modes: Array<{
    mode: string;
    count: number;
    percentage: number;
    volumeMinor: number;
  }>;
  failureReasons: Array<{
    code: string;
    count: number;
    percentage: number;
  }>;
  latency: Array<{
    key: string;
    label: string;
    count: number;
    percentage: number;
  }>;
  insights:
    AnalystPaymentInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface SummaryRow {
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  cancelledCount: number;
  expiredCount: number;
  paymentVolumeMinor: number;
  feeRevenueMinor: number;
  netVolumeMinor: number;
  averagePaymentMinor: number;
  averageCompletionSeconds:
    number;
}

interface TrendRow {
  _id: Date;
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  volumeMinor: number;
}

interface BreakdownRow {
  _id: string;
  count: number;
  volumeMinor: number;
}

interface ProviderRow {
  _id: string;
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  volumeMinor: number;
  feeRevenueMinor: number;
  averageCompletionSeconds:
    number;
}

interface CountRow {
  _id: string;
  count: number;
}

interface PaymentAnalyticsAggregate {
  current: SummaryRow[];
  previous: SummaryRow[];
  trend: TrendRow[];
  statuses: BreakdownRow[];
  providers: ProviderRow[];
  sources: BreakdownRow[];
  modes: BreakdownRow[];
  failureReasons: CountRow[];
  latency: CountRow[];
}

interface RangeBoundary {
  from: Date;
  to: Date;
  previousFrom: Date;
  bucket: AnalystPaymentBucket;
  bucketCount: number;
}

/* =========================================================
   CONSTANTS
========================================================= */

const COMPLETED_STATUS =
  "completed";

const PENDING_STATUSES = [
  "pending",
  "authorized",
  "captured",
];

/* =========================================================
   NUMBER HELPERS
========================================================= */

function finiteNumber(
  input: unknown
): number {
  return typeof input === "number" &&
    Number.isFinite(input)
    ? input
    : 0;
}

function round(
  input: number,
  digits = 2
): number {
  const multiplier =
    10 ** digits;

  return Math.round(
    input * multiplier
  ) / multiplier;
}

function percentage(
  part: number,
  total: number
): number {
  if (total <= 0) {
    return 0;
  }

  return round(
    (part / total) * 100
  );
}

function changePercent(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return current === 0
      ? 0
      : null;
  }

  return round(
    ((current - previous) /
      previous) *
      100
  );
}

function metric(
  current: number,
  previous: number
): AnalystPaymentMetric {
  return {
    value:
      round(current),
    previousValue:
      round(previous),
    changePercent:
      changePercent(
        current,
        previous
      ),
  };
}

/* =========================================================
   RANGE HELPERS
========================================================= */

function getRangeBoundary(
  range: AnalystPaymentRange
): RangeBoundary {
  const to =
    new Date();

  const settings: Record<
    AnalystPaymentRange,
    {
      durationMs: number;
      bucket:
        AnalystPaymentBucket;
      bucketCount: number;
    }
  > = {
    "24h": {
      durationMs:
        24 * 60 * 60_000,
      bucket:
        "hour",
      bucketCount:
        24,
    },
    "7d": {
      durationMs:
        7 * 24 * 60 * 60_000,
      bucket:
        "day",
      bucketCount:
        7,
    },
    "30d": {
      durationMs:
        30 * 24 * 60 * 60_000,
      bucket:
        "day",
      bucketCount:
        30,
    },
    "90d": {
      durationMs:
        90 * 24 * 60 * 60_000,
      bucket:
        "day",
      bucketCount:
        90,
    },
  };

  const setting =
    settings[range];

  const from =
    new Date(
      to.getTime() -
        setting.durationMs
    );

  return {
    from,
    to,
    previousFrom:
      new Date(
        from.getTime() -
          setting.durationMs
      ),
    bucket:
      setting.bucket,
    bucketCount:
      setting.bucketCount,
  };
}

function normalizeBucket(
  date: Date,
  bucket:
    AnalystPaymentBucket
): Date {
  const normalized =
    new Date(date);

  if (bucket === "hour") {
    normalized.setUTCMinutes(
      0,
      0,
      0
    );
  } else {
    normalized.setUTCHours(
      0,
      0,
      0,
      0
    );
  }

  return normalized;
}

function buildTrend(
  rows: TrendRow[],
  boundary: RangeBoundary
): AnalystPaymentAnalyticsData["trend"] {
  const rowMap =
    new Map<
      number,
      TrendRow
    >();

  for (const row of rows) {
    const timestamp =
      new Date(
        row._id
      ).getTime();

    if (
      Number.isFinite(timestamp)
    ) {
      rowMap.set(
        timestamp,
        row
      );
    }
  }

  const lastBucket =
    normalizeBucket(
      boundary.to,
      boundary.bucket
    );

  const intervalMs =
    boundary.bucket === "hour"
      ? 60 * 60_000
      : 24 * 60 * 60_000;

  const result:
    AnalystPaymentAnalyticsData["trend"] =
    [];

  for (
    let index =
      boundary.bucketCount - 1;
    index >= 0;
    index -= 1
  ) {
    const date =
      new Date(
        lastBucket.getTime() -
          index * intervalMs
      );

    const row =
      rowMap.get(
        date.getTime()
      );

    const attemptCount =
      finiteNumber(
        row?.attemptCount
      );

    const completedCount =
      finiteNumber(
        row?.completedCount
      );

    result.push({
      bucket:
        date.toISOString(),
      attemptCount,
      completedCount,
      failedCount:
        finiteNumber(
          row?.failedCount
        ),
      pendingCount:
        finiteNumber(
          row?.pendingCount
        ),
      volumeMinor:
        finiteNumber(
          row?.volumeMinor
        ),
      successRate:
        percentage(
          completedCount,
          attemptCount
        ),
    });
  }

  return result;
}

/* =========================================================
   PIPELINE HELPERS
========================================================= */

function summaryPipeline(
  match:
    Record<string, unknown>
): mongoose.PipelineStage.FacetPipelineStage[] {
  return [
    {
      $match:
        match,
    },
    {
      $group: {
        _id:
          null,
        attemptCount: {
          $sum:
            1,
        },
        completedCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  COMPLETED_STATUS,
                ],
              },
              1,
              0,
            ],
          },
        },
        failedCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "failed",
                ],
              },
              1,
              0,
            ],
          },
        },
        pendingCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  PENDING_STATUSES,
                ],
              },
              1,
              0,
            ],
          },
        },
        cancelledCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "cancelled",
                ],
              },
              1,
              0,
            ],
          },
        },
        expiredCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "expired",
                ],
              },
              1,
              0,
            ],
          },
        },
        paymentVolumeMinor: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  COMPLETED_STATUS,
                ],
              },
              "$amountMinorValue",
              0,
            ],
          },
        },
        feeRevenueMinor: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  COMPLETED_STATUS,
                ],
              },
              "$feeMinorValue",
              0,
            ],
          },
        },
        netVolumeMinor: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  COMPLETED_STATUS,
                ],
              },
              "$netMinorValue",
              0,
            ],
          },
        },
        averagePaymentMinor: {
          $avg: {
            $cond: [
              {
                $eq: [
                  "$status",
                  COMPLETED_STATUS,
                ],
              },
              "$amountMinorValue",
              null,
            ],
          },
        },
        averageCompletionSeconds: {
          $avg: {
            $cond: [
              {
                $and: [
                  {
                    $eq: [
                      "$status",
                      COMPLETED_STATUS,
                    ],
                  },
                  {
                    $ne: [
                      "$completedAt",
                      null,
                    ],
                  },
                ],
              },
              "$completionSeconds",
              null,
            ],
          },
        },
      },
    },
  ];
}

function normalizeSummary(
  row: SummaryRow | undefined
): SummaryRow {
  return {
    attemptCount:
      finiteNumber(
        row?.attemptCount
      ),
    completedCount:
      finiteNumber(
        row?.completedCount
      ),
    failedCount:
      finiteNumber(
        row?.failedCount
      ),
    pendingCount:
      finiteNumber(
        row?.pendingCount
      ),
    cancelledCount:
      finiteNumber(
        row?.cancelledCount
      ),
    expiredCount:
      finiteNumber(
        row?.expiredCount
      ),
    paymentVolumeMinor:
      finiteNumber(
        row?.paymentVolumeMinor
      ),
    feeRevenueMinor:
      finiteNumber(
        row?.feeRevenueMinor
      ),
    netVolumeMinor:
      finiteNumber(
        row?.netVolumeMinor
      ),
    averagePaymentMinor:
      finiteNumber(
        row?.averagePaymentMinor
      ),
    averageCompletionSeconds:
      round(
        finiteNumber(
          row?.averageCompletionSeconds
        )
      ),
  };
}

/* =========================================================
   INSIGHTS
========================================================= */

function createInsights(
  input: {
    current: SummaryRow;
    successRate: number;
    failureRate: number;
    riskBlockedCount: number;
    providers:
      AnalystPaymentAnalyticsData["providers"];
  }
): AnalystPaymentInsight[] {
  const insights:
    AnalystPaymentInsight[] =
    [];

  if (
    input.current.attemptCount ===
    0
  ) {
    return [
      {
        id:
          "payments-no-activity",
        severity:
          "info",
        title:
          "No payment activity for this filter",
        description:
          "The selected range, environment, currency, provider, status, and source contain no recorded payment attempt.",
        evidence:
          "0 payment attempts",
        recommendedReview:
          "Confirm the selected filters or verify that merchant integrations are creating payment records.",
      },
    ];
  }

  if (
    input.failureRate >=
    25
  ) {
    insights.push({
      id:
        "payments-critical-failure-rate",
      severity:
        "critical",
      title:
        "Payment failure rate is critical",
      description:
        "At least one quarter of recorded payment attempts failed in the selected period.",
      evidence:
        `${input.failureRate.toFixed(2)}% failure rate`,
      recommendedReview:
        "Review the failure-code and provider breakdowns before escalating the affected integration.",
    });
  } else if (
    input.failureRate >=
    10
  ) {
    insights.push({
      id:
        "payments-elevated-failure-rate",
      severity:
        "warning",
      title:
        "Payment failures need review",
      description:
        "The deterministic failure-rate threshold of 10% was exceeded.",
      evidence:
        `${input.failureRate.toFixed(2)}% failure rate`,
      recommendedReview:
        "Compare providers and failure reasons to isolate the source of the decline.",
    });
  }

  if (
    input.riskBlockedCount >
    0
  ) {
    insights.push({
      id:
        "payments-risk-blocked",
      severity:
        "warning",
      title:
        "Risk controls blocked payments",
      description:
        "One or more payment attempts were rejected by recorded risk controls.",
      evidence:
        `${input.riskBlockedCount} risk-blocked payments`,
      recommendedReview:
        "Inspect authorized risk telemetry without changing rules from the analyst workspace.",
    });
  }

  const weakProvider =
    input.providers.find(
      (provider) =>
        provider.attemptCount >=
          5 &&
        provider.successRate <
          70
    );

  if (weakProvider) {
    insights.push({
      id:
        `payments-provider-${weakProvider.provider}`,
      severity:
        weakProvider.successRate < 50
          ? "critical"
          : "warning",
      title:
        "A provider is underperforming",
      description:
        `${weakProvider.provider} is below the 70% provider-health threshold with a meaningful attempt sample.`,
      evidence:
        `${weakProvider.successRate.toFixed(2)}% success across ${weakProvider.attemptCount} attempts`,
      recommendedReview:
        "Check provider responses and recent failure codes for this integration.",
    });
  }

  if (
    input.current.averageCompletionSeconds >
    30
  ) {
    insights.push({
      id:
        "payments-slow-completion",
      severity:
        "warning",
      title:
        "Payment completion is slow",
      description:
        "Average completed-payment latency exceeded the deterministic 30-second attention threshold.",
      evidence:
        `${input.current.averageCompletionSeconds.toFixed(2)} seconds average`,
      recommendedReview:
        "Compare provider latency and inspect slow callback or capture paths.",
    });
  }

  if (
    insights.length === 0
  ) {
    insights.push({
      id:
        "payments-healthy",
      severity:
        "positive",
      title:
        "Payment performance is within thresholds",
      description:
        "No deterministic payment-performance threshold was breached for the current filter.",
      evidence:
        `${input.successRate.toFixed(2)}% success rate`,
      recommendedReview:
        "Continue monitoring provider performance and failure trends.",
    });
  }

  return insights;
}

/* =========================================================
   ANALYTICS SERVICE
========================================================= */

export async function getAnalystPaymentAnalytics(
  filters: AnalystPaymentFilters
): Promise<AnalystPaymentAnalyticsData> {
  const boundary =
    getRangeBoundary(
      filters.range
    );

  const baseMatch:
    Record<string, unknown> = {
      createdAt: {
        $gte:
          boundary.previousFrom,
        $lte:
          boundary.to,
      },
      currency:
        filters.currency,
    };

  if (
    filters.mode !== "all"
  ) {
    baseMatch.mode =
      filters.mode;
  }

  if (filters.provider) {
    baseMatch.provider =
      filters.provider;
  }

  if (
    filters.status !== "all"
  ) {
    baseMatch.status =
      filters.status;
  }

  if (
    filters.source !== "all"
  ) {
    baseMatch.sourceType =
      filters.source;
  }

  const currentMatch = {
    createdAt: {
      $gte:
        boundary.from,
      $lte:
        boundary.to,
    },
  };

  const previousMatch = {
    createdAt: {
      $gte:
        boundary.previousFrom,
      $lt:
        boundary.from,
    },
  };

  const rows =
    await Payment.aggregate<PaymentAnalyticsAggregate>([
      {
        $match:
          baseMatch,
      },
      {
        $addFields: {
          amountMinorValue: {
            $round: [
              {
                $multiply: [
                  {
                    $convert: {
                      input:
                        "$amount",
                      to:
                        "double",
                      onError:
                        0,
                      onNull:
                        0,
                    },
                  },
                  100,
                ],
              },
              0,
            ],
          },
          feeMinorValue: {
            $round: [
              {
                $multiply: [
                  {
                    $convert: {
                      input:
                        "$feeAmount",
                      to:
                        "double",
                      onError:
                        0,
                      onNull:
                        0,
                    },
                  },
                  100,
                ],
              },
              0,
            ],
          },
          netMinorValue: {
            $round: [
              {
                $multiply: [
                  {
                    $convert: {
                      input: {
                        $ifNull: [
                          "$netAmount",
                          "$amount",
                        ],
                      },
                      to:
                        "double",
                      onError:
                        0,
                      onNull:
                        0,
                    },
                  },
                  100,
                ],
              },
              0,
            ],
          },
          completionSeconds: {
            $cond: [
              {
                $and: [
                  {
                    $ne: [
                      "$completedAt",
                      null,
                    ],
                  },
                  {
                    $ne: [
                      "$createdAt",
                      null,
                    ],
                  },
                ],
              },
              {
                $divide: [
                  {
                    $subtract: [
                      "$completedAt",
                      "$createdAt",
                    ],
                  },
                  1000,
                ],
              },
              null,
            ],
          },
        },
      },
      {
        $facet: {
          current:
            summaryPipeline(
              currentMatch
            ),
          previous:
            summaryPipeline(
              previousMatch
            ),
          trend: [
            {
              $match:
                currentMatch,
            },
            {
              $group: {
                _id: {
                  $dateTrunc: {
                    date:
                      "$createdAt",
                    unit:
                      boundary.bucket,
                    timezone:
                      "UTC",
                  },
                },
                attemptCount: {
                  $sum:
                    1,
                },
                completedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                failedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          "failed",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                pendingCount: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          "$status",
                          PENDING_STATUSES,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                volumeMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
            {
              $sort: {
                _id:
                  1,
              },
            },
          ],
          statuses: [
            {
              $match:
                currentMatch,
            },
            {
              $group: {
                _id:
                  "$status",
                count: {
                  $sum:
                    1,
                },
                volumeMinor: {
                  $sum:
                    "$amountMinorValue",
                },
              },
            },
            {
              $sort: {
                count:
                  -1,
              },
            },
          ],
          providers: [
            {
              $match:
                currentMatch,
            },
            {
              $group: {
                _id: {
                  $ifNull: [
                    "$provider",
                    "unknown",
                  ],
                },
                attemptCount: {
                  $sum:
                    1,
                },
                completedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                failedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          "failed",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                pendingCount: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          "$status",
                          PENDING_STATUSES,
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                volumeMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
                feeRevenueMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      "$feeMinorValue",
                      0,
                    ],
                  },
                },
                averageCompletionSeconds: {
                  $avg: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      "$completionSeconds",
                      null,
                    ],
                  },
                },
              },
            },
            {
              $sort: {
                attemptCount:
                  -1,
              },
            },
          ],
          sources: [
            {
              $match:
                currentMatch,
            },
            {
              $group: {
                _id: {
                  $ifNull: [
                    "$sourceType",
                    "unknown",
                  ],
                },
                count: {
                  $sum:
                    1,
                },
                volumeMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
            {
              $sort: {
                count:
                  -1,
              },
            },
          ],
          modes: [
            {
              $match:
                currentMatch,
            },
            {
              $group: {
                _id:
                  "$mode",
                count: {
                  $sum:
                    1,
                },
                volumeMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
            {
              $sort: {
                count:
                  -1,
              },
            },
          ],
          failureReasons: [
            {
              $match: {
                ...currentMatch,
                status:
                  "failed",
              },
            },
            {
              $group: {
                _id: {
                  $ifNull: [
                    "$failureCode",
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
          ],
          latency: [
            {
              $match: {
                ...currentMatch,
                status:
                  COMPLETED_STATUS,
                completedAt: {
                  $ne:
                    null,
                },
              },
            },
            {
              $bucket: {
                groupBy:
                  "$completionSeconds",
                boundaries: [
                  0,
                  5,
                  15,
                  30,
                  60,
                  31_536_000,
                ],
                default:
                  "unknown",
                output: {
                  count: {
                    $sum:
                      1,
                  },
                },
              },
            },
          ],
        },
      },
    ]);

  const result =
    rows[0];

  const current =
    normalizeSummary(
      result?.current[0]
    );

  const previous =
    normalizeSummary(
      result?.previous[0]
    );

  const currentSuccessRate =
    percentage(
      current.completedCount,
      current.attemptCount
    );

  const previousSuccessRate =
    percentage(
      previous.completedCount,
      previous.attemptCount
    );

  const currentFailureRate =
    percentage(
      current.failedCount,
      current.attemptCount
    );

  const previousFailureRate =
    percentage(
      previous.failedCount,
      previous.attemptCount
    );

  const providers =
    (
      result?.providers ??
      []
    ).map(
      (row) => {
        const attemptCount =
          finiteNumber(
            row.attemptCount
          );

        const successRate =
          percentage(
            finiteNumber(
              row.completedCount
            ),
            attemptCount
          );

        return {
          provider:
            row._id ||
            "unknown",
          attemptCount,
          completedCount:
            finiteNumber(
              row.completedCount
            ),
          failedCount:
            finiteNumber(
              row.failedCount
            ),
          pendingCount:
            finiteNumber(
              row.pendingCount
            ),
          volumeMinor:
            finiteNumber(
              row.volumeMinor
            ),
          feeRevenueMinor:
            finiteNumber(
              row.feeRevenueMinor
            ),
          successRate,
          averageCompletionSeconds:
            round(
              finiteNumber(
                row.averageCompletionSeconds
              )
            ),
          health:
            successRate >= 85
              ? "healthy" as const
              : successRate >= 65
                ? "attention" as const
                : "critical" as const,
        };
      }
    );

  const totalFailures =
    (
      result?.failureReasons ??
      []
    ).reduce(
      (
        total,
        row
      ) =>
        total +
        finiteNumber(
          row.count
        ),
      0
    );

  const latencyLabels:
    Record<string, string> = {
      "0":
        "Under 5 seconds",
      "5":
        "5–15 seconds",
      "15":
        "15–30 seconds",
      "30":
        "30–60 seconds",
      "60":
        "Over 60 seconds",
      unknown:
        "Unknown",
    };

  const latencyTotal =
    (
      result?.latency ?? []
    ).reduce(
      (
        total,
        row
      ) =>
        total +
        finiteNumber(
          row.count
        ),
      0
    );

  const riskBlockedCount =
    (
      result?.failureReasons ??
      []
    ).find(
      (row) =>
        row._id ===
        "risk_blocked"
    )?.count ?? 0;

  const toBreakdown = (
    rowsToMap:
      BreakdownRow[],
    key:
      "status" |
      "source" |
      "mode"
  ) => {
    return rowsToMap.map(
      (row) => ({
        [key]:
          row._id ||
          "unknown",
        count:
          finiteNumber(
            row.count
          ),
        percentage:
          percentage(
            finiteNumber(
              row.count
            ),
            current.attemptCount
          ),
        volumeMinor:
          finiteNumber(
            row.volumeMinor
          ),
      })
    );
  };

  const statuses =
    toBreakdown(
      result?.statuses ?? [],
      "status"
    ) as AnalystPaymentAnalyticsData["statuses"];

  const sources =
    toBreakdown(
      result?.sources ?? [],
      "source"
    ) as AnalystPaymentAnalyticsData["sources"];

  const modes =
    toBreakdown(
      result?.modes ?? [],
      "mode"
    ) as AnalystPaymentAnalyticsData["modes"];

  return {
    generatedAt:
      new Date().toISOString(),
    source:
      "mongodb_payment_collection",
    intelligenceEngine: {
      type:
        "deterministic_rules",
      paidProviderUsed:
        false,
      version:
        "payment-rules-v1",
    },
    filters: {
      ...filters,
      from:
        boundary.from.toISOString(),
      to:
        boundary.to.toISOString(),
      previousFrom:
        boundary.previousFrom.toISOString(),
      bucket:
        boundary.bucket,
    },
    metrics: {
      attemptCount:
        metric(
          current.attemptCount,
          previous.attemptCount
        ),
      completedCount:
        metric(
          current.completedCount,
          previous.completedCount
        ),
      failedCount:
        metric(
          current.failedCount,
          previous.failedCount
        ),
      paymentVolumeMinor:
        metric(
          current.paymentVolumeMinor,
          previous.paymentVolumeMinor
        ),
      feeRevenueMinor:
        metric(
          current.feeRevenueMinor,
          previous.feeRevenueMinor
        ),
      netVolumeMinor:
        metric(
          current.netVolumeMinor,
          previous.netVolumeMinor
        ),
      averagePaymentMinor:
        metric(
          current.averagePaymentMinor,
          previous.averagePaymentMinor
        ),
      successRate:
        metric(
          currentSuccessRate,
          previousSuccessRate
        ),
      failureRate:
        metric(
          currentFailureRate,
          previousFailureRate
        ),
      averageCompletionSeconds:
        metric(
          current.averageCompletionSeconds,
          previous.averageCompletionSeconds
        ),
    },
    operations: {
      pendingCount:
        current.pendingCount,
      cancelledCount:
        current.cancelledCount,
      expiredCount:
        current.expiredCount,
      riskBlockedCount:
        finiteNumber(
          riskBlockedCount
        ),
    },
    trend:
      buildTrend(
        result?.trend ?? [],
        boundary
      ),
    statuses,
    providers,
    sources,
    modes,
    failureReasons:
      (
        result?.failureReasons ??
        []
      ).map(
        (row) => ({
          code:
            row._id ||
            "unknown",
          count:
            finiteNumber(
              row.count
            ),
          percentage:
            percentage(
              finiteNumber(
                row.count
              ),
              totalFailures
            ),
        })
      ),
    latency:
      (
        result?.latency ??
        []
      ).map(
        (row) => ({
          key:
            String(
              row._id
            ),
          label:
            latencyLabels[
              String(row._id)
            ] ??
            "Unknown",
          count:
            finiteNumber(
              row.count
            ),
          percentage:
            percentage(
              finiteNumber(
                row.count
              ),
              latencyTotal
            ),
        })
      ),
    insights:
      createInsights({
        current,
        successRate:
          currentSuccessRate,
        failureRate:
          currentFailureRate,
        riskBlockedCount:
          finiteNumber(
            riskBlockedCount
          ),
        providers,
      }),
  };
}
