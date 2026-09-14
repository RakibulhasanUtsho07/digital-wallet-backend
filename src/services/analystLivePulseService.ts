import {
  Payment,
} from "../models/Payment.js";

import {
  Payout,
} from "../models/Payout.js";

import {
  Transaction,
} from "../models/Transaction.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type AnalystPulseMode =
  | "all"
  | "test"
  | "live";

export type AnalystPulseStatus =
  | "healthy"
  | "attention"
  | "critical";

export type AnalystPulseTrend =
  | "up"
  | "down"
  | "stable";

export interface AnalystLivePulseFilters {
  mode: AnalystPulseMode;
  currency: string;
}

export interface AnalystPulseWindow {
  minutes: 5 | 15 | 60;
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  volumeMinor: number;
  successRate: number;
  failureRate: number;
}

export interface AnalystPulseScore {
  key:
    | "growth"
    | "liquidity"
    | "transactions"
    | "security"
    | "risk";
  label: string;
  score: number;
  status: AnalystPulseStatus;
  trend: AnalystPulseTrend;
  basis: string;
}

export interface AnalystPulseAlert {
  id: string;
  severity:
    | "critical"
    | "warning"
    | "info"
    | "positive";
  title: string;
  description: string;
  metric: string;
}

export interface AnalystLivePulseData {
  generatedAt: string;
  refreshAfterSeconds: number;
  source: "mongodb_live_collections";
  calculationEngine: {
    type: "deterministic_rules";
    paidProviderUsed: false;
    version: string;
  };
  filters: AnalystLivePulseFilters;
  scopeNote: string;
  status: AnalystPulseStatus;
  windows: {
    last5Minutes: AnalystPulseWindow;
    last15Minutes: AnalystPulseWindow;
    last60Minutes: AnalystPulseWindow;
    previous60Minutes: AnalystPulseWindow;
  };
  comparison: {
    attemptChangePercent: number | null;
    volumeChangePercent: number | null;
    successRateChangePoints: number;
  };
  transactions: {
    last60Minutes: {
      count: number;
      completedCount: number;
      failedCount: number;
      pendingCount: number;
      highRiskCount: number;
      failureRate: number;
      highRiskRate: number;
    };
    previous60MinutesCount: number;
  };
  payouts: {
    included: boolean;
    pendingCount: number;
    processingCount: number;
    failedCount: number;
    pendingAmountMinor: number;
    processingAmountMinor: number;
    completedLast60Minutes: number;
    failedLast60Minutes: number;
  };
  queues: {
    stalePaymentCount: number;
  };
  modeTraffic: Array<{
    mode: "test" | "live";
    count: number;
    percentage: number;
  }>;
  providers: Array<{
    provider: string;
    attemptCount: number;
    completedCount: number;
    failedCount: number;
    volumeMinor: number;
    successRate: number;
    status: AnalystPulseStatus;
  }>;
  failureReasons: Array<{
    code: string;
    count: number;
    percentage: number;
  }>;
  timeline: Array<{
    bucket: string;
    attemptCount: number;
    completedCount: number;
    failedCount: number;
    volumeMinor: number;
  }>;
  scores: AnalystPulseScore[];
  alerts: AnalystPulseAlert[];
}

/* =========================================================
   INTERNAL AGGREGATION TYPES
========================================================= */

interface PaymentSummaryRow {
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  volumeMinor: number;
}

interface PaymentTimelineRow {
  _id: Date;
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  volumeMinor: number;
}

interface ProviderRow {
  _id: string;
  attemptCount: number;
  completedCount: number;
  failedCount: number;
  volumeMinor: number;
}

interface FailureReasonRow {
  _id: string;
  count: number;
}

interface ModeTrafficRow {
  _id: "test" | "live";
  count: number;
}

interface PaymentPulseAggregate {
  last5: PaymentSummaryRow[];
  last15: PaymentSummaryRow[];
  last60: PaymentSummaryRow[];
  previous60: PaymentSummaryRow[];
  timeline: PaymentTimelineRow[];
  providers: ProviderRow[];
  failureReasons: FailureReasonRow[];
  modes: ModeTrafficRow[];
}

interface TransactionSummaryRow {
  count: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  highRiskCount: number;
}

interface TransactionPulseAggregate {
  last60: TransactionSummaryRow[];
  previous60: Array<{
    count: number;
  }>;
}

