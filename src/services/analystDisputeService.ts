import type {
  PipelineStage,
} from "mongoose";

import {
  Dispute,
} from "../models/Dispute.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
} from "../types/analystTypes.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type AnalystDisputeStatus =
  | "all"
  | "disputed"
  | "under_review"
  | "won"
  | "lost";

export interface AnalystDisputeInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "exposure"
    | "outcome"
    | "aging"
    | "merchant"
    | "provider"
    | "data_quality";

  title: string;

  description: string;

  evidence: string;

  recommendedReview: string;
}

export interface AnalystDisputeAnalyticsData {
  generatedAt: string;

  source: {
    disputes:
      "mongodb_dispute_collection";

    payments:
      "mongodb_payment_collection";
  };

  filters: {
    range:
      AnalystDateFilters["range"];

    mode:
      AnalystDateFilters["mode"];

    currency:
      string;

    status:
      AnalystDisputeStatus;

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

  metrics: {
    disputeCount:
      AnalystMetric;

    openDisputeCount:
      AnalystMetric;

    openExposureMinor:
      AnalystMetric;

    disputeExposureRate:
      AnalystMetric;

    wonCount:
      AnalystMetric;

    lostCount:
      AnalystMetric;

    lossRate:
      AnalystMetric;

    averageOpenAgeDays:
      AnalystMetric;
  };

  operations: {
    disputedCount:
      number;

    underReviewCount:
      number;

    wonCount:
      number;

    lostCount:
      number;

    completedPaymentVolumeMinor:
      number;
  };

  trend: Array<{
    bucket:
      string;

    disputeCount:
      number;

    openCount:
      number;

    wonCount:
      number;

    lostCount:
      number;

    exposureMinor:
      number;
  }>;

  statuses: Array<{
    status:
      string;

    count:
      number;

    percentage:
      number;

    amountMinor:
      number;
  }>;

  aging: Array<{
    key:
      "0_1d"
      | "1_3d"
      | "3_7d"
      | "7_14d"
      | "14d_plus";

    label:
      string;

    count:
      number;

    percentage:
      number;

    exposureMinor:
      number;
  }>;

  providers: Array<{
    provider:
      string;

    disputeCount:
      number;

    openCount:
      number;

    lostCount:
      number;

    exposureMinor:
      number;

    lossRate:
      number;
  }>;

  sources: Array<{
    source:
      string;

    disputeCount:
      number;

    openCount:
      number;

    exposureMinor:
      number;

    percentage:
      number;
  }>;

  merchants: Array<{
    merchantId:
      string;

    businessName:
      string;

    disputeCount:
      number;

    openCount:
      number;

    lostCount:
      number;

    exposureMinor:
      number;

    exposureShare:
      number;
  }>;

  insights:
    AnalystDisputeInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface SummaryRow {
  disputeCount?: unknown;

  disputedCount?: unknown;

  underReviewCount?: unknown;

  wonCount?: unknown;

  lostCount?: unknown;

  openExposureMinor?: unknown;

  averageOpenAgeDays?: unknown;
}

interface PaymentVolumeRow {
  volumeMinor?: unknown;
}

interface TrendRow {
  _id?: unknown;

  disputeCount?: unknown;

  openCount?: unknown;

  wonCount?: unknown;

  lostCount?: unknown;

  exposureMinor?: unknown;
}

interface StatusRow {
  _id?: unknown;

  count?: unknown;

  amountMinor?: unknown;
}

interface AgingRow {
  _id?: unknown;

  count?: unknown;

  exposureMinor?: unknown;
}

interface ProviderRow {
  _id?: unknown;

  disputeCount?: unknown;

  openCount?: unknown;

  lostCount?: unknown;

  exposureMinor?: unknown;
}

interface SourceRow {
  _id?: unknown;

  disputeCount?: unknown;

  openCount?: unknown;

  exposureMinor?: unknown;
}

interface MerchantRow {
  _id?: unknown;

  businessName?: unknown;

  disputeCount?: unknown;

  openCount?: unknown;

  lostCount?: unknown;

  exposureMinor?: unknown;
}

/* =========================================================
   CONSTANTS
========================================================= */

const OPEN_STATUSES = [
  "disputed",
  "under_review",
] as const;

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
  fallback =
    "unknown"
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

/*
 * Dispute.amount uses Decimal128 major units.
 *
 * 100.50 -> 10050 minor units.
 */
function decimalToMinor(
  field:
    string
): Record<
  string,
  unknown
> {
  return {
    $convert: {
      input: {
        $round: [
          {
            $multiply: [
              {
                $convert: {
                  input:
                    field,

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

      to:
        "long",

      onError:
        0,

      onNull:
        0,
    },
  };
}

/* =========================================================
   BASE DISPUTE PIPELINE

   Important:
   Dispute has no environment field.
   mode filtering is done through Payment lookup.
========================================================= */

function disputePipeline(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus,
  from:
    Date,
  to:
    Date,
  alwaysLoadPayment =
    false
): PipelineStage[] {
  const initialMatch:
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
    status !==
    "all"
  ) {
    initialMatch.status =
      status;
  }

  const pipeline:
    PipelineStage[] = [
      {
        $match:
          initialMatch,
      },
    ];

  if (
    filters.mode !==
      "all" ||
    alwaysLoadPayment
  ) {
    pipeline.push(
      {
        $lookup: {
          from:
            Payment.collection
              .name,

          localField:
            "paymentId",

          foreignField:
            "_id",

          as:
            "payment",
        },
      },

      {
        $unwind: {
          path:
            "$payment",

          preserveNullAndEmptyArrays:
            filters.mode ===
            "all",
        },
      }
    );

    if (
      filters.mode !==
      "all"
    ) {
      pipeline.push({
        $match: {
          "payment.mode":
            filters.mode,
        },
      });
    }
  }

  return pipeline;
}

/* =========================================================
   SUMMARY
========================================================= */

async function loadSummary(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus,
  from:
    Date,
  to:
    Date
) {
  const pipeline =
    disputePipeline(
      filters,
      status,
      from,
      to
    );

  pipeline.push(
    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),

        openAgeDays: {
          $cond: [
            {
              $in: [
                "$status",
                OPEN_STATUSES,
              ],
            },

            {
              $divide: [
                {
                  $subtract: [
                    "$$NOW",
                    "$createdAt",
                  ],
                },

                1000 *
                  60 *
                  60 *
                  24,
              ],
            },

            null,
          ],
        },
      },
    },

    {
      $group: {
        _id:
          null,

        disputeCount: {
          $sum:
            1,
        },

        disputedCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "disputed",
                ],
              },

              1,
              0,
            ],
          },
        },

        underReviewCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "under_review",
                ],
              },

