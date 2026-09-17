import {
  Payment,
  type PaymentSourceType,
} from "../models/Payment.js";

import {
  Transaction,
} from "../models/Transaction.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
  AnalystSystemStatus,
} from "../types/analystTypes.js";

/* =========================================================
   TYPES
========================================================= */

export type AnalystRiskSource =
  | "all"
  | PaymentSourceType;

export interface AnalystRiskInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "gateway"
    | "transaction"
    | "provider"
    | "velocity"
    | "reliability"
    | "data_quality";

  title: string;

  description: string;

  evidence: string;

  recommendedReview: string;
}

export interface AnalystRiskAnalyticsData {
  generatedAt: string;

  source: {
    payments:
      "mongodb_payment_collection";

    transactions:
      "mongodb_transaction_collection";
  };

  intelligenceEngine: {
    type:
      "deterministic_rules";

    version:
      string;

    paidProviderUsed:
      false;
  };

  filters: {
    range:
      AnalystDateFilters["range"];

    mode:
      AnalystDateFilters["mode"];

    currency:
      string;

    provider:
      string;

    source:
      AnalystRiskSource;

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

  scopeNote: string;

  status:
    AnalystSystemStatus;

  metrics: {
    riskSignalCount:
      AnalystMetric;

    riskBlockedPayments:
      AnalystMetric;

    riskBlockedRate:
      AnalystMetric;

    highRiskTransactions:
      AnalystMetric;

    highRiskTransactionRate:
      AnalystMetric;

    failedPayments:
      AnalystMetric;

    failedTransactions:
      AnalystMetric;
  };

  operations: {
    gatewayPaymentAttempts:
      number;

    transactionAttempts:
      number;

    lowRiskTransactions:
      number;

    mediumRiskTransactions:
      number;

    highRiskTransactions:
      number;

    failedPayments:
      number;

    failedTransactions:
      number;
  };

  trend: Array<{
    bucket:
      string;

    riskBlockedPayments:
      number;

    highRiskTransactions:
      number;

    failedPayments:
      number;

    failedTransactions:
      number;

    totalRiskSignals:
      number;
  }>;

  transactionRisk: Array<{
    risk:
      string;

    count:
      number;

    percentage:
      number;
  }>;

  transactionTypes: Array<{
    type:
      string;

    count:
      number;

    highRiskCount:
      number;

    failedCount:
      number;

    highRiskRate:
      number;

    failureRate:
      number;
  }>;

  providers: Array<{
    provider:
      string;

    attemptCount:
      number;

    failedCount:
      number;

    riskBlockedCount:
      number;

    riskBlockedRate:
      number;

    failureRate:
      number;

    status:
      AnalystSystemStatus;
  }>;

  sources: Array<{
    source:
      string;

    attemptCount:
      number;

    riskBlockedCount:
      number;

    riskBlockedRate:
      number;
  }>;

  paymentFailureReasons: Array<{
    code:
      string;

    count:
      number;

    percentage:
      number;
  }>;

  insights:
    AnalystRiskInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface PaymentSummaryRow {
  attemptCount?:
    unknown;

  failedCount?:
    unknown;

  riskBlockedCount?:
    unknown;
}

interface TransactionSummaryRow {
  count?:
    unknown;

  failedCount?:
    unknown;

  lowRiskCount?:
    unknown;

  mediumRiskCount?:
    unknown;

  highRiskCount?:
    unknown;
}

interface ProviderRow {
  _id?:
    unknown;

  attemptCount?:
    unknown;

  failedCount?:
    unknown;

  riskBlockedCount?:
    unknown;
}

interface SourceRow {
  _id?:
    unknown;

  attemptCount?:
    unknown;

  riskBlockedCount?:
    unknown;
}

interface BreakdownRow {
  _id?:
    unknown;

  count?:
    unknown;
}

interface TransactionTypeRow {
  _id?:
    unknown;

  count?:
    unknown;

  highRiskCount?:
    unknown;

  failedCount?:
    unknown;
}

interface PaymentTrendRow {
  _id?:
    unknown;

  riskBlockedPayments?:
    unknown;

  failedPayments?:
    unknown;
}

interface TransactionTrendRow {
  _id?:
    unknown;

  highRiskTransactions?:
    unknown;

  failedTransactions?:
    unknown;
}

/* =========================================================
   HELPERS
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

function safeInteger(
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
    total <=
    0
  ) {
    return 0;
  }

  return round(
    (part / total) *
      100
  );
}

function changePercent(
  current: number,
  previous: number
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
      (current - previous) /
      Math.abs(previous)
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

function stringValue(
  value: unknown,
  fallback = "unknown"
): string {
  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    value !==
      undefined &&
    value !==
      null
  ) {
    const converted =
      String(value);

    if (
      converted.trim()
    ) {
      return converted;
    }
  }

  return fallback;
}

/* =========================================================
   PAYMENT MATCH
========================================================= */

function paymentMatch(
  filters:
    AnalystDateFilters,
  provider:
    string,
  source:
    AnalystRiskSource,
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
    filters.mode !==
    "all"
  ) {
    match.mode =
      filters.mode;
  }

  if (
    provider
  ) {
    match.provider =
      provider;
  }

  if (
    source !==
    "all"
  ) {
    match.sourceType =
      source;
  }

  return match;
}

/* =========================================================
   TRANSACTION MATCH

   Transaction currently has no Test/Live mode field.
========================================================= */

function transactionMatch(
  filters:
    AnalystDateFilters,
  from:
    Date,
  to:
    Date
): Record<
  string,
  unknown
> {
  return {
    createdAt: {
      $gte:
        from,

      $lt:
        to,
    },

    currency:
      filters.currency,
  };
}

/* =========================================================
   PAYMENT SUMMARY
========================================================= */

async function loadPaymentSummary(
  match:
    Record<
      string,
      unknown
    >
): Promise<{
  attemptCount:
    number;

  failedCount:
    number;

  riskBlockedCount:
    number;
}> {
  const rows =
    await Payment.aggregate<PaymentSummaryRow>(
      [
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

            riskBlockedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$status",
                          "failed",
                        ],
                      },

                      {
                        $eq: [
                          "$failureCode",
                          "risk_blocked",
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

  const row =
    rows[0];

  return {
    attemptCount:
      safeInteger(
        row?.attemptCount
      ),

    failedCount:
      safeInteger(
        row?.failedCount
      ),

    riskBlockedCount:
      safeInteger(
        row?.riskBlockedCount
      ),
  };
}

/* =========================================================
   TRANSACTION SUMMARY
========================================================= */

async function loadTransactionSummary(
  match:
    Record<
      string,
      unknown
    >
): Promise<{
  count:
    number;

  failedCount:
    number;

  lowRiskCount:
    number;

  mediumRiskCount:
    number;

  highRiskCount:
    number;
}> {
  const rows =
    await Transaction.aggregate<TransactionSummaryRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id:
              null,

            count: {
              $sum:
                1,
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

            lowRiskCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$riskScore",
                      "LOW",
                    ],
                  },

                  1,
                  0,
                ],
              },
            },

            mediumRiskCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$riskScore",
                      "MEDIUM",
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
      ]
    );

  const row =
    rows[0];

  return {
    count:
      safeInteger(
        row?.count
      ),

    failedCount:
      safeInteger(
        row?.failedCount
      ),

    lowRiskCount:
      safeInteger(
        row?.lowRiskCount
      ),

    mediumRiskCount:
      safeInteger(
        row?.mediumRiskCount
      ),

    highRiskCount:
      safeInteger(
        row?.highRiskCount
      ),
  };
}

