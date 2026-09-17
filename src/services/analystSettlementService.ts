import type {
  PipelineStage,
} from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payout,
} from "../models/Payout.js";

import {
  Settlement,
  type SettlementStatus,
} from "../models/Settlement.js";

import {
  SettlementItem,
} from "../models/SettlementItem.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
} from "../types/analystTypes.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type AnalystSettlementStatus =
  | "all"
  | SettlementStatus;

export interface AnalystSettlementInsight {
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
    | "aging"
    | "merchant"
    | "payout"
    | "reconciliation"
    | "data_quality";

  title: string;

  description: string;

  evidence: string;

  recommendedReview: string;
}

export interface AnalystSettlementAnalyticsData {
  generatedAt: string;

  source: {
    settlements:
      "mongodb_settlement_collection";

    settlementItems:
      "mongodb_settlement_item_collection";

    payouts:
      "mongodb_payout_collection";
  };

  scopeNote: string;

  filters: {
    range:
      AnalystDateFilters["range"];

    currency:
      string;

    status:
      AnalystSettlementStatus;

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
    settlementCount:
      AnalystMetric;

    settledCount:
      AnalystMetric;

    grossAmountMinor:
      AnalystMetric;

    feeAmountMinor:
      AnalystMetric;

    refundAmountMinor:
      AnalystMetric;

    netAmountMinor:
      AnalystMetric;

    settlementRate:
      AnalystMetric;

    averageSettlementSeconds:
      AnalystMetric;
  };

  operations: {
    pendingCount: number;

    processingCount: number;

    failedCount: number;

    cancelledCount: number;

    paymentCount: number;

    settlementItemCount: number;

    releasedItemCount: number;

    payoutLinkedCount: number;

    payoutLinkRate: number;
  };

  payoutReconciliation: {
    linkedSettlementCount: number;

    unlinkedSettlementCount: number;

    pendingPayoutCount: number;

    processingPayoutCount: number;

    completedPayoutCount: number;

    failedPayoutCount: number;

    cancelledPayoutCount: number;

    linkedSettlementNetMinor: number;

    payoutNetMinor: number;

    differenceMinor: number;
  };

  trend: Array<{
    bucket: string;

    settlementCount: number;

    settledCount: number;

    pendingCount: number;

    processingCount: number;

    failedCount: number;

    netAmountMinor: number;
  }>;

  statuses: Array<{
    status: string;

    count: number;

    percentage: number;

    netAmountMinor: number;
  }>;

  aging: Array<{
    key:
      | "0_1d"
      | "1_3d"
      | "3_7d"
      | "7d_plus";

    label: string;

    count: number;

    percentage: number;

    netAmountMinor: number;
  }>;

  payoutMethods: Array<{
    method: string;

    count: number;

    percentage: number;

    netAmountMinor: number;
  }>;

  failureReasons: Array<{
    reason: string;

    count: number;

    percentage: number;
  }>;

  merchants: Array<{
    merchantId: string;

    businessName: string;

    settlementCount: number;

    settledCount: number;

    pendingCount: number;

    failedCount: number;

    grossAmountMinor: number;

    feeAmountMinor: number;

    refundAmountMinor: number;

    netAmountMinor: number;

    netShare: number;

    settlementRate: number;
  }>;

  insights:
    AnalystSettlementInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface SummaryRow {
  settlementCount?: unknown;

  pendingCount?: unknown;

  processingCount?: unknown;

  settledCount?: unknown;

  failedCount?: unknown;

  cancelledCount?: unknown;

  paymentCount?: unknown;

  itemCount?: unknown;

  releasedItemCount?: unknown;

  payoutLinkedCount?: unknown;

  grossAmountMinor?: unknown;

  feeAmountMinor?: unknown;

  refundAmountMinor?: unknown;

  adjustmentAmountMinor?: unknown;

  netAmountMinor?: unknown;

  averageSettlementSeconds?: unknown;
}

interface TrendRow {
  _id?: unknown;

  settlementCount?: unknown;

  settledCount?: unknown;

  pendingCount?: unknown;

  processingCount?: unknown;

  failedCount?: unknown;

  netAmountMinor?: unknown;
}

interface StatusRow {
  _id?: unknown;

