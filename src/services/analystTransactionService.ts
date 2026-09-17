import {
  Transaction,
} from "../models/Transaction.js";

import type {
  AnalystMetric,
  AnalystRange,
} from "../types/analystTypes.js";

/* =========================================================
   TYPES
========================================================= */

export type AnalystTransactionStatus =
  | "all"
  | "PENDING"
  | "COMPLETED"
  | "FAILED";

export type AnalystTransactionType =
  | "all"
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAW";

export type AnalystTransactionRisk =
  | "all"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface AnalystTransactionFilters {
  range:
    AnalystRange;

  currency:
    string;

  status:
    AnalystTransactionStatus;

  type:
    AnalystTransactionType;

  risk:
    AnalystTransactionRisk;
}

export interface AnalystTransactionInsight {
  id:
    string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "reliability"
    | "risk"
    | "backlog"
    | "mix"
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

export interface AnalystTransactionAnalyticsData {
  generatedAt:
    string;

  source:
    "mongodb_transaction_collection";

  privacy: {
    amountsDecrypted:
      false;

    referencesExposed:
      false;

    note:
      string;
  };

  filters: AnalystTransactionFilters & {
    from:
      string;

    to:
      string;

    previousFrom:
      string;

    previousTo:
      string;

    bucket:
      "hour"
      | "day";
  };

  metrics: {
    transactionCount:
      AnalystMetric;

    completedCount:
      AnalystMetric;

    failedCount:
      AnalystMetric;

    pendingCount:
      AnalystMetric;

    completionRate:
      AnalystMetric;

    failureRate:
      AnalystMetric;

    highRiskCount:
      AnalystMetric;

    highRiskRate:
      AnalystMetric;
  };

  operations: {
    criticalRiskCount:
      number;

    highRiskCount:
      number;

    unknownRiskCount:
      number;

    transactionsWithFailureCode:
      number;
  };

  trend: Array<{
    bucket:
      string;

    transactionCount:
      number;

    completedCount:
      number;

    failedCount:
      number;

    pendingCount:
      number;

    highRiskCount:
      number;

    completionRate:
      number;

    failureRate:
      number;
  }>;

  statuses: Array<{
    status:
      string;

    count:
      number;

    percentage:
      number;
  }>;

  types: Array<{
    type:
      string;

    count:
      number;

    percentage:
      number;
  }>;

  risks: Array<{
    risk:
      string;

    count:
      number;

    percentage:
      number;
  }>;

  failureReasons: Array<{
    code:
      string;

    count:
      number;

    percentage:
      number;
  }>;

  insights:
    AnalystTransactionInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface SummaryRow {
  transactionCount?:
    unknown;

  completedCount?:
    unknown;

  failedCount?:
    unknown;

  pendingCount?:
    unknown;

  highRiskCount?:
    unknown;

  criticalRiskCount?:
    unknown;

  unknownRiskCount?:
    unknown;

  transactionsWithFailureCode?:
    unknown;
}

interface BreakdownRow {
  _id?:
    unknown;

  count?:
    unknown;
}

interface TrendRow {
  _id?:
    unknown;

  transactionCount?:
    unknown;

  completedCount?:
    unknown;

  failedCount?:
    unknown;

  pendingCount?:
    unknown;

  highRiskCount?:
    unknown;
}

interface DateBoundary {
  from:
    Date;

  to:
    Date;

  previousFrom:
    Date;

  previousTo:
    Date;

  bucket:
    "hour"
    | "day";

