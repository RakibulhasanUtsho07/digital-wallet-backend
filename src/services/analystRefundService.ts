import type {
  PipelineStage,
} from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  Refund,
  type RefundStatus,
} from "../models/Refund.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
} from "../types/analystTypes.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type AnalystRefundStatus =
  | "all"
  | RefundStatus;

export interface AnalystRefundInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "volume"
    | "reliability"
    | "latency"
    | "merchant"
    | "provider"
    | "data_quality";

  title: string;

  description: string;

  evidence: string;

  recommendedReview: string;
}

export interface AnalystRefundAnalyticsData {
  generatedAt: string;

  source: {
    refunds:
      "mongodb_refund_collection";

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
      AnalystRefundStatus;

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
    refundCount:
      AnalystMetric;

    completedRefundCount:
      AnalystMetric;

    completedRefundAmountMinor:
      AnalystMetric;

    completionRate:
      AnalystMetric;

    failureRate:
      AnalystMetric;

    refundRate:
      AnalystMetric;

    averageRefundMinor:
      AnalystMetric;

    averageCompletionSeconds:
      AnalystMetric;
  };

  operations: {
    pendingCount:
      number;

    failedCount:
      number;

    cancelledCount:
      number;

    settledCount:
      number;

    completedPaymentVolumeMinor:
      number;
  };

  trend: Array<{
    bucket:
      string;

    refundCount:
      number;

    completedCount:
      number;

    failedCount:
      number;

    pendingCount:
      number;

    cancelledCount:
      number;

    refundAmountMinor:
      number;

    completionRate:
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

  reasons: Array<{
    reason:
      string;

    count:
      number;

    amountMinor:
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

  providers: Array<{
    provider:
      string;

    count:
      number;

    completedCount:
      number;

    failedCount:
      number;

    amountMinor:
      number;

    completionRate:
      number;
  }>;

  sources: Array<{
    source:
      string;

    count:
      number;

    amountMinor:
      number;

    percentage:
      number;
  }>;

  merchants: Array<{
    merchantId:
      string;

    businessName:
      string;

    refundCount:
      number;

    completedRefundCount:
      number;

    refundAmountMinor:
      number;

    refundAmountShare:
      number;
  }>;

  insights:
    AnalystRefundInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface RefundSummaryRow {
  refundCount?: unknown;

  completedCount?: unknown;

  failedCount?: unknown;

  pendingCount?: unknown;

  cancelledCount?: unknown;

  settledCount?: unknown;

  completedAmountMinor?: unknown;

  averageRefundMinor?: unknown;

  averageCompletionSeconds?: unknown;
}

interface PaymentVolumeRow {
  volumeMinor?: unknown;
}

interface TrendRow {
  _id?: unknown;

  refundCount?: unknown;

  completedCount?: unknown;

  failedCount?: unknown;

  pendingCount?: unknown;

  cancelledCount?: unknown;

  refundAmountMinor?: unknown;
}

interface StatusRow {
  _id?: unknown;

  count?: unknown;

  amountMinor?: unknown;
}

interface ReasonRow {
  _id?: unknown;

  count?: unknown;

  amountMinor?: unknown;
}

interface ProviderRow {
  _id?: unknown;

  count?: unknown;

  completedCount?: unknown;

  failedCount?: unknown;

  amountMinor?: unknown;
}

interface SourceRow {
  _id?: unknown;

  count?: unknown;

  amountMinor?: unknown;
}

interface MerchantRow {
  _id?: unknown;

  businessName?: unknown;

  refundCount?: unknown;

  completedRefundCount?: unknown;

  refundAmountMinor?: unknown;
}

/* =========================================================
   HELPERS
========================================================= */

function safeNumber(
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

/* =========================================================
   PAYMENT DECIMAL -> MINOR
========================================================= */

function decimalToMinor(
  field: string
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
   REFUND MATCH
========================================================= */

function createRefundMatch(
  filters:
    AnalystDateFilters,
  status:
    AnalystRefundStatus,
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
    status !==
    "all"
  ) {
    match.status =
      status;
  }

  return match;
}

/* =========================================================
   PAYMENT MATCH
========================================================= */

function createPaymentMatch(
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

  return match;
}

/* =========================================================
   REFUND SUMMARY
========================================================= */

async function loadRefundSummary(
  match:
    Record<
      string,
      unknown
    >
) {
  const rows =
    await Refund.aggregate<RefundSummaryRow>(
      [
        {
          $match:
            match,
        },

        {
          $addFields: {
            completionSeconds: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$status",
                        "completed",
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
          $group: {
            _id:
              null,

            refundCount: {
              $sum:
                1,
            },

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

            settledCount: {
              $sum: {
                $cond: [
                  {
                    $ne: [
                      {
                        $ifNull: [
                          "$settledAt",
                          null,
                        ],
                      },

                      null,
                    ],
                  },

                  1,
                  0,
                ],
              },
            },

            completedAmountMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  "$amountMinor",

                  0,
                ],
              },
            },

            averageRefundMinor: {
              $avg: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  "$amountMinor",

                  null,
                ],
              },
            },

            averageCompletionSeconds: {
              $avg:
                "$completionSeconds",
            },
          },
        },
      ]
    );