  count?: unknown;

  netAmountMinor?: unknown;
}

interface AgingRow {
  _id?: unknown;

  count?: unknown;

  netAmountMinor?: unknown;
}

interface FailureRow {
  _id?: unknown;

  count?: unknown;
}

interface MerchantRow {
  _id?: unknown;

  businessName?: unknown;

  settlementCount?: unknown;

  settledCount?: unknown;

  pendingCount?: unknown;

  failedCount?: unknown;

  grossAmountMinor?: unknown;

  feeAmountMinor?: unknown;

  refundAmountMinor?: unknown;

  netAmountMinor?: unknown;
}

interface ReconciliationRow {
  linkedSettlementCount?: unknown;

  unlinkedSettlementCount?: unknown;

  pendingPayoutCount?: unknown;

  processingPayoutCount?: unknown;

  completedPayoutCount?: unknown;

  failedPayoutCount?: unknown;

  cancelledPayoutCount?: unknown;

  linkedSettlementNetMinor?: unknown;

  payoutNetMinor?: unknown;
}

interface PayoutMethodRow {
  _id?: unknown;

  count?: unknown;

  netAmountMinor?: unknown;
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
    total <= 0
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
    previous === 0
  ) {
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
    value !== undefined &&
    value !== null
  ) {
    const text =
      String(value);

    if (
      text.trim()
    ) {
      return text;
    }
  }

  return fallback;
}

/* =========================================================
   DECIMAL128 -> MINOR
========================================================= */