interface PayoutPulseAggregate {
  backlog: Array<{
    pendingCount: number;
    processingCount: number;
    failedCount: number;
    pendingAmountMinor: number;
    processingAmountMinor: number;
  }>;
  recent: Array<{
    completedCount: number;
    failedCount: number;
  }>;
}

/* =========================================================
   CONSTANTS
========================================================= */

const COMPLETED_PAYMENT_STATUS =
  "completed";

const PENDING_PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "captured",
];

const REFRESH_AFTER_SECONDS =
  20;

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

function clamp(
  input: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      input
    )
  );
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

function scoreStatus(
  score: number
): AnalystPulseStatus {
  if (score >= 85) {
    return "healthy";
  }

  if (score >= 65) {
    return "attention";
  }

  return "critical";
}

function trendFromChange(
  change: number | null,
  inverse = false
): AnalystPulseTrend {
  if (
    change === null ||
    Math.abs(change) < 1
  ) {
    return "stable";
  }

  const rising =
    change > 0;

  if (inverse) {
    return rising
      ? "down"
      : "up";
  }

  return rising
    ? "up"
    : "down";
}

function createScore(
  input: Omit<
    AnalystPulseScore,
    "score" | "status"
  > & {
    score: number;
  }
): AnalystPulseScore {
  const normalizedScore =
    clamp(
      Math.round(
        input.score
      ),
      0,
      100
    );

  return {
    ...input,
    score:
      normalizedScore,
    status:
      scoreStatus(
        normalizedScore
      ),
  };
}

/* =========================================================
   PAYMENT HELPERS
========================================================= */

function paymentSummary(
  rows: PaymentSummaryRow[]
): PaymentSummaryRow {
  const row =
    rows[0];

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
    volumeMinor:
      finiteNumber(
        row?.volumeMinor
      ),
  };
}

function toWindow(
  minutes: 5 | 15 | 60,
  rows: PaymentSummaryRow[]
): AnalystPulseWindow {
  const summary =
    paymentSummary(rows);

  return {
    minutes,
    ...summary,
    successRate:
      percentage(
        summary.completedCount,
        summary.attemptCount
      ),
    failureRate:
      percentage(
        summary.failedCount,
        summary.attemptCount
      ),
  };
}

function startOfFiveMinuteBucket(
  input: Date
): Date {
  const date =
    new Date(input);

  date.setUTCSeconds(
    0,
    0
  );

  date.setUTCMinutes(
    Math.floor(
      date.getUTCMinutes() /
        5
    ) * 5
  );

  return date;
}

function buildTimeline(
  rows: PaymentTimelineRow[],
  now: Date
): AnalystLivePulseData["timeline"] {
  const rowMap =
    new Map<
      number,
      PaymentTimelineRow
    >();

  for (const row of rows) {
    const time =
      new Date(
        row._id
      ).getTime();

    if (
      Number.isFinite(time)
    ) {
      rowMap.set(
        time,
        row
      );
    }
  }

  const currentBucket =
    startOfFiveMinuteBucket(
      now
    );

  const timeline:
    AnalystLivePulseData["timeline"] =
    [];

  for (
    let index = 11;
    index >= 0;
    index -= 1
  ) {
    const bucket =
      new Date(
        currentBucket.getTime() -
          index * 5 * 60_000
      );

    const row =
      rowMap.get(
        bucket.getTime()
      );

    timeline.push({
      bucket:
        bucket.toISOString(),
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
      volumeMinor:
        finiteNumber(
          row?.volumeMinor
        ),
    });
  }

  return timeline;
}

/* =========================================================
   ALERTS
========================================================= */