              1,
              0,
            ],
          },
        },

        wonCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "won",
                ],
              },

              1,
              0,
            ],
          },
        },

        lostCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "lost",
                ],
              },

              1,
              0,
            ],
          },
        },

        openExposureMinor: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
                ],
              },

              "$amountMinorValue",

              0,
            ],
          },
        },

        averageOpenAgeDays: {
          $avg:
            "$openAgeDays",
        },
      },
    }
  );

  const rows =
    await Dispute.aggregate<SummaryRow>(
      pipeline
    );

  const row =
    rows[0];

  return {
    disputeCount:
      safeInteger(
        row?.disputeCount
      ),

    disputedCount:
      safeInteger(
        row?.disputedCount
      ),

    underReviewCount:
      safeInteger(
        row?.underReviewCount
      ),

    wonCount:
      safeInteger(
        row?.wonCount
      ),

    lostCount:
      safeInteger(
        row?.lostCount
      ),

    openExposureMinor:
      safeInteger(
        row?.openExposureMinor
      ),

    averageOpenAgeDays:
      round(
        safeNumber(
          row?.averageOpenAgeDays
        )
      ),
  };
}

/* =========================================================
   PAYMENT VOLUME
========================================================= */

async function loadCompletedPaymentVolume(
  filters:
    AnalystDateFilters,
  from:
    Date,
  to:
    Date
): Promise<number> {
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

      status:
        "completed",
    };

  if (
    filters.mode !==
    "all"
  ) {
    match.mode =
      filters.mode;
  }

  const rows =
    await Payment.aggregate<PaymentVolumeRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id:
              null,

            volumeMinor: {
              $sum:
                decimalToMinor(
                  "$amount"
                ),
            },
          },
        },
      ]
    );

  return safeInteger(
    rows[0]
      ?.volumeMinor
  );
}