function decimalToMinor(
  field: string
): Record<string, unknown> {
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
   MATCH
========================================================= */

function createSettlementMatch(
  filters:
    AnalystDateFilters,
  status:
    AnalystSettlementStatus,
  from:
    Date,
  to:
    Date
): Record<string, unknown> {
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
    status !==
    "all"
  ) {
    match.status =
      status;
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
) {
  const pipeline:
    PipelineStage[] = [
      {
        $match:
          match,
      },

      {
        $lookup: {
          from:
            SettlementItem.collection
              .name,

          localField:
            "_id",

          foreignField:
            "settlementId",

          as:
            "items",
        },
      },

      {
        $addFields: {
          grossMinor:
            decimalToMinor(
              "$grossAmount"
            ),

          feeMinor:
            decimalToMinor(
              "$feeAmount"
            ),

          refundMinor:
            decimalToMinor(
              "$refundAmount"
            ),

          adjustmentMinor:
            decimalToMinor(
              "$adjustmentAmount"
            ),

          netMinor:
            decimalToMinor(
              "$netAmount"
            ),

          itemCountValue: {
            $size:
              "$items",
          },

          releasedItemCountValue: {
            $size: {
              $filter: {
                input:
                  "$items",

                as:
                  "item",

                cond: {
                  $eq: [
                    "$$item.status",
                    "released",
                  ],
                },
              },
            },
          },

          settlementSeconds: {
            $cond: [
              {
                $and: [
                  {
                    $eq: [
                      "$status",
                      "settled",
                    ],
                  },

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
                ],
              },

              {
                $divide: [
                  {
                    $subtract: [
                      "$settledAt",
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

          settlementCount: {
            $sum:
              1,
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

          settledCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "settled",
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

          paymentCount: {
            $sum:
              "$paymentCount",
          },

          itemCount: {
            $sum:
              "$itemCountValue",
          },

          releasedItemCount: {
            $sum:
              "$releasedItemCountValue",
          },

          payoutLinkedCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        {
                          $ifNull: [
                            "$payoutId",
                            null,
                          ],
                        },

                        null,
                      ],
                    },

                    {
                      $ne: [
                        "$payoutId",
                        "",
                      ],
                    },
                  ],
                },

                1,
                0,
              ],
            },
          },

          grossAmountMinor: {
            $sum:
              "$grossMinor",
          },

          feeAmountMinor: {
            $sum:
              "$feeMinor",
          },

          refundAmountMinor: {
            $sum:
              "$refundMinor",
          },

          adjustmentAmountMinor: {
            $sum:
              "$adjustmentMinor",
          },

          netAmountMinor: {
            $sum:
              "$netMinor",
          },

          averageSettlementSeconds: {
            $avg:
              "$settlementSeconds",
          },
        },
      },
    ];

  const rows =
    await Settlement.aggregate<SummaryRow>(
      pipeline
    );

  const row =
    rows[0];

  return {
    settlementCount:
      safeInteger(
        row?.settlementCount
      ),

    pendingCount:
      safeInteger(
        row?.pendingCount
      ),

    processingCount:
      safeInteger(
        row?.processingCount
      ),

    settledCount:
      safeInteger(
        row?.settledCount
      ),

    failedCount:
      safeInteger(
        row?.failedCount
      ),

    cancelledCount:
      safeInteger(
        row?.cancelledCount
      ),

    paymentCount:
      safeInteger(
        row?.paymentCount
      ),

    itemCount:
      safeInteger(
        row?.itemCount
      ),

    releasedItemCount:
      safeInteger(
        row?.releasedItemCount
      ),

    payoutLinkedCount:
      safeInteger(
        row?.payoutLinkedCount
      ),

    grossAmountMinor:
      safeInteger(
        row?.grossAmountMinor
      ),

    feeAmountMinor:
      safeInteger(
        row?.feeAmountMinor
      ),

    refundAmountMinor:
      safeInteger(
        row?.refundAmountMinor
      ),

    adjustmentAmountMinor:
      safeInteger(
        row?.adjustmentAmountMinor
      ),

    netAmountMinor:
      safeInteger(
        row?.netAmountMinor
      ),

    averageSettlementSeconds:
      round(
        safeNumber(
          row?.averageSettlementSeconds
        )
      ),
  };
}

/* =========================================================
   BUCKET KEYS
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
  match:
    Record<
      string,
      unknown
    >,
  filters:
    AnalystDateFilters
): Promise<
  AnalystSettlementAnalyticsData[
    "trend"
  ]
> {
  const rows =
    await Settlement.aggregate<TrendRow>(
      [
        {
          $match:
            match,
        },

        {
          $addFields: {
            netMinor:
              decimalToMinor(
                "$netAmount"
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

            settlementCount: {
              $sum:
                1,
            },

            settledCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "settled",
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

            netAmountMinor: {
              $sum:
                "$netMinor",
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

      return {
        bucket,

        settlementCount:
          safeInteger(
            row?.settlementCount
          ),

        settledCount:
          safeInteger(
            row?.settledCount
          ),

        pendingCount:
          safeInteger(
            row?.pendingCount
          ),

        processingCount:
          safeInteger(
            row?.processingCount
          ),

        failedCount:
          safeInteger(
            row?.failedCount
          ),

        netAmountMinor:
          safeInteger(
            row?.netAmountMinor
          ),
      };
    }
  );
}

/* =========================================================
   STATUS DISTRIBUTION
========================================================= */

async function loadStatuses(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystSettlementAnalyticsData[
    "statuses"
  ]
> {
  const rows =
    await Settlement.aggregate<StatusRow>(
      [
        {
          $match:
            match,
        },

        {
          $addFields: {
            netMinor:
              decimalToMinor(
                "$netAmount"
              ),
          },
        },

        {
          $group: {
            _id:
              "$status",

            count: {
              $sum:
                1,
            },

            netAmountMinor: {
              $sum:
                "$netMinor",
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

        netAmountMinor:
          safeInteger(
            row.netAmountMinor
          ),
      };
    }
  );
}

/* =========================================================
   AGING
========================================================= */

async function loadAging(
  filters:
    AnalystDateFilters
): Promise<
  AnalystSettlementAnalyticsData[
    "aging"
  ]
> {
  const rows =
    await Settlement.aggregate<AgingRow>(
      [
        {
          $match: {
            currency:
              filters.currency,

            status: {
              $in: [
                "pending",
                "processing",
              ],
            },
          },
        },

        {
          $addFields: {
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

            netMinor:
              decimalToMinor(
                "$netAmount"
              ),
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
                ],

                default:
                  "7d_plus",
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

            netAmountMinor: {
              $sum:
                "$netMinor",
            },
          },
        },
      ]
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
        "7d_plus" as const,

      label:
        "7+ days",
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
      item
    ) => {
      const row =
        map.get(
          item.key
        );

      const count =
        safeInteger(
          row?.count
        );

      return {
        key:
          item.key,

        label:
          item.label,

        count,

        percentage:
          percentage(
            count,
            total
          ),

        netAmountMinor:
          safeInteger(
            row?.netAmountMinor
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
  AnalystSettlementAnalyticsData[
    "failureReasons"
  ]
> {
  const rows =
    await Settlement.aggregate<FailureRow>(
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
              $cond: [
                {
                  $and: [
                    {
                      $ne: [
                        "$failureReason",
                        null,
                      ],
                    },

                    {
                      $ne: [
                        "$failureReason",
                        "",
                      ],
                    },
                  ],
                },

                "$failureReason",

                "unspecified",
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
        reason:
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
   MERCHANT PERFORMANCE
========================================================= */

async function loadMerchants(
  match:
    Record<
      string,
      unknown
    >,
  totalNetMinor:
    number
): Promise<
  AnalystSettlementAnalyticsData[
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
        $addFields: {
          grossMinor:
            decimalToMinor(
              "$grossAmount"
            ),

          feeMinor:
            decimalToMinor(
              "$feeAmount"
            ),

          refundMinor:
            decimalToMinor(
              "$refundAmount"
            ),

          netMinor:
            decimalToMinor(
              "$netAmount"
            ),
        },
      },

      {
        $group: {
          _id:
            "$merchantId",

          settlementCount: {
            $sum:
              1,
          },

          settledCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "settled",
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
                      "processing",
                    ],
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

          grossAmountMinor: {
            $sum:
              "$grossMinor",
          },

          feeAmountMinor: {
            $sum:
              "$feeMinor",
          },

          refundAmountMinor: {
            $sum:
              "$refundMinor",
          },

          netAmountMinor: {
            $sum:
              "$netMinor",
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

          settlementCount:
            1,

          settledCount:
            1,

          pendingCount:
            1,

          failedCount:
            1,

          grossAmountMinor:
            1,

          feeAmountMinor:
            1,

          refundAmountMinor:
            1,

          netAmountMinor:
            1,
        },
      },

      {
        $sort: {
          netAmountMinor:
            -1,
        },
      },

      {
        $limit:
          12,
      },
    ];

  const rows =
    await Settlement.aggregate<MerchantRow>(
      pipeline
    );

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.settlementCount
        );

      const settled =
        safeInteger(
          row.settledCount
        );

      const net =
        safeInteger(
          row.netAmountMinor
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

        settlementCount:
          count,

        settledCount:
          settled,

        pendingCount:
          safeInteger(
            row.pendingCount
          ),

        failedCount:
          safeInteger(
            row.failedCount
          ),

        grossAmountMinor:
          safeInteger(
            row.grossAmountMinor
          ),

        feeAmountMinor:
          safeInteger(
            row.feeAmountMinor
          ),

        refundAmountMinor:
          safeInteger(
            row.refundAmountMinor
          ),

        netAmountMinor:
          net,

        netShare:
          percentage(
            net,
            totalNetMinor
          ),

        settlementRate:
          percentage(
            settled,
            count
          ),
      };
    }
  );
}

/* =========================================================
   PAYOUT RECONCILIATION
========================================================= */

async function loadPayoutReconciliation(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystSettlementAnalyticsData[
    "payoutReconciliation"
  ]
> {
  const pipeline:
    PipelineStage[] = [
      {
        $match:
          match,
      },

      {
        $addFields: {
          settlementNetMinor:
            decimalToMinor(
              "$netAmount"
            ),
        },
      },

      {
        $lookup: {
          from:
            Payout.collection
              .name,

          localField:
            "payoutId",

          foreignField:
            "payoutId",

          as:
            "payout",
        },
      },

      {
        $unwind: {
          path:
            "$payout",

          preserveNullAndEmptyArrays:
            true,
        },
      },

      {
        $addFields: {
          payoutNetMinor: {
            $cond: [
              {
                $ne: [
                  {
                    $ifNull: [
                      "$payout._id",
                      null,
                    ],
                  },

                  null,
                ],
              },

              decimalToMinor(
                "$payout.netAmount"
              ),

              0,
            ],
          },

          hasPayout: {
            $ne: [
              {
                $ifNull: [
                  "$payout._id",
                  null,
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

          linkedSettlementCount: {
            $sum: {
              $cond: [
                "$hasPayout",
                1,
                0,
              ],
            },
          },

          unlinkedSettlementCount: {
            $sum: {
              $cond: [
                "$hasPayout",
                0,
                1,
              ],
            },
          },

          pendingPayoutCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$payout.status",
                    "pending",
                  ],
                },

                1,
                0,
              ],
            },
          },

          processingPayoutCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$payout.status",
                    "processing",
                  ],
                },

                1,
                0,
              ],
            },
          },

          completedPayoutCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$payout.status",
                    "completed",
                  ],
                },

                1,
                0,
              ],
            },
          },

          failedPayoutCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$payout.status",
                    "failed",
                  ],
                },

                1,
                0,
              ],
            },
          },

          cancelledPayoutCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$payout.status",
                    "cancelled",
                  ],
                },

                1,
                0,
              ],
            },
          },

          linkedSettlementNetMinor: {
            $sum: {
              $cond: [
                "$hasPayout",

                "$settlementNetMinor",

                0,
              ],
            },
          },

          payoutNetMinor: {
            $sum:
              "$payoutNetMinor",
          },
        },
      },
    ];

  const rows =
    await Settlement.aggregate<ReconciliationRow>(
      pipeline
    );

  const row =
    rows[0];

  const settlementNet =
    safeInteger(
      row?.linkedSettlementNetMinor
    );

  const payoutNet =
    safeInteger(
      row?.payoutNetMinor
    );

  return {
    linkedSettlementCount:
      safeInteger(
        row?.linkedSettlementCount
      ),

    unlinkedSettlementCount:
      safeInteger(
        row?.unlinkedSettlementCount
      ),

    pendingPayoutCount:
      safeInteger(
        row?.pendingPayoutCount
      ),

    processingPayoutCount:
      safeInteger(
        row?.processingPayoutCount
      ),

    completedPayoutCount:
      safeInteger(
        row?.completedPayoutCount
      ),

    failedPayoutCount:
      safeInteger(
        row?.failedPayoutCount
      ),

    cancelledPayoutCount:
      safeInteger(
        row?.cancelledPayoutCount
      ),

    linkedSettlementNetMinor:
      settlementNet,

    payoutNetMinor:
      payoutNet,

    differenceMinor:
      settlementNet -
      payoutNet,
  };
}

