import {
  Payment,
  type PaymentSourceType,
} from "../models/Payment.js";

import type {
  AnalystMetric,
  AnalystMode,
  AnalystRange,
} from "../types/analystTypes.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type AnalystConversionSource =
  | "all"
  | PaymentSourceType;

export interface AnalystConversionFilters {
  range: AnalystRange;
  mode: AnalystMode;
  currency: string;
  provider: string;
  source: AnalystConversionSource;
}

export interface AnalystConversionInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  title: string;
  description: string;
  evidence: string;
  recommendedReview: string;
}

export interface AnalystConversionData {
  generatedAt: string;

  source:
    "mongodb_payment_collection";

  calculationEngine: {
    type:
      "deterministic_rules";

    paidProviderUsed:
      false;

    version:
      string;
  };

  filters:
    AnalystConversionFilters & {
      from: string;
      to: string;
      previousFrom: string;
      previousTo: string;
      bucket:
        | "hour"
        | "day";
    };

  metrics: {
    createdCount:
      AnalystMetric;

    authorizedCount:
      AnalystMetric;

    capturedCount:
      AnalystMetric;

    completedCount:
      AnalystMetric;

    authorizationRate:
      AnalystMetric;

    captureRate:
      AnalystMetric;

    completionRate:
      AnalystMetric;

    terminalDropoffRate:
      AnalystMetric;
  };

  operations: {
    pendingCount: number;
    failedCount: number;
    cancelledCount: number;
    expiredCount: number;
  };

  funnel: Array<{
    stage:
      | "created"
      | "authorized"
      | "captured"
      | "completed";

    count: number;

    percentageFromStart:
      number;

    percentageFromPrevious:
      number;

    notReachedFromPrevious:
      number;
  }>;

  trend: Array<{
    bucket: string;
    createdCount: number;
    authorizedCount: number;
    capturedCount: number;
    completedCount: number;
    failedCount: number;
    completionRate: number;
  }>;

  providers: Array<{
    provider: string;
    createdCount: number;
    completedCount: number;
    completionRate: number;
    failedCount: number;
  }>;

  sources: Array<{
    source: string;
    createdCount: number;
    completedCount: number;
    completionRate: number;
  }>;

  dropoffs: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;

  insights:
    AnalystConversionInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface SummaryRow {
  createdCount?: unknown;
  authorizedCount?: unknown;
  capturedCount?: unknown;
  completedCount?: unknown;
  failedCount?: unknown;
  cancelledCount?: unknown;
  expiredCount?: unknown;
  pendingCount?: unknown;
}

interface TrendRow {
  _id?: unknown;
  createdCount?: unknown;
  authorizedCount?: unknown;
  capturedCount?: unknown;
  completedCount?: unknown;
  failedCount?: unknown;
}

interface ProviderRow {
  _id?: unknown;
  createdCount?: unknown;
  completedCount?: unknown;
  failedCount?: unknown;
}

interface SourceRow {
  _id?: unknown;
  createdCount?: unknown;
  completedCount?: unknown;
}

interface RangeBoundary {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;

  bucket:
    | "hour"
    | "day";