/* =========================================================
   PROVIDER RISK
========================================================= */

async function loadProviderRisk(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRiskAnalyticsData[
    "providers"
  ]
> {
  const rows =
    await Payment.aggregate<ProviderRow>(
      [
        {
          $match:
            match,
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

            riskBlockedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$status",
                          "failed",
                        ],
                      },

                      {
                        $eq: [
                          "$failureCode",
                          "risk_blocked",
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

        {
          $sort: {
            attemptCount:
              -1,
          },
        },
      ]
    );

  return rows.map(
    (
      row
    ) => {
      const attempts =
        safeInteger(
          row.attemptCount
        );

      const failed =
        safeInteger(
          row.failedCount
        );

      const blocked =
        safeInteger(
          row.riskBlockedCount
        );

      const blockRate =
        percentage(
          blocked,
          attempts
        );

      const failureRate =
        percentage(
          failed,
          attempts
        );

      const status:
        AnalystSystemStatus =
        blockRate >=
          10 ||
        failureRate >=
          25
          ? "critical"
          : blockRate >=
              5 ||
            failureRate >=
              10
            ? "attention"
            : "healthy";

      return {
        provider:
          stringValue(
            row._id
          ),

        attemptCount:
          attempts,

        failedCount:
          failed,

        riskBlockedCount:
          blocked,

        riskBlockedRate:
          blockRate,

        failureRate,

        status,
      };
    }
  );
}

/* =========================================================
   SOURCE RISK
========================================================= */

async function loadSourceRisk(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRiskAnalyticsData[
    "sources"
  ]
> {
  const rows =
    await Payment.aggregate<SourceRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$sourceType",
                "unknown",
              ],
            },

            attemptCount: {
              $sum:
                1,
            },

            riskBlockedCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      {
                        $eq: [
                          "$status",
                          "failed",
                        ],
                      },

                      {
                        $eq: [
                          "$failureCode",
                          "risk_blocked",
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

        {
          $sort: {
            attemptCount:
              -1,
          },
        },
      ]
    );

  return rows.map(
    (
      row
    ) => {
      const attempts =
        safeInteger(
          row.attemptCount
        );

      const blocked =
        safeInteger(
          row.riskBlockedCount
        );

      return {
        source:
          stringValue(
            row._id
          ),

        attemptCount:
          attempts,

        riskBlockedCount:
          blocked,

        riskBlockedRate:
          percentage(
            blocked,
            attempts
          ),
      };
    }
  );
}

/* =========================================================
   PAYMENT FAILURE REASONS
========================================================= */

async function loadFailureReasons(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRiskAnalyticsData[
    "paymentFailureReasons"
  ]
> {
  const rows =
    await Payment.aggregate<BreakdownRow>(
      [
        {
          $match: {
            ...match,

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

        {
          $limit:
            10,
        },
      ]
    );

  const total =
    rows.reduce(
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

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.count
        );

      return {
        code:
          stringValue(
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
   TRANSACTION RISK DISTRIBUTION
========================================================= */

async function loadRiskDistribution(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRiskAnalyticsData[
    "transactionRisk"
  ]
> {
  const rows =
    await Transaction.aggregate<BreakdownRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$riskScore",
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

  const total =
    rows.reduce(
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

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.count
        );

      return {
        risk:
          stringValue(
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
   TRANSACTION TYPE RISK
========================================================= */

async function loadTransactionTypes(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRiskAnalyticsData[
    "transactionTypes"
  ]
> {
  const rows =
    await Transaction.aggregate<TransactionTypeRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id: {
              $ifNull: [
                "$type",
                "UNKNOWN",
              ],
            },

            count: {
              $sum:
                1,
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

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.count
        );

      const highRisk =
        safeInteger(
          row.highRiskCount
        );

      const failed =
        safeInteger(
          row.failedCount
        );

      return {
        type:
          stringValue(
            row._id
          ),

        count,

        highRiskCount:
          highRisk,

        failedCount:
          failed,

        highRiskRate:
          percentage(
            highRisk,
            count
          ),

        failureRate:
          percentage(
            failed,
            count
          ),
      };
    }
  );
}

/* =========================================================
   TREND HELPERS
========================================================= */

function bucketCount(
  range:
    AnalystDateFilters[
      "range"
    ]
): number {
  switch (range) {
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

  const interval =
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
    ) => {
      const date =
        new Date(
          end.getTime() -
            (
              count -
              1 -
              index
            ) *
              interval
        );

      return date.toISOString();
    }
  );
}

/* =========================================================
   PAYMENT TREND
========================================================= */

async function loadPaymentTrend(
  match:
    Record<
      string,
      unknown
    >,
  filters:
    AnalystDateFilters
): Promise<
  PaymentTrendRow[]
> {
  return Payment.aggregate<PaymentTrendRow>(
    [
      {
        $match:
          match,
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

          riskBlockedPayments: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$status",
                        "failed",
                      ],
                    },

                    {
                      $eq: [
                        "$failureCode",
                        "risk_blocked",
                      ],
                    },
                  ],
                },

                1,
                0,
              ],
            },
          },

          failedPayments: {
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

      {
        $sort: {
          _id:
            1,
        },
      },
    ]
  );
}

/* =========================================================
   TRANSACTION TREND
========================================================= */

async function loadTransactionTrend(
  match:
    Record<
      string,
      unknown
    >,
  filters:
    AnalystDateFilters
): Promise<
  TransactionTrendRow[]
> {
  return Transaction.aggregate<TransactionTrendRow>(
    [
      {
        $match:
          match,
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

          highRiskTransactions: {
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

          failedTransactions: {
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
}

/* =========================================================
   BUILD TREND
========================================================= */

function buildTrend(
  filters:
    AnalystDateFilters,
  payments:
    PaymentTrendRow[],
  transactions:
    TransactionTrendRow[]
): AnalystRiskAnalyticsData[
  "trend"
] {
  const paymentMap =
    new Map<
      string,
      PaymentTrendRow
    >();

  const transactionMap =
    new Map<
      string,
      TransactionTrendRow
    >();

  for (
    const row of
    payments
  ) {
    const date =
      new Date(
        String(row._id)
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      paymentMap.set(
        date.toISOString(),
        row
      );
    }
  }

  for (
    const row of
    transactions
  ) {
    const date =
      new Date(
        String(row._id)
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      transactionMap.set(
        date.toISOString(),
        row
      );
    }
  }

  return bucketKeys(
    filters
  ).map(
    (
      bucket
    ) => {
      const payment =
        paymentMap.get(
          bucket
        );

      const transaction =
        transactionMap.get(
          bucket
        );

      const riskBlockedPayments =
        safeInteger(
          payment
            ?.riskBlockedPayments
        );

      const highRiskTransactions =
        safeInteger(
          transaction
            ?.highRiskTransactions
        );

      return {
        bucket,

        riskBlockedPayments,

        highRiskTransactions,

        failedPayments:
          safeInteger(
            payment
              ?.failedPayments
          ),

        failedTransactions:
          safeInteger(
            transaction
              ?.failedTransactions
          ),

        totalRiskSignals:
          riskBlockedPayments +
          highRiskTransactions,
      };
    }
  );
}

/* =========================================================
   STATUS
========================================================= */

function calculateStatus(
  blockRate:
    number,
  highRiskRate:
    number,
  providers:
    AnalystRiskAnalyticsData[
      "providers"
    ]
): AnalystSystemStatus {
  if (
    blockRate >=
      10 ||
    highRiskRate >=
      10 ||
    providers.some(
      (
        provider
      ) =>
        provider.status ===
        "critical"
    )
  ) {
    return "critical";
  }

  if (
    blockRate >=
      3 ||
    highRiskRate >=
      5 ||
    providers.some(
      (
        provider
      ) =>
        provider.status ===
        "attention"
    )
  ) {
    return "attention";
  }

  return "healthy";
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildInsights(
  input: {
    currentPayment: {
      attemptCount:
        number;

      failedCount:
        number;

      riskBlockedCount:
        number;
    };

    previousPayment: {
      attemptCount:
        number;

      failedCount:
        number;

      riskBlockedCount:
        number;
    };

    currentTransaction: {
      count:
        number;

      failedCount:
        number;

      lowRiskCount:
        number;

      mediumRiskCount:
        number;

      highRiskCount:
        number;
    };

    previousTransaction: {
      count:
        number;

      failedCount:
        number;

      lowRiskCount:
        number;

      mediumRiskCount:
        number;

      highRiskCount:
        number;
    };

    providers:
      AnalystRiskAnalyticsData[
        "providers"
      ];
  }
): AnalystRiskInsight[] {
  const insights:
    AnalystRiskInsight[] =
    [];

  const blockRate =
    percentage(
      input.currentPayment
        .riskBlockedCount,
      input.currentPayment
        .attemptCount
    );

  const previousBlockRate =
    percentage(
      input.previousPayment
        .riskBlockedCount,
      input.previousPayment
        .attemptCount
    );

  const highRiskRate =
    percentage(
      input.currentTransaction
        .highRiskCount,
      input.currentTransaction
        .count
    );

  const mediumRiskRate =
    percentage(
      input.currentTransaction
        .mediumRiskCount,
      input.currentTransaction
        .count
    );

  const transactionFailureRate =
    percentage(
      input.currentTransaction
        .failedCount,
      input.currentTransaction
        .count
    );

  if (
    input.currentPayment
        .attemptCount >
      0 &&
    blockRate >=
      5
  ) {
    insights.push({
      id:
        "gateway-risk-block-rate",

      severity:
        blockRate >=
        10
          ? "critical"
          : "high",

      category:
        "gateway",

      title:
        "Gateway risk-block rate is elevated",

      description:
        "A meaningful portion of gateway payment attempts is being blocked by recorded risk controls.",

      evidence:
        `${input.currentPayment.riskBlockedCount} of ${input.currentPayment.attemptCount} payment attempts were risk blocked (${blockRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare provider and source-level risk-block rates before changing any risk rule.",
    });
  }

  if (
    input.currentTransaction
        .count >=
      10 &&
    highRiskRate >=
      5
  ) {
    insights.push({
      id:
        "high-risk-transaction-share",

      severity:
        highRiskRate >=
        10
          ? "critical"
          : "high",

      category:
        "transaction",

      title:
        "High-risk transaction share is elevated",

      description:
        "The HIGH risk classification represents a material share of platform transactions.",

      evidence:
        `${input.currentTransaction.highRiskCount} of ${input.currentTransaction.count} transactions are HIGH risk (${highRiskRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare transaction types and platform transfer-policy signals. Analysts must not approve or block transfers from this page.",
    });
  }

  if (
    input.currentTransaction
        .count >=
      10 &&
    mediumRiskRate >=
      25
  ) {
    insights.push({
      id:
        "medium-risk-concentration",

      severity:
        mediumRiskRate >=
        40
          ? "medium"
          : "info",

      category:
        "velocity",

      title:
        "Monitored transaction activity is concentrated",

      description:
        "A large portion of transactions is classified MEDIUM risk by current platform policy.",

      evidence:
        `${mediumRiskRate.toFixed(
          2
        )}% of transactions are MEDIUM risk.`,

      recommendedReview:
        "Review aggregate velocity and limit utilization patterns before adjusting platform policy thresholds.",
    });
  }

  if (
    input.currentTransaction
        .count >=
      10 &&
    transactionFailureRate >=
      10
  ) {
    insights.push({
      id:
        "risk-transaction-failures",

      severity:
        transactionFailureRate >=
        20
          ? "high"
          : "medium",

      category:
        "reliability",

      title:
        "Transaction failures are elevated",

      description:
        "Operational failures may overlap with elevated transaction-risk conditions.",

      evidence:
        `${input.currentTransaction.failedCount} of ${input.currentTransaction.count} transactions failed (${transactionFailureRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare failure codes and transaction types before interpreting failures as fraud.",
    });
  }

  const weakProvider =
    input.providers.find(
      (
        provider
      ) =>
        provider.attemptCount >=
          5 &&
        provider.riskBlockedRate >=
          5
    );

  if (
    weakProvider
  ) {
    insights.push({
      id:
        `provider-risk-${weakProvider.provider}`,

      severity:
        weakProvider.riskBlockedRate >=
        10
          ? "high"
          : "medium",

      category:
        "provider",

      title:
        "Risk blocks are concentrated in a provider",

      description:
        `${weakProvider.provider} has an elevated risk-block rate for the current filters.`,

      evidence:
        `${weakProvider.riskBlockedCount} of ${weakProvider.attemptCount} attempts were blocked (${weakProvider.riskBlockedRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare provider traffic mix and failure codes before escalating the integration.",
    });
  }

  if (
    previousBlockRate >
      0 &&
    blockRate >=
      previousBlockRate +
        5
  ) {
    insights.push({
      id:
        "risk-block-rate-increase",

      severity:
        blockRate >=
        previousBlockRate +
          10
          ? "high"
          : "medium",

      category:
        "gateway",

      title:
        "Gateway risk blocks increased",

      description:
        "The risk-block rate is materially higher than the preceding equivalent period.",

      evidence:
        `${previousBlockRate.toFixed(
          2
        )}% → ${blockRate.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Check whether the increase is concentrated by provider, source, or merchant traffic.",
    });
  }

  if (
    input.currentPayment
        .attemptCount >
      0 &&
    input.currentTransaction
        .count >
      0 &&
    blockRate <
      2 &&
    highRiskRate <
      2
  ) {
    insights.push({
      id:
        "risk-signals-controlled",

      severity:
        "positive",

      category:
        "gateway",

      title:
        "Current risk signals are controlled",

      description:
        "Gateway risk blocks and HIGH-risk transaction classifications remain below current monitoring thresholds.",

      evidence:
        `${blockRate.toFixed(
          2
        )}% gateway risk-block rate and ${highRiskRate.toFixed(
          2
        )}% HIGH-risk transaction share.`,

      recommendedReview:
        "Continue monitoring changes in provider, source, and transaction-type distributions.",
    });
  }

  if (
    input.currentPayment
        .attemptCount ===
      0 &&
    input.currentTransaction
        .count ===
      0
  ) {
    insights.push({
      id:
        "risk-no-activity",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "No risk telemetry for this window",

      description:
        "No gateway payment or platform transaction activity matched the selected filters.",

      evidence:
        "0 matching gateway payments and 0 matching transactions.",

      recommendedReview:
        "Adjust the period or filters and continue monitoring as real traffic is recorded.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "risk-no-material-anomaly",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "No material risk anomaly detected",

      description:
        "Current deterministic rules did not identify a strong risk signal in the selected period.",

      evidence:
        `${input.currentPayment.attemptCount} gateway payments and ${input.currentTransaction.count} transactions were evaluated.`,

      recommendedReview:
        "Continue monitoring. A dedicated FraudCase store can be introduced when the fraud-case workflow is implemented.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystRiskAnalytics(
  input: {
    filters:
      AnalystDateFilters;

    provider:
      string;

    source:
      AnalystRiskSource;
  }
): Promise<AnalystRiskAnalyticsData> {
  const {
    filters,
    provider,
    source,
  } = input;

  const currentPaymentMatch =
    paymentMatch(
      filters,
      provider,
      source,
      filters.from,
      filters.to
    );

  const previousPaymentMatch =
    paymentMatch(
      filters,
      provider,
      source,
      filters.previousFrom,
      filters.previousTo
    );

  const currentTransactionMatch =
    transactionMatch(
      filters,
      filters.from,
      filters.to
    );

  const previousTransactionMatch =
    transactionMatch(
      filters,
      filters.previousFrom,
      filters.previousTo
    );

  const [
    currentPayment,
    previousPayment,

    currentTransaction,
    previousTransaction,

    providers,
    sources,

    paymentFailureReasons,

    transactionRisk,
    transactionTypes,

    paymentTrend,
    transactionTrend,
  ] =
    await Promise.all([
      loadPaymentSummary(
        currentPaymentMatch
      ),

      loadPaymentSummary(
        previousPaymentMatch
      ),

      loadTransactionSummary(
        currentTransactionMatch
      ),

      loadTransactionSummary(
        previousTransactionMatch
      ),

      loadProviderRisk(
        currentPaymentMatch
      ),

      loadSourceRisk(
        currentPaymentMatch
      ),

      loadFailureReasons(
        currentPaymentMatch
      ),

      loadRiskDistribution(
        currentTransactionMatch
      ),

      loadTransactionTypes(
        currentTransactionMatch
      ),

      loadPaymentTrend(
        currentPaymentMatch,
        filters
      ),

      loadTransactionTrend(
        currentTransactionMatch,
        filters
      ),
    ]);

  const currentBlockRate =
    percentage(
      currentPayment
        .riskBlockedCount,
      currentPayment
        .attemptCount
    );

  const previousBlockRate =
    percentage(
      previousPayment
        .riskBlockedCount,
      previousPayment
        .attemptCount
    );

  const currentHighRiskRate =
    percentage(
      currentTransaction
        .highRiskCount,
      currentTransaction
        .count
    );

  const previousHighRiskRate =
    percentage(
      previousTransaction
        .highRiskCount,
      previousTransaction
        .count
    );

  const currentRiskSignals =
    currentPayment
      .riskBlockedCount +
    currentTransaction
      .highRiskCount;

  const previousRiskSignals =
    previousPayment
      .riskBlockedCount +
    previousTransaction
      .highRiskCount;

  const status =
    calculateStatus(
      currentBlockRate,
      currentHighRiskRate,
      providers
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      payments:
        "mongodb_payment_collection",

      transactions:
        "mongodb_transaction_collection",
    },

    intelligenceEngine: {
      type:
        "deterministic_rules",

      version:
        "risk-v1",

      paidProviderUsed:
        false,
    },

    filters: {
      range:
        filters.range,

      mode:
        filters.mode,

      currency:
        filters.currency,

      provider,

      source,

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

    scopeNote:
      "Test/Live, provider, and payment-source filters apply to gateway Payment telemetry. Platform Transaction risk has no Test/Live, provider, or source dimension and is filtered only by time range and currency.",

    status,

    metrics: {
      riskSignalCount:
        metric(
          currentRiskSignals,
          previousRiskSignals
        ),

      riskBlockedPayments:
        metric(
          currentPayment
            .riskBlockedCount,
          previousPayment
            .riskBlockedCount
        ),

      riskBlockedRate:
        metric(
          currentBlockRate,
          previousBlockRate
        ),

      highRiskTransactions:
        metric(
          currentTransaction
            .highRiskCount,
          previousTransaction
            .highRiskCount
        ),

      highRiskTransactionRate:
        metric(
          currentHighRiskRate,
          previousHighRiskRate
        ),

      failedPayments:
        metric(
          currentPayment
            .failedCount,
          previousPayment
            .failedCount
        ),

      failedTransactions:
        metric(
          currentTransaction
            .failedCount,
          previousTransaction
            .failedCount
        ),
    },

    operations: {
      gatewayPaymentAttempts:
        currentPayment
          .attemptCount,

      transactionAttempts:
        currentTransaction
          .count,

      lowRiskTransactions:
        currentTransaction
          .lowRiskCount,

      mediumRiskTransactions:
        currentTransaction
          .mediumRiskCount,

      highRiskTransactions:
        currentTransaction
          .highRiskCount,

      failedPayments:
        currentPayment
          .failedCount,

      failedTransactions:
        currentTransaction
          .failedCount,
    },

    trend:
      buildTrend(
        filters,
        paymentTrend,
        transactionTrend
      ),

    transactionRisk,

    transactionTypes,

    providers,

    sources,

    paymentFailureReasons,

    insights:
      buildInsights({
        currentPayment,
        previousPayment,

        currentTransaction,
        previousTransaction,

        providers,
      }),
  };
}