function createAlerts(
  input: {
    last60:
      AnalystPulseWindow;
    stalePaymentCount:
      number;
    highRiskCount:
      number;
    highRiskRate:
      number;
    failedPayoutCount:
      number;
  }
): AnalystPulseAlert[] {
  const alerts:
    AnalystPulseAlert[] =
    [];

  if (
    input.last60.attemptCount ===
    0
  ) {
    alerts.push({
      id:
        "pulse-no-payment-traffic",
      severity:
        "info",
      title:
        "No payment traffic detected",
      description:
        "No gateway payment attempts were recorded during the last 60 minutes for the selected filters.",
      metric:
        "0 attempts / 60 min",
    });
  } else if (
    input.last60.failureRate >=
    25
  ) {
    alerts.push({
      id:
        "pulse-critical-failure-rate",
      severity:
        "critical",
      title:
        "Payment failure rate is critical",
      description:
        "At least one quarter of payment attempts failed during the last 60 minutes.",
      metric:
        `${input.last60.failureRate.toFixed(2)}% failure rate`,
    });
  } else if (
    input.last60.failureRate >=
    10
  ) {
    alerts.push({
      id:
        "pulse-elevated-failure-rate",
      severity:
        "warning",
      title:
        "Payment failures require review",
      description:
        "The current payment failure rate crossed the deterministic 10% attention threshold.",
      metric:
        `${input.last60.failureRate.toFixed(2)}% failure rate`,
    });
  }

  if (
    input.stalePaymentCount >
    0
  ) {
    alerts.push({
      id:
        "pulse-stale-payments",
      severity:
        input.stalePaymentCount >= 20
          ? "critical"
          : "warning",
      title:
        "Stale payments are waiting",
      description:
        "Payments still pending, authorized, or captured after 15 minutes may need provider reconciliation.",
      metric:
        `${input.stalePaymentCount} stale payments`,
    });
  }

  if (
    input.highRiskCount > 0
  ) {
    alerts.push({
      id:
        "pulse-high-risk-transactions",
      severity:
        input.highRiskRate >= 10
          ? "critical"
          : "warning",
      title:
        "High-risk wallet activity detected",
      description:
        "The read-only pulse found wallet transactions classified as HIGH risk in the last 60 minutes.",
      metric:
        `${input.highRiskCount} high-risk transactions`,
    });
  }

  if (
    input.failedPayoutCount > 0
  ) {
    alerts.push({
      id:
        "pulse-failed-payouts",
      severity:
        input.failedPayoutCount >= 10
          ? "critical"
          : "warning",
      title:
        "Failed payouts require reconciliation",
      description:
        "Failed payout records are present in the current currency scope.",
      metric:
        `${input.failedPayoutCount} failed payouts`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id:
        "pulse-healthy",
      severity:
        "positive",
      title:
        "No operational threshold breached",
      description:
        "The deterministic live checks did not detect a payment, payout, or risk threshold breach.",
      metric:
        "All checks within threshold",
    });
  }

  return alerts;
}

/* =========================================================
   LIVE PULSE SERVICE
========================================================= */