/* =========================================================
   PAYOUT METHODS
========================================================= */

async function loadPayoutMethods(
  match:
    Record<
      string,
      unknown
    >
): Promise<
  AnalystSettlementAnalyticsData[
    "payoutMethods"
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
            Payout.collection
              .name,

          localField:
            "payoutId",

          foreignField:
            "payoutId",

          as:
            "payout",
        },
      },

      {
        $unwind: {
          path:
            "$payout",

          preserveNullAndEmptyArrays:
            false,
        },
      },

      {
        $addFields: {
          payoutNetMinor:
            decimalToMinor(
              "$payout.netAmount"
            ),
        },
      },

      {
        $group: {
          _id: {
            $ifNull: [
              "$payout.payoutMethod",
              "unknown",
            ],
          },

          count: {
            $sum:
              1,
          },

          netAmountMinor: {
            $sum:
              "$payoutNetMinor",
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
    await Settlement.aggregate<PayoutMethodRow>(
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
        method:
          stringValue(
            row._id
          ),

        count,

        percentage:
          percentage(
            count,
            total
          ),

        netAmountMinor:
          safeInteger(
            row.netAmountMinor
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

    merchants:
      AnalystSettlementAnalyticsData[
        "merchants"
      ];

    reconciliation:
      AnalystSettlementAnalyticsData[
        "payoutReconciliation"
      ];
  }
): AnalystSettlementInsight[] {
  const insights:
    AnalystSettlementInsight[] =
    [];

  if (
    input.current
        .settlementCount ===
    0
  ) {
    return [
      {
        id:
          "settlement-no-data",

        severity:
          "info",

        category:
          "data_quality",

        title:
          "No settlement activity",

        description:
          "No settlement records matched the selected analytics filters.",

        evidence:
          "0 matching settlements.",

        recommendedReview:
          "Adjust the analytics period, currency, or settlement status.",
      },
    ];
  }

  const settlementRate =
    percentage(
      input.current
        .settledCount,
      input.current
        .settlementCount
    );

  const failureRate =
    percentage(
      input.current
        .failedCount,
      input.current
        .settlementCount
    );

  const openCount =
    input.current
      .pendingCount +
    input.current
      .processingCount;

  if (
    failureRate >=
      10 &&
    input.current
        .settlementCount >=
      5
  ) {
    insights.push({
      id:
        "settlement-failure-rate",

      severity:
        failureRate >=
        25
          ? "high"
          : "medium",

      category:
        "reliability",

      title:
        "Settlement failures are elevated",

      description:
        "A meaningful share of settlements ended in failed status.",

      evidence:
        `${input.current.failedCount} of ${input.current.settlementCount} settlements failed (${failureRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Review settlement failure reasons before retrying or changing operational policy.",
    });
  }

  if (
    openCount >=
      5
  ) {
    insights.push({
      id:
        "settlement-backlog",

      severity:
        openCount >=
        15
          ? "high"
          : "medium",

      category:
        "aging",

      title:
        "Settlement backlog requires review",

      description:
        "Multiple settlements remain pending or processing.",

      evidence:
        `${openCount} settlements are currently pending or processing.`,

      recommendedReview:
        "Review settlement aging and downstream payout processing.",
    });
  }

  if (
    input.current
        .averageSettlementSeconds >
      86400 &&
    input.current
        .settledCount >=
      3
  ) {
    insights.push({
      id:
        "settlement-latency",

      severity:
        input.current
            .averageSettlementSeconds >
        259200
          ? "high"
          : "medium",

      category:
        "aging",

      title:
        "Settlement completion latency is elevated",

      description:
        "Completed settlements are taking longer than the current operational threshold.",

      evidence:
        `Average settlement completion time is ${(
          input.current
            .averageSettlementSeconds /
          3600
        ).toFixed(
          1
        )} hours.`,

      recommendedReview:
        "Compare pending settlement age with payout and reconciliation state.",
    });
  }

  const topMerchant =
    input.merchants[0];

  if (
    topMerchant &&
    topMerchant.netShare >=
      50
  ) {
    insights.push({
      id:
        "settlement-merchant-concentration",

      severity:
        topMerchant.netShare >=
        70
          ? "high"
          : "medium",

      category:
        "merchant",

      title:
        "Settlement value is merchant-concentrated",

      description:
        "One merchant contributes a large share of settlement net value.",

      evidence:
        `${topMerchant.businessName} represents ${topMerchant.netShare.toFixed(
          2
        )}% of settlement net value.`,

      recommendedReview:
        "Compare concentration with merchant payment volume and refund exposure.",
    });
  }

  if (
    input.reconciliation
        .failedPayoutCount >
      0
  ) {
    insights.push({
      id:
        "settlement-payout-failures",

      severity:
        input.reconciliation
            .failedPayoutCount >=
        5
          ? "high"
          : "medium",

      category:
        "payout",

      title:
        "Linked payout failures detected",

      description:
        "One or more payouts associated with settlements are in failed state.",

      evidence:
        `${input.reconciliation.failedPayoutCount} linked payouts failed.`,

      recommendedReview:
        "Review payout failure reasons and ledger state before any operational retry.",
    });
  }

  if (
    input.reconciliation
        .linkedSettlementCount >
      0 &&
    Math.abs(
      input.reconciliation
        .differenceMinor
    ) >
      1
  ) {
    insights.push({
      id:
        "settlement-payout-difference",

      severity:
        "medium",

      category:
        "reconciliation",

      title:
        "Settlement and payout linked values differ",

      description:
        "The combined settlement net value and linked payout net value are not identical.",

      evidence:
        `Linked value difference is ${(
          input.reconciliation
            .differenceMinor /
          100
        ).toFixed(
          2
        )}.`,

      recommendedReview:
        "Confirm whether payout grouping, partial payout, or payout fees explain the difference before treating it as an error.",
    });
  }

  if (
    settlementRate >=
      95 &&
    failureRate <
      3
  ) {
    insights.push({
      id:
        "settlement-health-positive",

      severity:
        "positive",

      category:
        "reliability",

      title:
        "Settlement processing is healthy",

      description:
        "Settlement completion is high and failure levels remain low.",

      evidence:
        `${settlementRate.toFixed(
          2
        )}% settlement completion rate and ${failureRate.toFixed(
          2
        )}% failure rate.`,

      recommendedReview:
        "Continue monitoring aging and payout reconciliation.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "settlement-stable",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "Settlement indicators are within current thresholds",

      description:
        "No major deterministic settlement anomaly was triggered.",

      evidence:
        `${input.current.settlementCount} settlements were evaluated.`,

      recommendedReview:
        "Continue monitoring settlement reliability, aging and payout linkage.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystSettlementAnalytics(
  input: {
    filters:
      AnalystDateFilters;

    status:
      AnalystSettlementStatus;
  }
): Promise<AnalystSettlementAnalyticsData> {
  const {
    filters,
    status,
  } = input;

  const currentMatch =
    createSettlementMatch(
      filters,
      status,
      filters.from,
      filters.to
    );

  const previousMatch =
    createSettlementMatch(
      filters,
      status,
      filters.previousFrom,
      filters.previousTo
    );

  const [
    current,
    previous,

    trend,
    statuses,
    aging,

    reconciliation,
    payoutMethods,

    failureReasons,
  ] =
    await Promise.all([
      loadSummary(
        currentMatch
      ),

      loadSummary(
        previousMatch
      ),

      loadTrend(
        currentMatch,
        filters
      ),

      loadStatuses(
        currentMatch
      ),

      loadAging(
        filters
      ),

      loadPayoutReconciliation(
        currentMatch
      ),

      loadPayoutMethods(
        currentMatch
      ),

      loadFailureReasons(
        currentMatch
      ),
    ]);

  const merchants =
    await loadMerchants(
      currentMatch,
      current.netAmountMinor
    );

  const currentSettlementRate =
    percentage(
      current.settledCount,
      current.settlementCount
    );

  const previousSettlementRate =
    percentage(
      previous.settledCount,
      previous.settlementCount
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      settlements:
        "mongodb_settlement_collection",

      settlementItems:
        "mongodb_settlement_item_collection",

      payouts:
        "mongodb_payout_collection",
    },

    scopeNote:
      "Settlement records do not contain a Test/Live environment dimension. Analytics is therefore filtered by settlement creation time, currency and status.",

    filters: {
      range:
        filters.range,

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
      settlementCount:
        metric(
          current.settlementCount,
          previous.settlementCount
        ),

      settledCount:
        metric(
          current.settledCount,
          previous.settledCount
        ),

      grossAmountMinor:
        metric(
          current.grossAmountMinor,
          previous.grossAmountMinor
        ),

      feeAmountMinor:
        metric(
          current.feeAmountMinor,
          previous.feeAmountMinor
        ),

      refundAmountMinor:
        metric(
          current.refundAmountMinor,
          previous.refundAmountMinor
        ),

      netAmountMinor:
        metric(
          current.netAmountMinor,
          previous.netAmountMinor
        ),

      settlementRate:
        metric(
          currentSettlementRate,
          previousSettlementRate
        ),

      averageSettlementSeconds:
        metric(
          current.averageSettlementSeconds,
          previous.averageSettlementSeconds
        ),
    },

    operations: {
      pendingCount:
        current.pendingCount,

      processingCount:
        current.processingCount,

      failedCount:
        current.failedCount,

      cancelledCount:
        current.cancelledCount,

      paymentCount:
        current.paymentCount,

      settlementItemCount:
        current.itemCount,

      releasedItemCount:
        current.releasedItemCount,

      payoutLinkedCount:
        current.payoutLinkedCount,

      payoutLinkRate:
        percentage(
          current.payoutLinkedCount,
          current.settlementCount
        ),
    },

    payoutReconciliation:
      reconciliation,

    trend,

    statuses,

    aging,

    payoutMethods,

    failureReasons,

    merchants,

    insights:
      buildInsights({
        current,
        previous,

        merchants,

        reconciliation,
      }),
  };
}