/* =========================================================
   BUCKETS
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

function createBucketKeys(
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
   TREND
========================================================= */

async function loadTrend(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus
): Promise<
  AnalystDisputeAnalyticsData[
    "trend"
  ]
> {
  const pipeline =
    disputePipeline(
      filters,
      status,
      filters.from,
      filters.to
    );

  pipeline.push(
    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),
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

        disputeCount: {
          $sum:
            1,
        },

        openCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
                ],
              },

              1,
              0,
            ],
          },
        },

        wonCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "won",
                ],
              },

              1,
              0,
            ],
          },
        },

        lostCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "lost",
                ],
              },

              1,
              0,
            ],
          },
        },

        exposureMinor: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
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
    }
  );

  const rows =
    await Dispute.aggregate<TrendRow>(
      pipeline
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
    const date =
      new Date(
        String(
          row._id
        )
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      map.set(
        date.toISOString(),
        row
      );
    }
  }

  return createBucketKeys(
    filters
  ).map(
    (
      bucket
    ) => {
      const row =
        map.get(
          bucket
        );

      return {
        bucket,

        disputeCount:
          safeInteger(
            row?.disputeCount
          ),

        openCount:
          safeInteger(
            row?.openCount
          ),

        wonCount:
          safeInteger(
            row?.wonCount
          ),

        lostCount:
          safeInteger(
            row?.lostCount
          ),

        exposureMinor:
          safeInteger(
            row?.exposureMinor
          ),
      };
    }
  );
}

/* =========================================================
   STATUS BREAKDOWN
========================================================= */

async function loadStatuses(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus
): Promise<
  AnalystDisputeAnalyticsData[
    "statuses"
  ]
> {
  const pipeline =
    disputePipeline(
      filters,
      status,
      filters.from,
      filters.to
    );

  pipeline.push(
    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),
      },
    },

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

        amountMinor: {
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
    }
  );

  const rows =
    await Dispute.aggregate<StatusRow>(
      pipeline
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
        status:
          stringValue(
            row._id
          ),

        count,

        percentage:
          percentage(
            count,
            total
          ),

        amountMinor:
          safeInteger(
            row.amountMinor
          ),
      };
    }
  );
}

/* =========================================================
   OPEN DISPUTE AGING
========================================================= */

async function loadAging(
  filters:
    AnalystDateFilters
): Promise<
  AnalystDisputeAnalyticsData[
    "aging"
  ]