  bucketCount:
    number;
}

/* =========================================================
   HELPERS
========================================================= */

function safeNumber(
  value:
    unknown
): number {
  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function safeInteger(
  value:
    unknown
): number {
  return Math.max(
    0,
    Math.round(
      safeNumber(
        value
      )
    )
  );
}

function round(
  value:
    number
): number {
  return Number(
    value.toFixed(
      2
    )
  );
}

function percentage(
  value:
    number,
  total:
    number
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return round(
    (
      value /
      total
    ) *
      100
  );
}

function changePercent(
  current:
    number,
  previous:
    number
): number | null {
  if (
    previous ===
    0
  ) {
    return current ===
      0
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
  current:
    number,
  previous:
    number
): AnalystMetric {
  return {
    value:
      round(
        current
      ),

    previousValue:
      round(
        previous
      ),

    changePercent:
      changePercent(
        current,
        previous
      ),
  };
}

/* =========================================================
   RANGE
========================================================= */

function getBoundary(
  range:
    AnalystRange
): DateBoundary {
  const to =
    new Date();

  const settings: Record<
    AnalystRange,
    {
      duration:
        number;

      bucket:
        "hour"
        | "day";

      bucketCount:
        number;
    }
  > = {
    "24h": {
      duration:
        24 *
        60 *
        60 *
        1000,

      bucket:
        "hour",

      bucketCount:
        24,
    },

    "7d": {
      duration:
        7 *
        24 *
        60 *
        60 *
        1000,

      bucket:
        "day",

      bucketCount:
        7,
    },

    "30d": {
      duration:
        30 *
        24 *
        60 *
        60 *
        1000,

      bucket:
        "day",

      bucketCount:
        30,
    },

    "90d": {
      duration:
        90 *
        24 *
        60 *
        60 *
        1000,

      bucket:
        "day",

      bucketCount:
        90,
    },
  };

  const config =
    settings[
      range
    ];

  const from =
    new Date(
      to.getTime() -
        config.duration
    );

  const previousTo =
    new Date(
      from
    );

  const previousFrom =
    new Date(
      previousTo.getTime() -
        config.duration
    );

  return {
    from,
    to,
    previousFrom,
    previousTo,

    bucket:
      config.bucket,

    bucketCount:
      config.bucketCount,
  };
}

/* =========================================================
   MATCH
========================================================= */

function createMatch(
  filters:
    AnalystTransactionFilters,
  from:
    Date,
  to:
    Date
): Record<
  string,
  unknown
> {
  const match:
    Record<
      string,
      unknown
    > = {
      createdAt: {
        $gte:
          from,

        $lt:
          to,
      },

      currency:
        filters.currency,
    };

  if (
    filters.status !==
    "all"
  ) {
    match.status =
      filters.status;
  }

  if (
    filters.type !==
    "all"
  ) {
    match.type =
      filters.type;
  }

  if (
    filters.risk !==
    "all"
  ) {
    match.riskScore =
      filters.risk;
  }

  return match;
}

/* =========================================================
   SUMMARY
========================================================= */

async function loadSummary(
  match:
    Record<
      string,
      unknown
    >
): Promise<SummaryRow> {
  const rows =
    await Transaction.aggregate<SummaryRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id:
              null,

            transactionCount: {
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
                    $in: [
                      "$riskScore",
                      [
                        "HIGH",
                        "CRITICAL",
                      ],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            criticalRiskCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$riskScore",
                      "CRITICAL",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            unknownRiskCount: {
              $sum: {
                $cond: [
                  {
                    $not: [
                      {
                        $in: [
                          "$riskScore",
                          [
                            "LOW",
                            "MEDIUM",
                            "HIGH",
                            "CRITICAL",
                          ],
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            transactionsWithFailureCode: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$status",
                          "FAILED",
                        ],
                      },

                      {
                        $or: [
                          {
                            $ne: [
                              "$failureCode",
                              null,
                            ],
                          },

                          {
                            $ne: [
                              "$failureReason",
                              null,
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]
    );

  return (
    rows[
      0
    ] ?? {}
  );
}

/* =========================================================
   BREAKDOWN
========================================================= */

async function loadBreakdown(
  match:
    Record<
      string,
      unknown
    >,
  field:
    "status"
    | "type"
    | "riskScore"
): Promise<
  BreakdownRow[]
> {
  return Transaction.aggregate<BreakdownRow>(
    [
      {
        $match:
          match,
      },

      {
        $group: {
          _id: {
            $ifNull: [
              `$${field}`,
              "UNKNOWN",
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
    ]
  );
}

/* =========================================================
   FAILURE REASONS
========================================================= */

async function loadFailureReasons(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  BreakdownRow[]
> {
  return Transaction.aggregate<BreakdownRow>(
    [
      {
        $match: {
          ...match,

          status:
            "FAILED",
        },
      },

      {
        $group: {
          _id: {
            $ifNull: [
              "$failureCode",

              {
                $ifNull: [
                  "$failureReason",
                  "UNKNOWN",
                ],
              },
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
}

/* =========================================================
   TREND
========================================================= */

async function loadTrend(
  match:
    Record<
      string,
      unknown
    >,
  boundary:
    DateBoundary
): Promise<
  AnalystTransactionAnalyticsData[
    "trend"
  ]
> {
  const format =
    boundary.bucket ===
    "hour"
      ? "%Y-%m-%dT%H:00:00.000Z"
      : "%Y-%m-%dT00:00:00.000Z";

  const rows =
    await Transaction.aggregate<TrendRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id: {
              $dateToString: {
                date:
                  "$createdAt",

                format,

                timezone:
                  "UTC",
              },
            },

            transactionCount: {
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
                    $in: [
                      "$riskScore",
                      [
                        "HIGH",
                        "CRITICAL",
                      ],
                    ],
                  },
                  1,
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
      ]
    );

  const map =
    new Map<
      string,
      TrendRow
    >();

  for (
    const row of
    rows
  ) {
    map.set(
      String(
        row._id
      ),
      row
    );
  }

  const current =
    new Date(
      boundary.to
    );

  if (
    boundary.bucket ===
    "hour"
  ) {
    current.setUTCMinutes(
      0,
      0,
      0
    );
  } else {
    current.setUTCHours(
      0,
      0,
      0,
      0
    );
  }

  const interval =
    boundary.bucket ===
    "hour"
      ? 60 *
        60 *
        1000
      : 24 *
        60 *
        60 *
        1000;

  const result:
    AnalystTransactionAnalyticsData[
      "trend"
    ] =
    [];

  for (
    let index =
      boundary.bucketCount -
      1;
    index >=
    0;
    index -=
    1
  ) {
    const date =
      new Date(
        current.getTime() -
          index *
            interval
      );

    const key =
      boundary.bucket ===
      "hour"
        ? `${date
            .toISOString()
            .slice(
              0,
              13
            )}:00:00.000Z`
        : `${date
            .toISOString()
            .slice(
              0,
              10
            )}T00:00:00.000Z`;

    const row =
      map.get(
        key
      );

    const total =
      safeInteger(
        row
          ?.transactionCount
      );

    const completed =
      safeInteger(
        row
          ?.completedCount
      );

    const failed =
      safeInteger(
        row
          ?.failedCount
      );

    result.push({
      bucket:
        key,

      transactionCount:
        total,

      completedCount:
        completed,

      failedCount:
        failed,

      pendingCount:
        safeInteger(
          row
            ?.pendingCount
        ),

      highRiskCount:
        safeInteger(
          row
            ?.highRiskCount
        ),

      completionRate:
        percentage(
          completed,
          total
        ),

      failureRate:
        percentage(
          failed,
          total
        ),
    });
  }

  return result;
}

/* =========================================================
   NORMALIZE BREAKDOWN
========================================================= */

function normalizeBreakdown(
  rows:
    BreakdownRow[],
  total:
    number
) {
  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.count
        );

      return {
        key:
          String(
            row._id ??
              "UNKNOWN"
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
   INSIGHTS
========================================================= */

function buildInsights(
  input: {
    total:
      number;

    completed:
      number;

    failed:
      number;

    pending:
      number;

    highRisk:
      number;

    previousTotal:
      number;

    previousFailed:
      number;

    types:
      Array<{
        key:
          string;

        count:
          number;

        percentage:
          number;
      }>;
  }
): AnalystTransactionInsight[] {
  const insights:
    AnalystTransactionInsight[] =
    [];

  const failureRate =
    percentage(
      input.failed,
      input.total
    );

  const previousFailureRate =
    percentage(
      input.previousFailed,
      input.previousTotal
    );

  const pendingRate =
    percentage(
      input.pending,
      input.total
    );

  const highRiskRate =
    percentage(
      input.highRisk,
      input.total
    );

  if (
    input.total ===
    0
  ) {
    insights.push({
      id:
        "no-transaction-data",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "No wallet transaction activity",

      description:
        "No wallet transactions matched the current analytics filters.",

      evidence:
        "0 matching transactions were found.",

      recommendedReview:
        "Adjust the period or filters, or continue monitoring for new activity.",
    });

    return insights;
  }

  if (
    failureRate >=
    15
  ) {
    insights.push({
      id:
        "transaction-failure-critical",

      severity:
        failureRate >=
        25
          ? "critical"
          : "high",

      category:
        "reliability",

      title:
        "Wallet transaction failures are elevated",

      description:
        "A material portion of matching wallet transactions failed.",

      evidence:
        `${input.failed} of ${input.total} transactions failed (${failureRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Review failure-code concentration and transaction-type patterns before escalating to operations.",
    });
  }

  if (
    highRiskRate >=
    5
  ) {
    insights.push({
      id:
        "transaction-high-risk-share",

      severity:
        highRiskRate >=
        10
          ? "critical"
          : "high",

      category:
        "risk",

      title:
        "High-risk transaction share requires review",

      description:
        "The selected transaction population contains an elevated share of HIGH or CRITICAL risk records.",

      evidence:
        `${input.highRisk} of ${input.total} transactions are high risk (${highRiskRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Inspect aggregate risk and transaction-type distribution without exposing encrypted financial values.",
    });
  }

  if (
    pendingRate >=
    20
  ) {
    insights.push({
      id:
        "transaction-pending-backlog",

      severity:
        pendingRate >=
        40
          ? "high"
          : "medium",

      category:
        "backlog",

      title:
        "Pending transaction backlog is elevated",

      description:
        "A significant share of wallet transactions remains pending.",

      evidence:
        `${input.pending} transactions are pending (${pendingRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare pending activity with transaction type and recent operational incidents.",
    });
  }

  if (
    previousFailureRate >
      0 &&
    failureRate <=
      previousFailureRate -
        5
  ) {
    insights.push({
      id:
        "transaction-reliability-improved",

      severity:
        "positive",

      category:
        "reliability",

      title:
        "Transaction reliability improved",

      description:
        "Failure rate is materially below the preceding equivalent period.",

      evidence:
        `Failure rate moved from ${previousFailureRate.toFixed(
          2
        )}% to ${failureRate.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Continue monitoring to confirm the improvement persists.",
    });
  }

  const dominantType =
    input.types.find(
      (
        item
      ) =>
        item.percentage >=
        75
    );

  if (
    dominantType
  ) {
    insights.push({
      id:
        "transaction-type-concentration",

      severity:
        "info",

      category:
        "mix",

      title:
        "Transaction activity is concentrated",

      description:
        "One transaction type represents most of the selected activity.",

      evidence:
        `${dominantType.key} represents ${dominantType.percentage.toFixed(
          2
        )}% of matching transactions.`,

      recommendedReview:
        "Compare the concentration with expected customer and wallet usage patterns.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "transaction-window-healthy",

      severity:
        "positive",

      category:
        "reliability",

      title:
        "Transaction activity is within current thresholds",

      description:
        "No significant reliability, backlog, or risk threshold was triggered.",

      evidence:
        `${input.total} matching transactions were evaluated.`,

      recommendedReview:
        "Continue monitoring the transaction trend and failure-code distribution.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystTransactionAnalytics(
  filters:
    AnalystTransactionFilters
): Promise<AnalystTransactionAnalyticsData> {
  const boundary =
    getBoundary(
      filters.range
    );

  const currentMatch =
    createMatch(
      filters,
      boundary.from,
      boundary.to
    );

  const previousMatch =
    createMatch(
      filters,
      boundary.previousFrom,
      boundary.previousTo
    );

  const [
    current,
    previous,
    statusRows,
    typeRows,
    riskRows,
    failureRows,
    trend,
  ] =
    await Promise.all([
      loadSummary(
        currentMatch
      ),

      loadSummary(
        previousMatch
      ),

      loadBreakdown(
        currentMatch,
        "status"
      ),

      loadBreakdown(
        currentMatch,
        "type"
      ),

      loadBreakdown(
        currentMatch,
        "riskScore"
      ),

      loadFailureReasons(
        currentMatch
      ),

      loadTrend(
        currentMatch,
        boundary
      ),
    ]);

  const total =
    safeInteger(
      current
        .transactionCount
    );

  const completed =
    safeInteger(
      current
        .completedCount
    );

  const failed =
    safeInteger(
      current
        .failedCount
    );

  const pending =
    safeInteger(
      current
        .pendingCount
    );

  const highRisk =
    safeInteger(
      current
        .highRiskCount
    );

  const previousTotal =
    safeInteger(
      previous
        .transactionCount
    );

  const previousCompleted =
    safeInteger(
      previous
        .completedCount
    );

  const previousFailed =
    safeInteger(
      previous
        .failedCount
    );

  const previousPending =
    safeInteger(
      previous
        .pendingCount
    );

  const previousHighRisk =
    safeInteger(
      previous
        .highRiskCount
    );

  const statuses =
    normalizeBreakdown(
      statusRows,
      total
    ).map(
      (
        item
      ) => ({
        status:
          item.key,

        count:
          item.count,

        percentage:
          item.percentage,
      })
    );

  const types =
    normalizeBreakdown(
      typeRows,
      total
    ).map(
      (
        item
      ) => ({
        type:
          item.key,

        count:
          item.count,

        percentage:
          item.percentage,
      })
    );

  const risks =
    normalizeBreakdown(
      riskRows,
      total
    ).map(
      (
        item
      ) => ({
        risk:
          item.key,

        count:
          item.count,

        percentage:
          item.percentage,
      })
    );

  const failedTotal =
    failureRows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        safeInteger(
          row.count
        ),
      0
    );

  const failureReasons =
    normalizeBreakdown(
      failureRows,
      failedTotal
    ).map(
      (
        item
      ) => ({
        code:
          item.key,

        count:
          item.count,

        percentage:
          item.percentage,
      })
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source:
      "mongodb_transaction_collection",

    privacy: {
      amountsDecrypted:
        false,

      referencesExposed:
        false,

      note:
        "Analyst transaction analytics uses aggregate metadata only. Encrypted transaction amounts and private references are not decrypted or exposed.",
    },

    filters: {
      ...filters,

      from:
        boundary.from
          .toISOString(),

      to:
        boundary.to
          .toISOString(),

      previousFrom:
        boundary.previousFrom
          .toISOString(),

      previousTo:
        boundary.previousTo
          .toISOString(),

      bucket:
        boundary.bucket,
    },

    metrics: {
      transactionCount:
        metric(
          total,
          previousTotal
        ),

      completedCount:
        metric(
          completed,
          previousCompleted
        ),

      failedCount:
        metric(
          failed,
          previousFailed
        ),

      pendingCount:
        metric(
          pending,
          previousPending
        ),

      completionRate:
        metric(
          percentage(
            completed,
            total
          ),
          percentage(
            previousCompleted,
            previousTotal
          )
        ),

      failureRate:
        metric(
          percentage(
            failed,
            total
          ),
          percentage(
            previousFailed,
            previousTotal
          )
        ),

      highRiskCount:
        metric(
          highRisk,
          previousHighRisk
        ),

      highRiskRate:
        metric(
          percentage(
            highRisk,
            total
          ),
          percentage(
            previousHighRisk,
            previousTotal
          )
        ),
    },

    operations: {
      criticalRiskCount:
        safeInteger(
          current
            .criticalRiskCount
        ),

      highRiskCount:
        highRisk,

      unknownRiskCount:
        safeInteger(
          current
            .unknownRiskCount
        ),

      transactionsWithFailureCode:
        safeInteger(
          current
            .transactionsWithFailureCode
        ),
    },

    trend,

    statuses,

    types,

    risks,

    failureReasons,

    insights:
      buildInsights({
        total,
        completed,
        failed,
        pending,
        highRisk,
        previousTotal,
        previousFailed,

        types:
          types.map(
            (
              item
            ) => ({
              key:
                item.type,

              count:
                item.count,

              percentage:
                item.percentage,
            })
          ),
      }),
  };
}