  bucketCount:
    number;
}

/* =========================================================
   HELPERS
========================================================= */

function finiteNumber(
  value: unknown
): number {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function integer(
  value: unknown
): number {
  return Math.max(
    0,
    Math.round(
      finiteNumber(value)
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
  if (total <= 0) {
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
  if (previous === 0) {
    return current === 0
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

/* =========================================================
   RANGE
========================================================= */

function getBoundary(
  range: AnalystRange
): RangeBoundary {
  const to =
    new Date();

  const config:
    Record<
      AnalystRange,
      {
        durationMs:
          number;

        bucket:
          | "hour"
          | "day";

        bucketCount:
          number;
      }
    > = {
    "24h": {
      durationMs:
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
      durationMs:
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
      durationMs:
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
      durationMs:
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

  const setting =
    config[range];

  const from =
    new Date(
      to.getTime() -
        setting.durationMs
    );

  const previousTo =
    new Date(from);

  const previousFrom =
    new Date(
      previousTo.getTime() -
        setting.durationMs
    );

  return {
    from,
    to,
    previousFrom,
    previousTo,

    bucket:
      setting.bucket,

    bucketCount:
      setting.bucketCount,
  };
}

/* =========================================================
   FILTER MATCH
========================================================= */

function createMatch(
  filters:
    AnalystConversionFilters,
  from: Date,
  to: Date
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
    filters.provider
  ) {
    match.provider =
      filters.provider;
  }

  if (
    filters.source !==
    "all"
  ) {
    match.sourceType =
      filters.source;
  }

  return match;
}

/* =========================================================
   STAGE EXPRESSIONS
========================================================= */

const reachedAuthorized = {
  $or: [
    {
      $ne: [
        {
          $ifNull: [
            "$authorizedAt",
            null,
          ],
        },
        null,
      ],
    },

    {
      $in: [
        "$status",
        [
          "authorized",
          "captured",
          "completed",
        ],
      ],
    },
  ],
};

const reachedCaptured = {
  $or: [
    {
      $ne: [
        {
          $ifNull: [
            "$capturedAt",
            null,
          ],
        },
        null,
      ],
    },

    {
      $in: [
        "$status",
        [
          "captured",
          "completed",
        ],
      ],
    },
  ],
};

const reachedCompleted = {
  $or: [
    {
      $ne: [
        {
          $ifNull: [
            "$completedAt",
            null,
          ],
        },
        null,
      ],
    },

    {
      $eq: [
        "$status",
        "completed",
      ],
    },
  ],
};

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
    await Payment.aggregate<SummaryRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id:
              null,

            createdCount: {
              $sum:
                1,
            },

            authorizedCount: {
              $sum: {
                $cond: [
                  reachedAuthorized,
                  1,
                  0,
                ],
              },
            },

            capturedCount: {
              $sum: {
                $cond: [
                  reachedCaptured,
                  1,
                  0,
                ],
              },
            },

            completedCount: {
              $sum: {
                $cond: [
                  reachedCompleted,
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

            pendingCount: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$status",
                      [
                        "pending",
                        "authorized",
                        "captured",
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
      ]
    );

  return (
    rows[0] ??
    {}
  );
}

/* =========================================================
   PROVIDERS
========================================================= */

async function loadProviders(
  match:
    Record<
      string,
      unknown
    >
): Promise<ProviderRow[]> {
  return Payment.aggregate<ProviderRow>(
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

          createdCount: {
            $sum:
              1,
          },

          completedCount: {
            $sum: {
              $cond: [
                reachedCompleted,
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

      {
        $sort: {
          createdCount:
            -1,
        },
      },

      {
        $limit:
          12,
      },
    ]
  );
}

/* =========================================================
   SOURCES
========================================================= */

async function loadSources(
  match:
    Record<
      string,
      unknown
    >
): Promise<SourceRow[]> {
  return Payment.aggregate<SourceRow>(
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

          createdCount: {
            $sum:
              1,
          },

          completedCount: {
            $sum: {
              $cond: [
                reachedCompleted,
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $sort: {
          createdCount:
            -1,
        },
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
    RangeBoundary
): Promise<
  AnalystConversionData[
    "trend"
  ]
> {
  const format =
    boundary.bucket ===
    "hour"
      ? "%Y-%m-%dT%H:00:00.000Z"
      : "%Y-%m-%dT00:00:00.000Z";

  const rows =
    await Payment.aggregate<TrendRow>(
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

            createdCount: {
              $sum:
                1,
            },

            authorizedCount: {
              $sum: {
                $cond: [
                  reachedAuthorized,
                  1,
                  0,
                ],
              },
            },

            capturedCount: {
              $sum: {
                $cond: [
                  reachedCaptured,
                  1,
                  0,
                ],
              },
            },

            completedCount: {
              $sum: {
                $cond: [
                  reachedCompleted,
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

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  const rowMap =
    new Map<
      string,
      TrendRow
    >();

  for (
    const row of
    rows
  ) {
    rowMap.set(
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
    AnalystConversionData[
      "trend"
    ] = [];

  for (
    let index =
      boundary.bucketCount -
      1;
    index >= 0;
    index -= 1
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
      rowMap.get(
        key
      );

    const created =
      integer(
        row
          ?.createdCount
      );

    const completed =
      integer(
        row
          ?.completedCount
      );

    result.push({
      bucket:
        key,

      createdCount:
        created,

      authorizedCount:
        integer(
          row
            ?.authorizedCount
        ),

      capturedCount:
        integer(
          row
            ?.capturedCount
        ),

      completedCount:
        completed,

      failedCount:
        integer(
          row
            ?.failedCount
        ),

      completionRate:
        percentage(
          completed,
          created
        ),
    });
  }

  return result;
}

/* =========================================================
   FUNNEL
========================================================= */

function createFunnel(
  created:
    number,
  authorized:
    number,
  captured:
    number,
  completed:
    number
): AnalystConversionData[
  "funnel"
] {
  const stages = [
    {
      stage:
        "created" as const,

      count:
        created,

      previous:
        created,
    },

    {
      stage:
        "authorized" as const,

      count:
        authorized,

      previous:
        created,
    },

    {
      stage:
        "captured" as const,

      count:
        captured,

      previous:
        authorized,
    },

    {
      stage:
        "completed" as const,

      count:
        completed,

      previous:
        captured,
    },
  ];

  return stages.map(
    (
      item,
      index
    ) => ({
      stage:
        item.stage,

      count:
        item.count,

      percentageFromStart:
        percentage(
          item.count,
          created
        ),

      percentageFromPrevious:
        index === 0
          ? 100
          : percentage(
              item.count,
              item.previous
            ),

      notReachedFromPrevious:
        index === 0
          ? 0
          : Math.max(
              0,
              item.previous -
                item.count
            ),
    })
  );
}

/* =========================================================
   INSIGHTS
========================================================= */

function createInsights(
  input: {
    created:
      number;

    authorized:
      number;

    captured:
      number;

    completed:
      number;

    failed:
      number;

    cancelled:
      number;

    expired:
      number;

    previousCompletionRate:
      number;

    providers:
      AnalystConversionData[
        "providers"
      ];
  }
): AnalystConversionInsight[] {
  const insights:
    AnalystConversionInsight[] =
    [];

  if (
    input.created ===
    0
  ) {
    return [
      {
        id:
          "conversion-no-traffic",

        severity:
          "info",

        title:
          "No payment conversion traffic",

        description:
          "No payments matched the selected conversion filters.",

        evidence:
          "0 payment records evaluated.",

        recommendedReview:
          "Adjust the time range or filters and continue monitoring.",
      },
    ];
  }

  const completionRate =
    percentage(
      input.completed,
      input.created
    );

  const authorizationRate =
    percentage(
      input.authorized,
      input.created
    );

  const captureRate =
    percentage(
      input.captured,
      input.authorized
    );

  const terminalLoss =
    input.failed +
    input.cancelled +
    input.expired;

  const terminalRate =
    percentage(
      terminalLoss,
      input.created
    );

  if (
    completionRate <
    70
  ) {
    insights.push({
      id:
        "conversion-low",

      severity:
        completionRate <
        50
          ? "critical"
          : "high",

      title:
        "Payment conversion is below target",

      description:
        "A large share of created payments is not reaching completed status.",

      evidence:
        `${completionRate.toFixed(
          2
        )}% of created payments completed.`,

      recommendedReview:
        "Compare provider conversion, terminal failures and lifecycle stage loss.",
    });
  }

  if (
    authorizationRate <
      80 &&
    input.created >=
      5
  ) {
    insights.push({
      id:
        "conversion-authorization-loss",

      severity:
        authorizationRate <
        60
          ? "high"
          : "medium",

      title:
        "Authorization stage is losing payments",

      description:
        "A material portion of created payments is not reaching authorization.",

      evidence:
        `${authorizationRate.toFixed(
          2
        )}% reached authorization.`,

      recommendedReview:
        "Inspect provider declines, risk blocks, validation failures and abandoned checkout activity.",
    });
  }

  if (
    input.authorized >
      0 &&
    captureRate <
      85
  ) {
    insights.push({
      id:
        "conversion-capture-loss",

      severity:
        captureRate <
        65
          ? "high"
          : "medium",

      title:
        "Authorized payments are dropping before capture",

      description:
        "Some authorized payments do not progress to the captured stage.",

      evidence:
        `${captureRate.toFixed(
          2
        )}% of authorized payments reached capture.`,

      recommendedReview:
        "Review provider capture responses and lifecycle transition failures.",
    });
  }

  if (
    terminalRate >=
    15
  ) {
    insights.push({
      id:
        "conversion-terminal-loss",

      severity:
        terminalRate >=
        30
          ? "high"
          : "medium",

      title:
        "Terminal payment loss is elevated",

      description:
        "Failed, cancelled and expired payments form a material share of created payments.",

      evidence:
        `${terminalLoss} terminal losses (${terminalRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare failed, cancelled and expired records to identify the largest loss source.",
    });
  }

  const weakProvider =
    input.providers.find(
      (
        provider
      ) =>
        provider.createdCount >=
          5 &&
        provider.completionRate <
          70
    );

  if (
    weakProvider
  ) {
    insights.push({
      id:
        `conversion-provider-${weakProvider.provider}`,

      severity:
        weakProvider.completionRate <
        50
          ? "high"
          : "medium",

      title:
        "Provider conversion is underperforming",

      description:
        `${weakProvider.provider} has weaker completion performance in the selected window.`,

      evidence:
        `${weakProvider.completionRate.toFixed(
          2
        )}% completion across ${weakProvider.createdCount} created payments.`,

      recommendedReview:
        "Compare its failure profile and lifecycle stage losses against other providers.",
    });
  }

  if (
    input.previousCompletionRate >
      0 &&
    completionRate <=
      input.previousCompletionRate -
        8
  ) {
    insights.push({
      id:
        "conversion-decline",

      severity:
        completionRate <=
        input.previousCompletionRate -
          15
          ? "high"
          : "medium",

      title:
        "Conversion declined from the previous period",

      description:
        "Overall payment completion is materially lower than the preceding equivalent period.",

      evidence:
        `${input.previousCompletionRate.toFixed(
          2
        )}% → ${completionRate.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Compare provider, source and terminal-loss distributions between periods.",
    });
  }

  if (
    completionRate >=
      95 &&
    terminalRate <
      5
  ) {
    insights.push({
      id:
        "conversion-healthy",

      severity:
        "positive",

      title:
        "Payment conversion is healthy",

      description:
        "Most created payments are successfully reaching completion.",

      evidence:
        `${completionRate.toFixed(
          2
        )}% completion rate.`,

      recommendedReview:
        "Continue monitoring provider and source-level conversion for changes.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "conversion-stable",

      severity:
        "info",

      title:
        "Conversion is within current monitoring thresholds",

      description:
        "No major deterministic funnel threshold was triggered.",

      evidence:
        `${completionRate.toFixed(
          2
        )}% overall completion.`,

      recommendedReview:
        "Continue monitoring lifecycle stage and provider conversion.",
    });
  }

  return insights;
}

/* =========================================================
   SERVICE
========================================================= */

export async function getAnalystConversionAnalytics(
  filters:
    AnalystConversionFilters
): Promise<AnalystConversionData> {
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
    providerRows,
    sourceRows,
    trend,
  ] =
    await Promise.all([
      loadSummary(
        currentMatch
      ),

      loadSummary(
        previousMatch
      ),

      loadProviders(
        currentMatch
      ),

      loadSources(
        currentMatch
      ),

      loadTrend(
        currentMatch,
        boundary
      ),
    ]);

  const created =
    integer(
      current.createdCount
    );

  const authorized =
    integer(
      current.authorizedCount
    );

  const captured =
    integer(
      current.capturedCount
    );

  const completed =
    integer(
      current.completedCount
    );

  const failed =
    integer(
      current.failedCount
    );

  const cancelled =
    integer(
      current.cancelledCount
    );

  const expired =
    integer(
      current.expiredCount
    );

  const previousCreated =
    integer(
      previous.createdCount
    );

  const previousAuthorized =
    integer(
      previous.authorizedCount
    );

  const previousCaptured =
    integer(
      previous.capturedCount
    );

  const previousCompleted =
    integer(
      previous.completedCount
    );

  const previousTerminal =
    integer(
      previous.failedCount
    ) +
    integer(
      previous.cancelledCount
    ) +
    integer(
      previous.expiredCount
    );

  const terminal =
    failed +
    cancelled +
    expired;

  const providers =
    providerRows.map(
      (
        row
      ) => {
        const providerCreated =
          integer(
            row.createdCount
          );

        const providerCompleted =
          integer(
            row.completedCount
          );

        return {
          provider:
            String(
              row._id ??
                "unknown"
            ),

          createdCount:
            providerCreated,

          completedCount:
            providerCompleted,

          completionRate:
            percentage(
              providerCompleted,
              providerCreated
            ),

          failedCount:
            integer(
              row.failedCount
            ),
        };
      }
    );

  const sources =
    sourceRows.map(
      (
        row
      ) => {
        const sourceCreated =
          integer(
            row.createdCount
          );

        const sourceCompleted =
          integer(
            row.completedCount
          );

        return {
          source:
            String(
              row._id ??
                "unknown"
            ),

          createdCount:
            sourceCreated,

          completedCount:
            sourceCompleted,

          completionRate:
            percentage(
              sourceCompleted,
              sourceCreated
            ),
        };
      }
    );

  const currentCompletionRate =
    percentage(
      completed,
      created
    );

  const previousCompletionRate =
    percentage(
      previousCompleted,
      previousCreated
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source:
      "mongodb_payment_collection",

    calculationEngine: {
      type:
        "deterministic_rules",

      paidProviderUsed:
        false,

      version:
        "conversion-v1",
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
      createdCount:
        metric(
          created,
          previousCreated
        ),

      authorizedCount:
        metric(
          authorized,
          previousAuthorized
        ),

      capturedCount:
        metric(
          captured,
          previousCaptured
        ),

      completedCount:
        metric(
          completed,
          previousCompleted
        ),

      authorizationRate:
        metric(
          percentage(
            authorized,
            created
          ),
          percentage(
            previousAuthorized,
            previousCreated
          )
        ),

      captureRate:
        metric(
          percentage(
            captured,
            authorized
          ),
          percentage(
            previousCaptured,
            previousAuthorized
          )
        ),

      completionRate:
        metric(
          currentCompletionRate,
          previousCompletionRate
        ),

      terminalDropoffRate:
        metric(
          percentage(
            terminal,
            created
          ),
          percentage(
            previousTerminal,
            previousCreated
          )
        ),
    },

    operations: {
      pendingCount:
        integer(
          current.pendingCount
        ),

      failedCount:
        failed,

      cancelledCount:
        cancelled,

      expiredCount:
        expired,
    },

    funnel:
      createFunnel(
        created,
        authorized,
        captured,
        completed
      ),

    trend,

    providers,

    sources,

    dropoffs: [
      {
        reason:
          "failed",

        count:
          failed,

        percentage:
          percentage(
            failed,
            created
          ),
      },

      {
        reason:
          "cancelled",

        count:
          cancelled,

        percentage:
          percentage(
            cancelled,
            created
          ),
      },

      {
        reason:
          "expired",

        count:
          expired,

        percentage:
          percentage(
            expired,
            created
          ),
      },

      {
        reason:
          "in_progress",

        count:
          integer(
            current.pendingCount
          ),

        percentage:
          percentage(
            integer(
              current.pendingCount
            ),
            created
          ),
      },
    ],

    insights:
      createInsights({
        created,
        authorized,
        captured,
        completed,
        failed,
        cancelled,
        expired,
        previousCompletionRate,
        providers,
      }),
  };
}