> {
  const pipeline =
    disputePipeline(
      filters,
      "all",
      filters.from,
      filters.to
    );

  pipeline.push(
    {
      $match: {
        status: {
          $in:
            OPEN_STATUSES,
        },
      },
    },

    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),

        ageDays: {
          $divide: [
            {
              $subtract: [
                "$$NOW",
                "$createdAt",
              ],
            },

            1000 *
              60 *
              60 *
              24,
          ],
        },
      },
    },

    {
      $addFields: {
        ageBucket: {
          $switch: {
            branches: [
              {
                case: {
                  $lt: [
                    "$ageDays",
                    1,
                  ],
                },

                then:
                  "0_1d",
              },

              {
                case: {
                  $lt: [
                    "$ageDays",
                    3,
                  ],
                },

                then:
                  "1_3d",
              },

              {
                case: {
                  $lt: [
                    "$ageDays",
                    7,
                  ],
                },

                then:
                  "3_7d",
              },

              {
                case: {
                  $lt: [
                    "$ageDays",
                    14,
                  ],
                },

                then:
                  "7_14d",
              },
            ],

            default:
              "14d_plus",
          },
        },
      },
    },

    {
      $group: {
        _id:
          "$ageBucket",

        count: {
          $sum:
            1,
        },

        exposureMinor: {
          $sum:
            "$amountMinorValue",
        },
      },
    }
  );

  const rows =
    await Dispute.aggregate<AgingRow>(
      pipeline
    );

  const definitions = [
    {
      key:
        "0_1d" as const,

      label:
        "< 1 day",
    },

    {
      key:
        "1_3d" as const,

      label:
        "1–3 days",
    },

    {
      key:
        "3_7d" as const,

      label:
        "3–7 days",
    },

    {
      key:
        "7_14d" as const,

      label:
        "7–14 days",
    },

    {
      key:
        "14d_plus" as const,

      label:
        "14+ days",
    },
  ];

  const map =
    new Map(
      rows.map(
        (
          row
        ) => [
          stringValue(
            row._id
          ),

          row,
        ]
      )
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

  return definitions.map(
    (
      definition
    ) => {
      const row =
        map.get(
          definition.key
        );

      const count =
        safeInteger(
          row?.count
        );

      return {
        key:
          definition.key,

        label:
          definition.label,

        count,

        percentage:
          percentage(
            count,
            total
          ),

        exposureMinor:
          safeInteger(
            row?.exposureMinor
          ),
      };
    }
  );
}

/* =========================================================
   PROVIDERS
========================================================= */

async function loadProviders(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus
): Promise<
  AnalystDisputeAnalyticsData[
    "providers"
  ]
> {
  const pipeline =
    disputePipeline(
      filters,
      status,
      filters.from,
      filters.to,
      true
    );

  pipeline.push(
    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),
      },
    },

    {
      $group: {
        _id: {
          $ifNull: [
            "$payment.provider",
            "unknown",
          ],
        },

        disputeCount: {
          $sum:
            1,
        },

        openCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
                ],
              },

              1,
              0,
            ],
          },
        },

        lostCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "lost",
                ],
              },

              1,
              0,
            ],
          },
        },

        exposureMinor: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
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
        disputeCount:
          -1,
      },
    }
  );

  const rows =
    await Dispute.aggregate<ProviderRow>(
      pipeline
    );

  return rows.map(
    (
      row
    ) => {
      const total =
        safeInteger(
          row.disputeCount
        );

      const lost =
        safeInteger(
          row.lostCount
        );

      const resolved =
        lost +
        Math.max(
          0,
          total -
            safeInteger(
              row.openCount
            ) -
            lost
        );

      return {
        provider:
          stringValue(
            row._id
          ),

        disputeCount:
          total,

        openCount:
          safeInteger(
            row.openCount
          ),

        lostCount:
          lost,

        exposureMinor:
          safeInteger(
            row.exposureMinor
          ),

        lossRate:
          percentage(
            lost,
            resolved
          ),
      };
    }
  );
}

/* =========================================================
   SOURCES
========================================================= */

async function loadSources(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus
): Promise<
  AnalystDisputeAnalyticsData[
    "sources"
  ]