export async function getAnalystLivePulse(
  filters: AnalystLivePulseFilters
): Promise<AnalystLivePulseData> {
  const now =
    new Date();

  const fiveMinutesAgo =
    new Date(
      now.getTime() -
        5 * 60_000
    );

  const fifteenMinutesAgo =
    new Date(
      now.getTime() -
        15 * 60_000
    );

  const sixtyMinutesAgo =
    new Date(
      now.getTime() -
        60 * 60_000
    );

  const previousSixtyMinutesAgo =
    new Date(
      now.getTime() -
        120 * 60_000
    );

  const paymentMatch:
    Record<string, unknown> = {
      createdAt: {
        $gte:
          previousSixtyMinutesAgo,
        $lte:
          now,
      },
      currency:
        filters.currency,
    };

  if (
    filters.mode !== "all"
  ) {
    paymentMatch.mode =
      filters.mode;
  }

  const stalePaymentMatch:
    Record<string, unknown> = {
      createdAt: {
        $lt:
          fifteenMinutesAgo,
      },
      currency:
        filters.currency,
      status: {
        $in:
          PENDING_PAYMENT_STATUSES,
      },
    };

  if (
    filters.mode !== "all"
  ) {
    stalePaymentMatch.mode =
      filters.mode;
  }

  const transactionMatch = {
    createdAt: {
      $gte:
        previousSixtyMinutesAgo,
      $lte:
        now,
    },
    currency:
      filters.currency,
  };

  const paymentAggregationPromise =
    Payment.aggregate<PaymentPulseAggregate>([
      {
        $match:
          paymentMatch,
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
        },
      },
      {
        $facet: {
          last5: [
            {
              $match: {
                createdAt: {
                  $gte:
                    fiveMinutesAgo,
                },
              },
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
                          COMPLETED_PAYMENT_STATUS,
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
                          PENDING_PAYMENT_STATUSES,
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
                          COMPLETED_PAYMENT_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
          ],
          last15: [
            {
              $match: {
                createdAt: {
                  $gte:
                    fifteenMinutesAgo,
                },
              },
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
                          COMPLETED_PAYMENT_STATUS,
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
                          PENDING_PAYMENT_STATUSES,
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
                          COMPLETED_PAYMENT_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
          ],
          last60: [
            {
              $match: {
                createdAt: {
                  $gte:
                    sixtyMinutesAgo,
                },
              },
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
                          COMPLETED_PAYMENT_STATUS,
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
                          PENDING_PAYMENT_STATUSES,
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
                          COMPLETED_PAYMENT_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
          ],
          previous60: [
            {
              $match: {
                createdAt: {
                  $lt:
                    sixtyMinutesAgo,
                },
              },
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
                          COMPLETED_PAYMENT_STATUS,
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
                          PENDING_PAYMENT_STATUSES,
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
                          COMPLETED_PAYMENT_STATUS,
                        ],
                      },
                      "$amountMinorValue",
                      0,
                    ],
                  },
                },
              },
            },
          ],
          timeline: [
            {
              $match: {
                createdAt: {
                  $gte:
                    sixtyMinutesAgo,
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateTrunc: {
                    date:
                      "$createdAt",
                    unit:
                      "minute",
                    binSize:
                      5,
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
                          COMPLETED_PAYMENT_STATUS,
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
                volumeMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_PAYMENT_STATUS,
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
          providers: [
            {
              $match: {
                createdAt: {
                  $gte:
                    sixtyMinutesAgo,
                },
              },
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
                          COMPLETED_PAYMENT_STATUS,
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
                volumeMinor: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          COMPLETED_PAYMENT_STATUS,
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
                attemptCount:
                  -1,
              },
            },
          ],
          failureReasons: [
            {
              $match: {
                createdAt: {
                  $gte:
                    sixtyMinutesAgo,
                },
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
          modes: [
            {
              $match: {
                createdAt: {
                  $gte:
                    sixtyMinutesAgo,
                },
              },
            },
            {
              $group: {
                _id:
                  "$mode",
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
          ],
        },
      },
    ]);

  const transactionAggregationPromise =
    Transaction.aggregate<TransactionPulseAggregate>([
      {
        $match:
          transactionMatch,
      },
      {
        $facet: {
          last60: [
            {
              $match: {
                createdAt: {
                  $gte:
                    sixtyMinutesAgo,
                },
              },
            },
            {
              $group: {
                _id:
                  null,
                count: {
                  $sum:
                    1,
                },
                completedCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$status",
                          "COMPLETED",
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
                          "FAILED",
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
                        $eq: [
                          "$status",
                          "PENDING",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                highRiskCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$riskScore",
                          "HIGH",
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          previous60: [
            {
              $match: {
                createdAt: {
                  $lt:
                    sixtyMinutesAgo,
                },
              },
            },
            {
              $count:
                "count",
            },
          ],
        },
      },
    ]);

  const payoutAggregationPromise:
    Promise<PayoutPulseAggregate[]> =
    filters.mode === "test"
      ? Promise.resolve([])
      : Payout.aggregate<PayoutPulseAggregate>([
          {
            $match: {
              currency:
                filters.currency,
            },
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
            },
          },
          {
            $facet: {
              backlog: [
                {
                  $match: {
                    status: {
                      $in: [
                        "pending",
                        "processing",
                        "failed",
                      ],
                    },
                  },
                },
                {
                  $group: {
                    _id:
                      null,
                    pendingCount: {
                      $sum: {
                        $cond: [
                          {
                            $eq: [
                              "$status",
                              "pending",
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    processingCount: {
                      $sum: {
                        $cond: [
                          {
                            $eq: [
                              "$status",
                              "processing",
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
                    pendingAmountMinor: {
                      $sum: {
                        $cond: [
                          {
                            $eq: [
                              "$status",
                              "pending",
                            ],
                          },
                          "$amountMinorValue",
                          0,
                        ],
                      },
                    },
                    processingAmountMinor: {
                      $sum: {
                        $cond: [
                          {
                            $eq: [
                              "$status",
                              "processing",
                            ],
                          },
                          "$amountMinorValue",
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              recent: [
                {
                  $match: {
                    createdAt: {
                      $gte:
                        sixtyMinutesAgo,
                      $lte:
                        now,
                    },
                  },
                },
                {
                  $group: {
                    _id:
                      null,
                    completedCount: {
                      $sum: {
                        $cond: [
                          {
                            $eq: [
                              "$status",
                              "completed",
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
                  },
                },
              ],
            },
          },
        ]);

  const [
    paymentRows,
    transactionRows,
    payoutRows,
    stalePaymentCount,
  ] = await Promise.all([
    paymentAggregationPromise,
    transactionAggregationPromise,
    payoutAggregationPromise,
    Payment.countDocuments(
      stalePaymentMatch
    ),
  ]);

  const paymentResult =
    paymentRows[0];

  const last5 =
    toWindow(
      5,
      paymentResult?.last5 ??
        []
    );

  const last15 =
    toWindow(
      15,
      paymentResult?.last15 ??
        []
    );

  const last60 =
    toWindow(
      60,
      paymentResult?.last60 ??
        []
    );

  const previous60 =
    toWindow(
      60,
      paymentResult?.previous60 ??
        []
    );

  const attemptChange =
    changePercent(
      last60.attemptCount,
      previous60.attemptCount
    );

  const volumeChange =
    changePercent(
      last60.volumeMinor,
      previous60.volumeMinor
    );

  const transactionResult =
    transactionRows[0];

  const transactionSummary =
    transactionResult?.last60[0];

  const transactionCount =
    finiteNumber(
      transactionSummary?.count
    );

  const transactionFailedCount =
    finiteNumber(
      transactionSummary?.failedCount
    );

  const highRiskCount =
    finiteNumber(
      transactionSummary?.highRiskCount
    );

  const transactionFailureRate =
    percentage(
      transactionFailedCount,
      transactionCount
    );

  const highRiskRate =
    percentage(
      highRiskCount,
      transactionCount
    );

  const payoutResult =
    payoutRows[0];

  const payoutBacklog =
    payoutResult?.backlog[0];

  const payoutRecent =
    payoutResult?.recent[0];

  const pendingPayoutCount =
    finiteNumber(
      payoutBacklog?.pendingCount
    );

  const processingPayoutCount =
    finiteNumber(
      payoutBacklog?.processingCount
    );

  const failedPayoutCount =
    finiteNumber(
      payoutBacklog?.failedCount
    );

  const recentCompletedPayouts =
    finiteNumber(
      payoutRecent?.completedCount
    );

  const recentFailedPayouts =
    finiteNumber(
      payoutRecent?.failedCount
    );

  const payoutRecentTotal =
    recentCompletedPayouts +
    recentFailedPayouts;

  const payoutFailureRate =
    percentage(
      recentFailedPayouts,
      payoutRecentTotal
    );

  const riskBlockedCount =
    (paymentResult?.failureReasons ?? [])
      .find(
        (row) =>
          row._id ===
          "risk_blocked"
      )?.count ?? 0;

  const riskBlockedRate =
    percentage(
      riskBlockedCount,
      last60.attemptCount
    );

  const growthScore =
    50 +
    clamp(
      attemptChange ?? 0,
      -50,
      50
    ) * 0.35 +
    clamp(
      volumeChange ?? 0,
      -50,
      50
    ) * 0.15;

  const liquidityScore =
    filters.mode === "test"
      ? 100
      : 100 -
        payoutFailureRate * 1.5 -
        Math.min(
          25,
          pendingPayoutCount * 2
        ) -
        Math.min(
          15,
          processingPayoutCount
        );

  const transactionScore =
    100 -
    last60.failureRate * 2 -
    percentage(
      last60.pendingCount,
      last60.attemptCount
    ) * 0.5;

  const securityScore =
    100 -
    highRiskRate * 3 -
    riskBlockedRate * 3;

  const riskScore =
    100 -
    highRiskRate * 3 -
    last60.failureRate -
    Math.min(
      20,
      stalePaymentCount
    );

  const scores:
    AnalystPulseScore[] = [
      createScore({
        key:
          "growth",
        label:
          "Growth",
        score:
          growthScore,
        trend:
          trendFromChange(
            attemptChange
          ),
        basis:
          "Current 60-minute attempts and completed volume compared with the previous 60 minutes.",
      }),
      createScore({
        key:
          "liquidity",
        label:
          "Liquidity",
        score:
          liquidityScore,
        trend:
          trendFromChange(
            payoutFailureRate,
            true
          ),
        basis:
          filters.mode === "test"
            ? "Payout health is not included in test-only mode."
            : "Payout completion, failure, pending, and processing queue health.",
      }),
      createScore({
        key:
          "transactions",
        label:
          "Transactions",
        score:
          transactionScore,
        trend:
          trendFromChange(
            last60.successRate -
              previous60.successRate
          ),
        basis:
          "Gateway payment success, failure, and in-progress ratios during the last 60 minutes.",
      }),
      createScore({
        key:
          "security",
        label:
          "Security",
        score:
          securityScore,
        trend:
          highRiskCount > 0 ||
          riskBlockedCount > 0
            ? "down"
            : "stable",
        basis:
          "HIGH-risk wallet transactions and risk-blocked gateway payments.",
      }),
      createScore({
        key:
          "risk",
        label:
          "Risk",
        score:
          riskScore,
        trend:
          highRiskCount > 0 ||
          stalePaymentCount > 0
            ? "down"
            : "stable",
        basis:
          "High-risk wallet activity, gateway failure rate, and stale payment queue exposure.",
      }),
    ];

  const overallScore =
    scores.reduce(
      (
        total,
        score
      ) =>
        total +
        score.score,
      0
    ) /
    scores.length;

  const modeRows =
    paymentResult?.modes ??
    [];

  const modeTotal =
    modeRows.reduce(
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

  const providers =
    (
      paymentResult?.providers ??
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
          volumeMinor:
            finiteNumber(
              row.volumeMinor
            ),
          successRate,
          status:
            scoreStatus(
              successRate
            ),
        };
      }
    );

  const failedPaymentTotal =
    (
      paymentResult?.failureReasons ??
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

  const alerts =
    createAlerts({
      last60,
      stalePaymentCount,
      highRiskCount,
      highRiskRate,
      failedPayoutCount,
    });

  const criticalAlert =
    alerts.some(
      (alert) =>
        alert.severity ===
        "critical"
    );

  const warningAlert =
    alerts.some(
      (alert) =>
        alert.severity ===
        "warning"
    );

  return {
    generatedAt:
      now.toISOString(),
    refreshAfterSeconds:
      REFRESH_AFTER_SECONDS,
    source:
      "mongodb_live_collections",
    calculationEngine: {
      type:
        "deterministic_rules",
      paidProviderUsed:
        false,
      version:
        "pulse-rules-v1",
    },
    filters,
    scopeNote:
      "Mode filters apply to gateway payments. Wallet transactions have no mode field. Payouts are excluded only in test-only mode.",
    status:
      criticalAlert ||
      overallScore < 65
        ? "critical"
        : warningAlert ||
            overallScore < 85
          ? "attention"
          : "healthy",
    windows: {
      last5Minutes:
        last5,
      last15Minutes:
        last15,
      last60Minutes:
        last60,
      previous60Minutes:
        previous60,
    },
    comparison: {
      attemptChangePercent:
        attemptChange,
      volumeChangePercent:
        volumeChange,
      successRateChangePoints:
        round(
          last60.successRate -
            previous60.successRate
        ),
    },
    transactions: {
      last60Minutes: {
        count:
          transactionCount,
        completedCount:
          finiteNumber(
            transactionSummary?.completedCount
          ),
        failedCount:
          transactionFailedCount,
        pendingCount:
          finiteNumber(
            transactionSummary?.pendingCount
          ),
        highRiskCount,
        failureRate:
          transactionFailureRate,
        highRiskRate,
      },
      previous60MinutesCount:
        finiteNumber(
          transactionResult
            ?.previous60[0]
            ?.count
        ),
    },
    payouts: {
      included:
        filters.mode !== "test",
      pendingCount:
        pendingPayoutCount,
      processingCount:
        processingPayoutCount,
      failedCount:
        failedPayoutCount,
      pendingAmountMinor:
        finiteNumber(
          payoutBacklog
            ?.pendingAmountMinor
        ),
      processingAmountMinor:
        finiteNumber(
          payoutBacklog
            ?.processingAmountMinor
        ),
      completedLast60Minutes:
        recentCompletedPayouts,
      failedLast60Minutes:
        recentFailedPayouts,
    },
    queues: {
      stalePaymentCount,
    },
    modeTraffic:
      modeRows.map(
        (row) => ({
          mode:
            row._id,
          count:
            finiteNumber(
              row.count
            ),
          percentage:
            percentage(
              finiteNumber(
                row.count
              ),
              modeTotal
            ),
        })
      ),
    providers,
    failureReasons:
      (
        paymentResult
          ?.failureReasons ??
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
              failedPaymentTotal
            ),
        })
      ),
    timeline:
      buildTimeline(
        paymentResult
          ?.timeline ?? [],
        now
      ),
    scores,
    alerts,
  };
}