  const row =
    rows[0];

  return {
    refundCount:
      safeInteger(
        row?.refundCount
      ),

    completedCount:
      safeInteger(
        row?.completedCount
      ),

    failedCount:
      safeInteger(
        row?.failedCount
      ),

    pendingCount:
      safeInteger(
        row?.pendingCount
      ),

    cancelledCount:
      safeInteger(
        row?.cancelledCount
      ),

    settledCount:
      safeInteger(
        row?.settledCount
      ),

    completedAmountMinor:
      safeInteger(
        row?.completedAmountMinor
      ),

    averageRefundMinor:
      safeInteger(
        row?.averageRefundMinor
      ),

    averageCompletionSeconds:
      round(
        safeNumber(
          row?.averageCompletionSeconds
        )
      ),
  };
}

/* =========================================================
   COMPLETED PAYMENT VOLUME

   Used as refund-rate denominator.
========================================================= */

async function loadPaymentVolume(
  match:
    Record<
      string,
      unknown
    >
): Promise<number> {
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
   REFUND TREND
========================================================= */

async function loadTrend(
  match:
    Record<
      string,
      unknown
    >,
  filters:
    AnalystDateFilters
): Promise<
  AnalystRefundAnalyticsData[
    "trend"
  ]
> {
  const rows =
    await Refund.aggregate<TrendRow>(
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

            refundCount: {
              $sum:
                1,
            },

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

            refundAmountMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  "$amountMinor",

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

      const total =
        safeInteger(
          row?.refundCount
        );

      const completed =
        safeInteger(
          row?.completedCount
        );

      return {
        bucket,

        refundCount:
          total,

        completedCount:
          completed,

        failedCount:
          safeInteger(
            row?.failedCount
          ),

        pendingCount:
          safeInteger(
            row?.pendingCount
          ),

        cancelledCount:
          safeInteger(
            row?.cancelledCount
          ),

        refundAmountMinor:
          safeInteger(
            row?.refundAmountMinor
          ),

        completionRate:
          percentage(
            completed,
            total
          ),
      };
    }
  );
}

/* =========================================================
   STATUS BREAKDOWN
========================================================= */