> {
  const pipeline =
    disputePipeline(
      filters,
      status,
      filters.from,
      filters.to,
      true
    );

  pipeline.push(
    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),
      },
    },

    {
      $group: {
        _id: {
          $ifNull: [
            "$payment.sourceType",
            "unknown",
          ],
        },

        disputeCount: {
          $sum:
            1,
        },

        openCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
                ],
              },

              1,
              0,
            ],
          },
        },

        exposureMinor: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
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
        disputeCount:
          -1,
      },
    }
  );

  const rows =
    await Dispute.aggregate<SourceRow>(
      pipeline
    );

  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        safeInteger(
          row.disputeCount
        ),
      0
    );

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.disputeCount
        );

      return {
        source:
          stringValue(
            row._id
          ),

        disputeCount:
          count,

        openCount:
          safeInteger(
            row.openCount
          ),

        exposureMinor:
          safeInteger(
            row.exposureMinor
          ),

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
   MERCHANT CONCENTRATION
========================================================= */

async function loadMerchants(
  filters:
    AnalystDateFilters,
  status:
    AnalystDisputeStatus,
  totalOpenExposure:
    number
): Promise<
  AnalystDisputeAnalyticsData[
    "merchants"
  ]
> {
  const pipeline =
    disputePipeline(
      filters,
      status,
      filters.from,
      filters.to,
      true
    );

  pipeline.push(
    {
      $addFields: {
        amountMinorValue:
          decimalToMinor(
            "$amount"
          ),
      },
    },

    {
      $group: {
        _id:
          "$payment.merchantId",

        disputeCount: {
          $sum:
            1,
        },

        openCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
                ],
              },

              1,
              0,
            ],
          },
        },

        lostCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  "$status",
                  "lost",
                ],
              },

              1,
              0,
            ],
          },
        },

        exposureMinor: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  OPEN_STATUSES,
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
      $lookup: {
        from:
          Merchant.collection
            .name,

        localField:
          "_id",

        foreignField:
          "_id",

        as:
          "merchant",
      },
    },

    {
      $unwind: {
        path:
          "$merchant",

        preserveNullAndEmptyArrays:
          true,
      },
    },

    {
      $project: {
        _id:
          1,

        businessName: {
          $ifNull: [
            "$merchant.businessDisplayName",

            {
              $ifNull: [
                "$merchant.businessName",
                "Unknown merchant",
              ],
            },
          ],
        },

        disputeCount:
          1,

        openCount:
          1,

        lostCount:
          1,

        exposureMinor:
          1,
      },
    },

    {
      $sort: {
        exposureMinor:
          -1,

        disputeCount:
          -1,
      },
    },

    {
      $limit:
        10,
    }
  );

  const rows =
    await Dispute.aggregate<MerchantRow>(
      pipeline
    );

  return rows.map(
    (
      row
    ) => {
      const exposure =
        safeInteger(
          row.exposureMinor
        );

      return {
        merchantId:
          stringValue(
            row._id,
            ""
          ),

        businessName:
          stringValue(
            row.businessName,
            "Unknown merchant"
          ),

        disputeCount:
          safeInteger(
            row.disputeCount
          ),

        openCount:
          safeInteger(
            row.openCount
          ),

        lostCount:
          safeInteger(
            row.lostCount
          ),

        exposureMinor:
          exposure,

        exposureShare:
          percentage(
            exposure,
            totalOpenExposure
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
    current:
      Awaited<
        ReturnType<
          typeof loadSummary
        >
      >;

    previous:
      Awaited<
        ReturnType<
          typeof loadSummary
        >
      >;

    paymentVolume:
      number;

    previousPaymentVolume:
      number;

    merchants:
      AnalystDisputeAnalyticsData[
        "merchants"
      ];

    providers:
      AnalystDisputeAnalyticsData[
        "providers"
      ];
  }
): AnalystDisputeInsight[] {
  const insights:
    AnalystDisputeInsight[] =
    [];

  if (
    input.current
        .disputeCount ===
    0
  ) {
    return [
      {
        id:
          "dispute-no-activity",

        severity:
          "info",

        category:
          "data_quality",

        title:
          "No dispute activity",

        description:
          "No dispute records matched the selected analytics filters.",

        evidence:
          "0 matching disputes.",

        recommendedReview:
          "Adjust the period, payment environment, currency, or status filter if dispute activity is expected.",
      },
    ];
  }

  const openCount =
    input.current
      .disputedCount +
    input.current
      .underReviewCount;

  const exposureRate =
    percentage(
      input.current
        .openExposureMinor,
      input.paymentVolume
    );

  const previousExposureRate =
    percentage(
      input.previous
        .openExposureMinor,
      input.previousPaymentVolume
    );

  const resolvedCount =
    input.current
      .wonCount +
    input.current
      .lostCount;

  const lossRate =
    percentage(
      input.current
        .lostCount,
      resolvedCount
    );

  if (
    openCount >
      0 &&
    exposureRate >=
      2
  ) {
    insights.push({
      id:
        "dispute-open-exposure",

      severity:
        exposureRate >=
        5
          ? "high"
          : "medium",

      category:
        "exposure",

      title:
        "Open dispute exposure is elevated",

      description:
        "Unresolved disputes represent a material share of completed payment volume.",

      evidence:
        `${openCount} open disputes represent ${exposureRate.toFixed(
          2
        )}% of completed payment volume.`,

      recommendedReview:
        "Compare merchant concentration, provider mix and aging before escalating the pattern.",
    });
  }

  if (
    resolvedCount >=
      5 &&
    lossRate >=
      30
  ) {
    insights.push({
      id:
        "dispute-loss-rate",

      severity:
        lossRate >=
        50
          ? "high"
          : "medium",

      category:
        "outcome",

      title:
        "Dispute loss rate requires attention",

      description:
        "A meaningful share of resolved disputes is ending in the unfavorable outcome represented by the platform.",

      evidence:
        `${input.current.lostCount} of ${resolvedCount} resolved disputes were lost (${lossRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Review merchant and provider concentration with the operations or dispute-management team.",
    });
  }

  if (
    openCount >=
      3 &&
    input.current
        .averageOpenAgeDays >=
      7
  ) {
    insights.push({
      id:
        "dispute-aging",

      severity:
        input.current
            .averageOpenAgeDays >=
        14
          ? "high"
          : "medium",

      category:
        "aging",

      title:
        "Open disputes are aging",

      description:
        "Unresolved dispute cases have remained open beyond the current monitoring threshold.",

      evidence:
        `Average open dispute age is ${input.current.averageOpenAgeDays.toFixed(
          2
        )} days.`,

      recommendedReview:
        "Review the oldest unresolved cases and operational case-handling capacity.",
    });
  }

  const topMerchant =
    input.merchants[0];

  if (
    topMerchant &&
    topMerchant.exposureShare >=
      40
  ) {
    insights.push({
      id:
        "dispute-merchant-concentration",

      severity:
        topMerchant.exposureShare >=
        65
          ? "high"
          : "medium",

      category:
        "merchant",

      title:
        "Dispute exposure is concentrated in one merchant",

      description:
        "One merchant contributes a large share of unresolved dispute value.",

      evidence:
        `${topMerchant.businessName} represents ${topMerchant.exposureShare.toFixed(
          2
        )}% of open dispute exposure.`,

      recommendedReview:
        "Compare the merchant's payment volume and refund profile before interpreting the concentration.",
    });
  }

  const weakProvider =
    input.providers.find(
      (
        provider
      ) =>
        provider.disputeCount >=
          5 &&
        provider.lossRate >=
          40
    );

  if (
    weakProvider
  ) {
    insights.push({
      id:
        `dispute-provider-${weakProvider.provider}`,

      severity:
        weakProvider.lossRate >=
        60
          ? "high"
          : "medium",

      category:
        "provider",

      title:
        "Dispute outcomes are weak for a provider",

      description:
        `${weakProvider.provider} has an elevated dispute-loss rate in the selected period.`,

      evidence:
        `${weakProvider.lossRate.toFixed(
          2
        )}% loss rate across resolved provider-linked disputes.`,

      recommendedReview:
        "Compare provider traffic and merchant mix before escalating provider performance.",
    });
  }

  if (
    previousExposureRate >
      0 &&
    exposureRate >=
      previousExposureRate +
        2
  ) {
    insights.push({
      id:
        "dispute-exposure-increase",

      severity:
        exposureRate >=
        previousExposureRate +
          5
          ? "high"
          : "medium",

      category:
        "exposure",

      title:
        "Dispute exposure increased",

      description:
        "Open dispute value relative to completed payment volume increased against the preceding equivalent period.",

      evidence:
        `${previousExposureRate.toFixed(
          2
        )}% → ${exposureRate.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Compare merchant, provider and aging distributions between the two periods.",
    });
  }

  if (
    openCount ===
      0 &&
    resolvedCount >
      0 &&
    lossRate <
      20
  ) {
    insights.push({
      id:
        "dispute-health-positive",

      severity:
        "positive",

      category:
        "outcome",

      title:
        "Current dispute exposure is controlled",

      description:
        "No unresolved disputes remain in the selected window and the resolved loss rate remains low.",

      evidence:
        `${resolvedCount} resolved disputes with ${lossRate.toFixed(
          2
        )}% loss rate.`,

      recommendedReview:
        "Continue monitoring new dispute volume and merchant concentration.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "dispute-stable",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "Dispute signals are within current thresholds",

      description:
        "No major exposure, outcome, aging, merchant, or provider threshold was triggered.",

      evidence:
        `${input.current.disputeCount} disputes were evaluated.`,

      recommendedReview:
        "Continue monitoring dispute exposure and aging.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystDisputeAnalytics(
  input: {
    filters:
      AnalystDateFilters;

    status:
      AnalystDisputeStatus;
  }
): Promise<AnalystDisputeAnalyticsData> {
  const {
    filters,
    status,
  } = input;

  const [
    current,
    previous,

    paymentVolume,
    previousPaymentVolume,

    trend,
    statuses,
    aging,
    providers,
    sources,
  ] =
    await Promise.all([
      loadSummary(
        filters,
        status,
        filters.from,
        filters.to
      ),

      loadSummary(
        filters,
        status,
        filters.previousFrom,
        filters.previousTo
      ),

      loadCompletedPaymentVolume(
        filters,
        filters.from,
        filters.to
      ),

      loadCompletedPaymentVolume(
        filters,
        filters.previousFrom,
        filters.previousTo
      ),

      loadTrend(
        filters,
        status
      ),

      loadStatuses(
        filters,
        status
      ),

      loadAging(
        filters
      ),

      loadProviders(
        filters,
        status
      ),

      loadSources(
        filters,
        status
      ),
    ]);

  const merchants =
    await loadMerchants(
      filters,
      status,
      current.openExposureMinor
    );

  const openCurrent =
    current.disputedCount +
    current.underReviewCount;

  const openPrevious =
    previous.disputedCount +
    previous.underReviewCount;

  const resolvedCurrent =
    current.wonCount +
    current.lostCount;

  const resolvedPrevious =
    previous.wonCount +
    previous.lostCount;

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      disputes:
        "mongodb_dispute_collection",

      payments:
        "mongodb_payment_collection",
    },

    filters: {
      range:
        filters.range,

      mode:
        filters.mode,

      currency:
        filters.currency,

      status,

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

    metrics: {
      disputeCount:
        metric(
          current.disputeCount,
          previous.disputeCount
        ),

      openDisputeCount:
        metric(
          openCurrent,
          openPrevious
        ),

      openExposureMinor:
        metric(
          current.openExposureMinor,
          previous.openExposureMinor
        ),

      disputeExposureRate:
        metric(
          percentage(
            current.openExposureMinor,
            paymentVolume
          ),

          percentage(
            previous.openExposureMinor,
            previousPaymentVolume
          )
        ),

      wonCount:
        metric(
          current.wonCount,
          previous.wonCount
        ),

      lostCount:
        metric(
          current.lostCount,
          previous.lostCount
        ),

      lossRate:
        metric(
          percentage(
            current.lostCount,
            resolvedCurrent
          ),

          percentage(
            previous.lostCount,
            resolvedPrevious
          )
        ),

      averageOpenAgeDays:
        metric(
          current.averageOpenAgeDays,
          previous.averageOpenAgeDays
        ),
    },

    operations: {
      disputedCount:
        current.disputedCount,

      underReviewCount:
        current.underReviewCount,

      wonCount:
        current.wonCount,

      lostCount:
        current.lostCount,

      completedPaymentVolumeMinor:
        paymentVolume,
    },

    trend,

    statuses,

    aging,

    providers,

    sources,

    merchants,

    insights:
      buildInsights({
        current,
        previous,

        paymentVolume,

        previousPaymentVolume,

        merchants,

        providers,
      }),
  };
}