async function loadStatuses(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRefundAnalyticsData[
    "statuses"
  ]
> {
  const rows =
    await Refund.aggregate<StatusRow>(
      [
        {
          $match:
            match,
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
                "$amountMinor",
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
   REASON BREAKDOWN
========================================================= */

async function loadReasons(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRefundAnalyticsData[
    "reasons"
  ]
> {
  const rows =
    await Refund.aggregate<ReasonRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$reason",
                        null,
                      ],
                    },

                    {
                      $ne: [
                        "$reason",
                        "",
                      ],
                    },
                  ],
                },

                "$reason",

                "unspecified",
              ],
            },

            count: {
              $sum:
                1,
            },

            amountMinor: {
              $sum:
                "$amountMinor",
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
        reason:
          stringValue(
            row._id
          ),

        count,

        amountMinor:
          safeInteger(
            row.amountMinor
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
   FAILURE REASONS
========================================================= */

async function loadFailureReasons(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRefundAnalyticsData[
    "failureReasons"
  ]
> {
  const rows =
    await Refund.aggregate<ReasonRow>(
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
   PROVIDERS

   Refund -> Payment lookup
========================================================= */

async function loadProviders(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystRefundAnalyticsData[
    "providers"
  ]
> {
  const pipeline:
    PipelineStage[] = [
      {
        $match:
          match,
      },

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
            true,
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

          amountMinor: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amountMinor",

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
    ];

  const rows =
    await Refund.aggregate<ProviderRow>(
      pipeline
    );

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.count
        );

      const completed =
        safeInteger(
          row.completedCount
        );

      return {
        provider:
          stringValue(
            row._id
          ),

        count,

        completedCount:
          completed,

        failedCount:
          safeInteger(
            row.failedCount
          ),

        amountMinor:
          safeInteger(
            row.amountMinor
          ),

        completionRate:
          percentage(
            completed,
            count
          ),
      };
    }
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
): Promise<
  AnalystRefundAnalyticsData[
    "sources"
  ]
> {
  const pipeline:
    PipelineStage[] = [
      {
        $match:
          match,
      },

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
            true,
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

          count: {
            $sum:
              1,
          },

          amountMinor: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amountMinor",

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
    ];

  const rows =
    await Refund.aggregate<SourceRow>(
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
        source:
          stringValue(
            row._id
          ),

        count,

        amountMinor:
          safeInteger(
            row.amountMinor
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
   MERCHANT REFUND CONCENTRATION
========================================================= */

async function loadMerchants(
  match:
    Record<
      string,
      unknown
    >,
  totalCompletedRefundAmount:
    number
): Promise<
  AnalystRefundAnalyticsData[
    "merchants"
  ]
> {
  const pipeline:
    PipelineStage[] = [
      {
        $match:
          match,
      },

      {
        $group: {
          _id:
            "$merchantId",

          refundCount: {
            $sum:
              1,
          },

          completedRefundCount: {
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

          refundAmountMinor: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amountMinor",

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

          refundCount:
            1,

          completedRefundCount:
            1,

          refundAmountMinor:
            1,
        },
      },

      {
        $sort: {
          refundAmountMinor:
            -1,

          refundCount:
            -1,
        },
      },

      {
        $limit:
          10,
      },
    ];

  const rows =
    await Refund.aggregate<MerchantRow>(
      pipeline
    );

  return rows.map(
    (
      row
    ) => {
      const amount =
        safeInteger(
          row.refundAmountMinor
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

        refundCount:
          safeInteger(
            row.refundCount
          ),

        completedRefundCount:
          safeInteger(
            row.completedRefundCount
          ),

        refundAmountMinor:
          amount,

        refundAmountShare:
          percentage(
            amount,
            totalCompletedRefundAmount
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
          typeof loadRefundSummary
        >
      >;

    previous:
      Awaited<
        ReturnType<
          typeof loadRefundSummary
        >
      >;

    currentPaymentVolume:
      number;

    previousPaymentVolume:
      number;

    providers:
      AnalystRefundAnalyticsData[
        "providers"
      ];

    merchants:
      AnalystRefundAnalyticsData[
        "merchants"
      ];
  }
): AnalystRefundInsight[] {
  const insights:
    AnalystRefundInsight[] =
    [];

  if (
    input.current
        .refundCount ===
    0
  ) {
    return [
      {
        id:
          "refund-no-activity",

        severity:
          "info",

        category:
          "data_quality",

        title:
          "No refund activity",

        description:
          "No refund records matched the current analytics filters.",

        evidence:
          "0 matching refund records.",

        recommendedReview:
          "Adjust the period, environment, currency, or status filters if refund activity is expected.",
      },
    ];
  }

  const completionRate =
    percentage(
      input.current
        .completedCount,
      input.current
        .refundCount
    );

  const failureRate =
    percentage(
      input.current
        .failedCount,
      input.current
        .refundCount
    );

  const refundRate =
    percentage(
      input.current
        .completedAmountMinor,
      input.currentPaymentVolume
    );

  const previousRefundRate =
    percentage(
      input.previous
        .completedAmountMinor,
      input.previousPaymentVolume
    );

  if (
    refundRate >=
      5 &&
    input.currentPaymentVolume >
      0
  ) {
    insights.push({
      id:
        "refund-value-elevated",

      severity:
        refundRate >=
        10
          ? "high"
          : "medium",

      category:
        "volume",

      title:
        "Refund value is elevated",

      description:
        "Completed refund value represents a material share of completed payment volume.",

      evidence:
        `Refund value equals ${refundRate.toFixed(
          2
        )}% of completed payment volume.`,

      recommendedReview:
        "Compare merchant concentration, refund reasons and provider distribution before escalating.",
    });
  }

  if (
    failureRate >=
      10 &&
    input.current
        .refundCount >=
      5
  ) {
    insights.push({
      id:
        "refund-failure-rate",

      severity:
        failureRate >=
        25
          ? "high"
          : "medium",

      category:
        "reliability",

      title:
        "Refund failures require review",

      description:
        "A meaningful share of refund records is ending in failed status.",

      evidence:
        `${input.current.failedCount} of ${input.current.refundCount} refunds failed (${failureRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Review failure-code distribution and provider concentration without changing refund state from the analyst workspace.",
    });
  }

  if (
    input.current
        .pendingCount >=
      5 &&
    completionRate <
      80
  ) {
    insights.push({
      id:
        "refund-pending-backlog",

      severity:
        completionRate <
        60
          ? "high"
          : "medium",

      category:
        "latency",

      title:
        "Refund backlog is elevated",

      description:
        "Several refund records remain pending while the overall completion rate is reduced.",

      evidence:
        `${input.current.pendingCount} pending refunds; ${completionRate.toFixed(
          2
        )}% completion rate.`,

      recommendedReview:
        "Review pending refund age and provider processing behaviour.",
    });
  }

  if (
    input.current
        .averageCompletionSeconds >
      300 &&
    input.current
        .completedCount >=
      3
  ) {
    insights.push({
      id:
        "refund-latency",

      severity:
        input.current
            .averageCompletionSeconds >
        900
          ? "medium"
          : "info",

      category:
        "latency",

      title:
        "Refund completion latency is elevated",

      description:
        "Completed refunds are taking longer than the current monitoring threshold.",

      evidence:
        `Average completion time is ${input.current.averageCompletionSeconds.toFixed(
          2
        )} seconds.`,

      recommendedReview:
        "Compare latency with refund provider and payment source.",
    });
  }

  const topMerchant =
    input.merchants[0];

  if (
    topMerchant &&
    topMerchant.refundAmountShare >=
      40
  ) {
    insights.push({
      id:
        "refund-merchant-concentration",

      severity:
        topMerchant.refundAmountShare >=
        65
          ? "high"
          : "medium",

      category:
        "merchant",

      title:
        "Refund value is concentrated in one merchant",

      description:
        "One merchant represents a large share of completed refund value.",

      evidence:
        `${topMerchant.businessName} represents ${topMerchant.refundAmountShare.toFixed(
          2
        )}% of completed refund value.`,

      recommendedReview:
        "Compare this merchant's payment volume, refund reasons and dispute activity before drawing conclusions.",
    });
  }

  const weakProvider =
    input.providers.find(
      (
        provider
      ) =>
        provider.count >=
          5 &&
        provider.completionRate <
          80
    );

  if (
    weakProvider
  ) {
    insights.push({
      id:
        `refund-provider-${weakProvider.provider}`,

      severity:
        weakProvider.completionRate <
        60
          ? "high"
          : "medium",

      category:
        "provider",

      title:
        "Refund completion is weak for a provider",

      description:
        `${weakProvider.provider} shows reduced refund completion performance.`,

      evidence:
        `${weakProvider.completionRate.toFixed(
          2
        )}% completion across ${weakProvider.count} refund records.`,

      recommendedReview:
        "Review provider-specific failures and refund processing behaviour.",
    });
  }

  if (
    previousRefundRate >
      0 &&
    refundRate >=
      previousRefundRate +
        3
  ) {
    insights.push({
      id:
        "refund-rate-increase",

      severity:
        refundRate >=
        previousRefundRate +
          7
          ? "high"
          : "medium",

      category:
        "volume",

      title:
        "Refund rate increased",

      description:
        "Refund value relative to completed payment volume is higher than the preceding equivalent period.",

      evidence:
        `${previousRefundRate.toFixed(
          2
        )}% → ${refundRate.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Compare merchant, reason and provider changes between the periods.",
    });
  }

  if (
    completionRate >=
      95 &&
    failureRate <
      3 &&
    refundRate <
      5
  ) {
    insights.push({
      id:
        "refund-health-good",

      severity:
        "positive",

      category:
        "reliability",

      title:
        "Refund operations are healthy",

      description:
        "Refund completion is high and refund value remains within the current monitoring threshold.",

      evidence:
        `${completionRate.toFixed(
          2
        )}% completion and ${refundRate.toFixed(
          2
        )}% refund-to-payment value rate.`,

      recommendedReview:
        "Continue monitoring merchant concentration and reason distribution.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "refund-stable",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "Refund activity is within current thresholds",

      description:
        "No material refund volume, reliability, latency, merchant, or provider signal was triggered.",

      evidence:
        `${input.current.refundCount} refund records were evaluated.`,

      recommendedReview:
        "Continue monitoring refund volume and completion behaviour.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystRefundAnalytics(
  input: {
    filters:
      AnalystDateFilters;

    status:
      AnalystRefundStatus;
  }
): Promise<AnalystRefundAnalyticsData> {
  const {
    filters,
    status,
  } = input;

  const currentMatch =
    createRefundMatch(
      filters,
      status,
      filters.from,
      filters.to
    );

  const previousMatch =
    createRefundMatch(
      filters,
      status,
      filters.previousFrom,
      filters.previousTo
    );

  const currentPaymentMatch =
    createPaymentMatch(
      filters,
      filters.from,
      filters.to
    );

  const previousPaymentMatch =
    createPaymentMatch(
      filters,
      filters.previousFrom,
      filters.previousTo
    );

  const [
    current,
    previous,

    currentPaymentVolume,
    previousPaymentVolume,

    trend,
    statuses,
    reasons,
    failureReasons,
    providers,
    sources,
  ] =
    await Promise.all([
      loadRefundSummary(
        currentMatch
      ),

      loadRefundSummary(
        previousMatch
      ),

      loadPaymentVolume(
        currentPaymentMatch
      ),

      loadPaymentVolume(
        previousPaymentMatch
      ),

      loadTrend(
        currentMatch,
        filters
      ),

      loadStatuses(
        currentMatch
      ),

      loadReasons(
        currentMatch
      ),

      loadFailureReasons(
        currentMatch
      ),

      loadProviders(
        currentMatch
      ),

      loadSources(
        currentMatch
      ),
    ]);

  const merchants =
    await loadMerchants(
      currentMatch,
      current.completedAmountMinor
    );

  const currentCompletionRate =
    percentage(
      current.completedCount,
      current.refundCount
    );

  const previousCompletionRate =
    percentage(
      previous.completedCount,
      previous.refundCount
    );

  const currentFailureRate =
    percentage(
      current.failedCount,
      current.refundCount
    );

  const previousFailureRate =
    percentage(
      previous.failedCount,
      previous.refundCount
    );

  const currentRefundRate =
    percentage(
      current.completedAmountMinor,
      currentPaymentVolume
    );

  const previousRefundRate =
    percentage(
      previous.completedAmountMinor,
      previousPaymentVolume
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      refunds:
        "mongodb_refund_collection",

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
      refundCount:
        metric(
          current.refundCount,
          previous.refundCount
        ),

      completedRefundCount:
        metric(
          current.completedCount,
          previous.completedCount
        ),

      completedRefundAmountMinor:
        metric(
          current.completedAmountMinor,
          previous.completedAmountMinor
        ),

      completionRate:
        metric(
          currentCompletionRate,
          previousCompletionRate
        ),

      failureRate:
        metric(
          currentFailureRate,
          previousFailureRate
        ),

      refundRate:
        metric(
          currentRefundRate,
          previousRefundRate
        ),

      averageRefundMinor:
        metric(
          current.averageRefundMinor,
          previous.averageRefundMinor
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

      failedCount:
        current.failedCount,

      cancelledCount:
        current.cancelledCount,

      settledCount:
        current.settledCount,

      completedPaymentVolumeMinor:
        currentPaymentVolume,
    },

    trend,

    statuses,

    reasons,

    failureReasons,

    providers,

    sources,

    merchants,

    insights:
      buildInsights({
        current,
        previous,

        currentPaymentVolume,

        previousPaymentVolume,

        providers,

        merchants,
      }),
  };
}