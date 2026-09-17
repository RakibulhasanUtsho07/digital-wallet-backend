import {
  Payment,
} from "../models/Payment.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  User,
} from "../models/User.js";

import {
  Wallet,
} from "../models/Wallet.js";

/* =========================================================
   TYPES
========================================================= */

export type AnalystWalletRange =
  | "24h"
  | "7d"
  | "30d"
  | "90d";

export type AnalystWalletStatus =
  | "healthy"
  | "attention"
  | "critical";

export interface AnalystWalletMetric {
  value: number;
  previousValue: number;
  changePercent:
    number | null;
}

export interface AnalystWalletInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "engagement"
    | "merchant_payment"
    | "p2p"
    | "wallet_status"
    | "retention"
    | "data_quality";

  title: string;

  description: string;

  evidence: string;

  recommendedReview: string;
}

interface AnalystWalletFilters {
  range:
    AnalystWalletRange;

  currency:
    string;
}

interface RangeBoundary {
  range:
    AnalystWalletRange;

  bucket:
    "hour"
    | "day";

  bucketCount:
    number;

  bucketMs:
    number;

  from:
    Date;

  to:
    Date;

  previousFrom:
    Date;

  previousTo:
    Date;
}

interface TransactionPeriodResult {
  total:
    number;

  p2pCount:
    number;

  fundingCount:
    number;

  withdrawalCount:
    number;

  transactionWalletIds:
    string[];

  p2pWalletIds:
    string[];

  fundingWalletIds:
    string[];

  withdrawalWalletIds:
    string[];

  activityByUser:
    Map<
      string,
      number
    >;
}

interface PaymentPeriodResult {
  merchantPaymentCount:
    number;

  merchantPayingWalletIds:
    string[];

  activityByUser:
    Map<
      string,
      number
    >;
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(
  value:
    unknown
): number {
  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  if (
    typeof value ===
    "string"
  ) {
    const parsed =
      Number(
        value
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "toString" in
      value
  ) {
    const parsed =
      Number(
        String(
          value
        )
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  return 0;
}

function round(
  value:
    number,
  digits =
    2
): number {
  const factor =
    10 **
    digits;

  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        factor
    ) /
    factor
  );
}

function percentage(
  part:
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
      part /
      total
    ) *
      100
  );
}

function calculateChange(
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
): AnalystWalletMetric {
  return {
    value:
      current,

    previousValue:
      previous,

    changePercent:
      calculateChange(
        current,
        previous
      ),
  };
}

function majorToMinor(
  value:
    unknown
): number {
  return Math.round(
    safeNumber(
      value
    ) *
      100
  );
}

/* =========================================================
   RANGE
========================================================= */

function normalizeBucketStart(
  date:
    Date,
  bucket:
    "hour"
    | "day"
): Date {
  const value =
    new Date(
      date
    );

  if (
    bucket ===
    "hour"
  ) {
    value.setUTCMinutes(
      0,
      0,
      0
    );

    return value;
  }

  value.setUTCHours(
    0,
    0,
    0
  );

  return value;
}

function getRangeBoundary(
  range:
    AnalystWalletRange
): RangeBoundary {
  const now =
    new Date();

  const config =
    {
      "24h": {
        bucket:
          "hour" as const,

        bucketCount:
          24,

        bucketMs:
          60 *
          60 *
          1000,
      },

      "7d": {
        bucket:
          "day" as const,

        bucketCount:
          7,

        bucketMs:
          24 *
          60 *
          60 *
          1000,
      },

      "30d": {
        bucket:
          "day" as const,

        bucketCount:
          30,

        bucketMs:
          24 *
          60 *
          60 *
          1000,
      },

      "90d": {
        bucket:
          "day" as const,

        bucketCount:
          90,

        bucketMs:
          24 *
          60 *
          60 *
          1000,
      },
    }[
      range
    ];

  const bucketStart =
    normalizeBucketStart(
      now,
      config.bucket
    );

  const from =
    new Date(
      bucketStart.getTime() -
        (
          config.bucketCount -
          1
        ) *
          config.bucketMs
    );

  const previousTo =
    new Date(
      from
    );

  const previousFrom =
    new Date(
      previousTo.getTime() -
        config.bucketCount *
          config.bucketMs
    );

  return {
    range,

    bucket:
      config.bucket,

    bucketCount:
      config.bucketCount,

    bucketMs:
      config.bucketMs,

    from,

    to:
      now,

    previousFrom,

    previousTo,
  };
}

/* =========================================================
   BUCKET
========================================================= */

function bucketExpression(
  field:
    string,
  bucket:
    "hour"
    | "day"
) {
  return {
    $dateToString: {
      date:
        field,

      format:
        bucket ===
        "hour"
          ? "%Y-%m-%dT%H:00:00.000Z"
          : "%Y-%m-%dT00:00:00.000Z",

      timezone:
        "UTC",
    },
  };
}

function bucketKey(
  date:
    Date,
  bucket:
    "hour"
    | "day"
): string {
  if (
    bucket ===
    "hour"
  ) {
    return (
      date
        .toISOString()
        .slice(
          0,
          13
        ) +
      ":00:00.000Z"
    );
  }

  return (
    date
      .toISOString()
      .slice(
        0,
        10
      ) +
    "T00:00:00.000Z"
  );
}

/* =========================================================
   ID HELPERS
========================================================= */

function stringId(
  value:
    unknown
): string {
  if (
    !value
  ) {
    return "";
  }

  return String(
    value
  );
}

function uniqueStrings(
  values:
    string[]
): string[] {
  return [
    ...new Set(
      values.filter(
        Boolean
      )
    ),
  ];
}

/* =========================================================
   TRANSACTION PERIOD

   IMPORTANT:
   Transaction amount is intentionally NOT read or decrypted.
========================================================= */

async function loadTransactionPeriod(
  userIds:
    unknown[],
  currency:
    string,
  from:
    Date,
  to:
    Date
): Promise<TransactionPeriodResult> {
  if (
    userIds.length ===
    0
  ) {
    return {
      total:
        0,

      p2pCount:
        0,

      fundingCount:
        0,

      withdrawalCount:
        0,

      transactionWalletIds:
        [],

      p2pWalletIds:
        [],

      fundingWalletIds:
        [],

      withdrawalWalletIds:
        [],

      activityByUser:
        new Map(),
    };
  }

  const rows =
    await Transaction.aggregate<{
      summary:
        Array<{
          total?:
            number;

          p2pCount?:
            number;

          fundingCount?:
            number;

          withdrawalCount?:
            number;
        }>;

      wallets:
        Array<{
          _id:
            unknown;

          activityCount:
            number;

          types:
            string[];
        }>;
    }>([
      {
        $match: {
          createdAt: {
            $gte:
              from,

            $lt:
              to,
          },

          currency,

          status:
            "COMPLETED",

          $or: [
            {
              senderId: {
                $in:
                  userIds,
              },
            },

            {
              receiverId: {
                $in:
                  userIds,
              },
            },
          ],
        },
      },

      {
        $project: {
          type:
            1,

          participants: {
            $setUnion: [
              [
                "$senderId",
              ],

              [
                "$receiverId",
              ],
            ],
          },
        },
      },

      {
        $facet: {
          summary: [
            {
              $group: {
                _id:
                  null,

                total: {
                  $sum:
                    1,
                },

                p2pCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$type",
                          "TRANSFER",
                        ],
                      },

                      1,

                      0,
                    ],
                  },
                },

                fundingCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$type",
                          "DEPOSIT",
                        ],
                      },

                      1,

                      0,
                    ],
                  },
                },

                withdrawalCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$type",
                          "WITHDRAW",
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

          wallets: [
            {
              $unwind:
                "$participants",
            },

            {
              $match: {
                participants: {
                  $in:
                    userIds,
                },
              },
            },

            {
              $group: {
                _id:
                  "$participants",

                activityCount: {
                  $sum:
                    1,
                },

                types: {
                  $addToSet:
                    "$type",
                },
              },
            },
          ],
        },
      },
    ]);

  const result =
    rows[0];

  const summary =
    result?.summary?.[0];

  const wallets =
    result?.wallets ??
    [];

  const activityByUser =
    new Map<
      string,
      number
    >();

  const transactionWalletIds:
    string[] =
    [];

  const p2pWalletIds:
    string[] =
    [];

  const fundingWalletIds:
    string[] =
    [];

  const withdrawalWalletIds:
    string[] =
    [];

  for (
    const wallet of
    wallets
  ) {
    const id =
      stringId(
        wallet._id
      );

    if (
      !id
    ) {
      continue;
    }

    transactionWalletIds.push(
      id
    );

    activityByUser.set(
      id,
      safeNumber(
        wallet.activityCount
      )
    );

    if (
      wallet.types?.includes(
        "TRANSFER"
      )
    ) {
      p2pWalletIds.push(
        id
      );
    }

    if (
      wallet.types?.includes(
        "DEPOSIT"
      )
    ) {
      fundingWalletIds.push(
        id
      );
    }

    if (
      wallet.types?.includes(
        "WITHDRAW"
      )
    ) {
      withdrawalWalletIds.push(
        id
      );
    }
  }

  return {
    total:
      safeNumber(
        summary?.total
      ),

    p2pCount:
      safeNumber(
        summary?.p2pCount
      ),

    fundingCount:
      safeNumber(
        summary?.fundingCount
      ),

    withdrawalCount:
      safeNumber(
        summary?.withdrawalCount
      ),

    transactionWalletIds:
      uniqueStrings(
        transactionWalletIds
      ),

    p2pWalletIds:
      uniqueStrings(
        p2pWalletIds
      ),

    fundingWalletIds:
      uniqueStrings(
        fundingWalletIds
      ),

    withdrawalWalletIds:
      uniqueStrings(
        withdrawalWalletIds
      ),

    activityByUser,
  };
}

/* =========================================================
   MERCHANT WALLET PAYMENT PERIOD

   Only completed LIVE Coffer wallet payments are included.
========================================================= */

async function loadPaymentPeriod(
  userIds:
    unknown[],
  currency:
    string,
  from:
    Date,
  to:
    Date
): Promise<PaymentPeriodResult> {
  if (
    userIds.length ===
    0
  ) {
    return {
      merchantPaymentCount:
        0,

      merchantPayingWalletIds:
        [],

      activityByUser:
        new Map(),
    };
  }

  const rows =
    await Payment.aggregate<{
      summary:
        Array<{
          count:
            number;
        }>;

      wallets:
        Array<{
          _id:
            unknown;

          count:
            number;
        }>;
    }>([
      {
        $match: {
          customerId: {
            $in:
              userIds,
          },

          currency,

          mode:
            "live",

          sourceType:
            "wallet",

          status:
            "completed",

          completedAt: {
            $gte:
              from,

            $lt:
              to,
          },
        },
      },

      {
        $facet: {
          summary: [
            {
              $count:
                "count",
            },
          ],

          wallets: [
            {
              $group: {
                _id:
                  "$customerId",

                count: {
                  $sum:
                    1,
                },
              },
            },
          ],
        },
      },
    ]);

  const result =
    rows[0];

  const merchantPayingWalletIds =
    (
      result?.wallets ??
      []
    )
      .map(
        (
          row
        ) =>
          stringId(
            row._id
          )
      )
      .filter(
        Boolean
      );

  const activityByUser =
    new Map<
      string,
      number
    >();

  for (
    const wallet of
    result?.wallets ??
    []
  ) {
    const id =
      stringId(
        wallet._id
      );

    if (
      id
    ) {
      activityByUser.set(
        id,
        safeNumber(
          wallet.count
        )
      );
    }
  }

  return {
    merchantPaymentCount:
      safeNumber(
        result
          ?.summary
          ?.[0]
          ?.count
      ),

    merchantPayingWalletIds:
      uniqueStrings(
        merchantPayingWalletIds
      ),

    activityByUser,
  };
}

/* =========================================================
   PERIOD SNAPSHOT
========================================================= */

async function loadPeriodSnapshot(
  userIds:
    unknown[],
  currency:
    string,
  from:
    Date,
  to:
    Date
) {
  const [
    transactions,
    payments,
  ] =
    await Promise.all([
      loadTransactionPeriod(
        userIds,
        currency,
        from,
        to
      ),

      loadPaymentPeriod(
        userIds,
        currency,
        from,
        to
      ),
    ]);

  const engagedWalletIds =
    uniqueStrings([
      ...transactions
        .transactionWalletIds,

      ...payments
        .merchantPayingWalletIds,
    ]);

  const allActivity =
    new Map<
      string,
      number
    >();

  for (
    const [
      userId,
      count,
    ] of
    transactions.activityByUser
  ) {
    allActivity.set(
      userId,
      (
        allActivity.get(
          userId
        ) ??
        0
      ) +
        count
    );
  }

  for (
    const [
      userId,
      count,
    ] of
    payments.activityByUser
  ) {
    allActivity.set(
      userId,
      (
        allActivity.get(
          userId
        ) ??
        0
      ) +
        count
    );
  }

  const repeatEngagedWallets =
    [
      ...allActivity.values(),
    ].filter(
      (
        count
      ) =>
        count >=
        2
    ).length;

  return {
    engagedWallets:
      engagedWalletIds.length,

    transactionWallets:
      transactions
        .transactionWalletIds
        .length,

    merchantPayingWallets:
      payments
        .merchantPayingWalletIds
        .length,

    p2pWallets:
      transactions
        .p2pWalletIds
        .length,

    fundingWallets:
      transactions
        .fundingWalletIds
        .length,

    withdrawalWallets:
      transactions
        .withdrawalWalletIds
        .length,

    repeatEngagedWallets,

    transactionCount:
      transactions.total,

    p2pTransferCount:
      transactions.p2pCount,

    fundingCount:
      transactions.fundingCount,

    withdrawalCount:
      transactions.withdrawalCount,

    merchantPaymentCount:
      payments
        .merchantPaymentCount,

    walletActivityEvents:
      transactions.total +
      payments.merchantPaymentCount,
  };
}

/* =========================================================
   TRANSACTION TREND
========================================================= */

async function loadTransactionTrend(
  userIds:
    unknown[],
  filters:
    AnalystWalletFilters,
  boundary:
    RangeBoundary
) {
  if (
    userIds.length ===
    0
  ) {
    return [];
  }

  const rows =
    await Transaction.aggregate<{
      summary:
        Array<{
          _id:
            string;

          transactionCount:
            number;

          p2pCount:
            number;

          fundingCount:
            number;

          withdrawalCount:
            number;
        }>;

      wallets:
        Array<{
          _id:
            string;

          users:
            unknown[];
        }>;
    }>([
      {
        $match: {
          createdAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },

          currency:
            filters.currency,

          status:
            "COMPLETED",

          $or: [
            {
              senderId: {
                $in:
                  userIds,
              },
            },

            {
              receiverId: {
                $in:
                  userIds,
              },
            },
          ],
        },
      },

      {
        $project: {
          type:
            1,

          bucket:
            bucketExpression(
              "$createdAt",
              boundary.bucket
            ),

          participants: {
            $setUnion: [
              [
                "$senderId",
              ],

              [
                "$receiverId",
              ],
            ],
          },
        },
      },

      {
        $facet: {
          summary: [
            {
              $group: {
                _id:
                  "$bucket",

                transactionCount: {
                  $sum:
                    1,
                },

                p2pCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$type",
                          "TRANSFER",
                        ],
                      },

                      1,

                      0,
                    ],
                  },
                },

                fundingCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$type",
                          "DEPOSIT",
                        ],
                      },

                      1,

                      0,
                    ],
                  },
                },

                withdrawalCount: {
                  $sum: {
                    $cond: [
                      {
                        $eq: [
                          "$type",
                          "WITHDRAW",
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

          wallets: [
            {
              $unwind:
                "$participants",
            },

            {
              $match: {
                participants: {
                  $in:
                    userIds,
                },
              },
            },

            {
              $group: {
                _id:
                  "$bucket",

                users: {
                  $addToSet:
                    "$participants",
                },
              },
            },
          ],
        },
      },
    ]);

  const summaryMap =
    new Map(
      (
        rows[0]
          ?.summary ??
        []
      ).map(
        (
          row
        ) => [
          row._id,
          row,
        ]
      )
    );

  const walletMap =
    new Map(
      (
        rows[0]
          ?.wallets ??
        []
      ).map(
        (
          row
        ) => [
          row._id,

          row.users
            .map(
              stringId
            )
            .filter(
              Boolean
            ),
        ]
      )
    );

  return {
    summaryMap,
    walletMap,
  };
}

/* =========================================================
   PAYMENT TREND
========================================================= */

async function loadPaymentTrend(
  userIds:
    unknown[],
  filters:
    AnalystWalletFilters,
  boundary:
    RangeBoundary
) {
  if (
    userIds.length ===
    0
  ) {
    return {
      summaryMap:
        new Map<
          string,
          {
            merchantPaymentCount:
              number;
          }
        >(),

      walletMap:
        new Map<
          string,
          string[]
        >(),
    };
  }

  const rows =
    await Payment.aggregate<{
      _id:
        string;

      merchantPaymentCount:
        number;

      users:
        unknown[];
    }>([
      {
        $match: {
          customerId: {
            $in:
              userIds,
          },

          currency:
            filters.currency,

          mode:
            "live",

          sourceType:
            "wallet",

          status:
            "completed",

          completedAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },
        },
      },

      {
        $project: {
          customerId:
            1,

          bucket:
            bucketExpression(
              "$completedAt",
              boundary.bucket
            ),
        },
      },

      {
        $group: {
          _id:
            "$bucket",

          merchantPaymentCount: {
            $sum:
              1,
          },

          users: {
            $addToSet:
              "$customerId",
          },
        },
      },
    ]);

  return {
    summaryMap:
      new Map(
        rows.map(
          (
            row
          ) => [
            row._id,

            {
              merchantPaymentCount:
                row.merchantPaymentCount,
            },
          ]
        )
      ),

    walletMap:
      new Map(
        rows.map(
          (
            row
          ) => [
            row._id,

            row.users
              .map(
                stringId
              )
              .filter(
                Boolean
              ),
          ]
        )
      ),
  };
}

/* =========================================================
   NEW WALLET TREND
========================================================= */

async function loadNewWalletTrend(
  userIds:
    unknown[],
  filters:
    AnalystWalletFilters,
  boundary:
    RangeBoundary
) {
  if (
    userIds.length ===
    0
  ) {
    return new Map<
      string,
      number
    >();
  }

  const rows =
    await Wallet.aggregate<{
      _id:
        string;

      count:
        number;
    }>([
      {
        $match: {
          userId: {
            $in:
              userIds,
          },

          currency:
            filters.currency,

          createdAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },
        },
      },

      {
        $project: {
          bucket:
            bucketExpression(
              "$createdAt",
              boundary.bucket
            ),
        },
      },

      {
        $group: {
          _id:
            "$bucket",

          count: {
            $sum:
              1,
          },
        },
      },
    ]);

  return new Map(
    rows.map(
      (
        row
      ) => [
        row._id,
        row.count,
      ]
    )
  );
}

/* =========================================================
   COMPLETE TREND
========================================================= */

async function loadTrend(
  userIds:
    unknown[],
  filters:
    AnalystWalletFilters,
  boundary:
    RangeBoundary
) {
  const [
    transactionResult,
    paymentResult,
    newWalletMap,
  ] =
    await Promise.all([
      loadTransactionTrend(
        userIds,
        filters,
        boundary
      ),

      loadPaymentTrend(
        userIds,
        filters,
        boundary
      ),

      loadNewWalletTrend(
        userIds,
        filters,
        boundary
      ),
    ]);

  const transactionSummaryMap =
    transactionResult instanceof
      Array
      ? new Map()
      : transactionResult
          .summaryMap;

  const transactionWalletMap =
    transactionResult instanceof
      Array
      ? new Map<
          string,
          string[]
        >()
      : transactionResult
          .walletMap;

  return Array.from(
    {
      length:
        boundary.bucketCount,
    },

    (
      _,
      index
    ) => {
      const date =
        new Date(
          boundary.from.getTime() +
            index *
              boundary.bucketMs
        );

      const bucket =
        bucketKey(
          date,
          boundary.bucket
        );

      const transaction =
        transactionSummaryMap.get(
          bucket
        ) as
          | {
              transactionCount:
                number;

              p2pCount:
                number;

              fundingCount:
                number;

              withdrawalCount:
                number;
            }
          | undefined;

      const payment =
        paymentResult
          .summaryMap
          .get(
            bucket
          );

      const activeWalletIds =
        uniqueStrings([
          ...(
            transactionWalletMap.get(
              bucket
            ) ??
            []
          ),

          ...(
            paymentResult
              .walletMap
              .get(
                bucket
              ) ??
            []
          ),
        ]);

      return {
        bucket,

        newWallets:
          newWalletMap.get(
            bucket
          ) ??
          0,

        engagedWallets:
          activeWalletIds.length,

        transactionCount:
          transaction
            ?.transactionCount ??
          0,

        p2pTransferCount:
          transaction
            ?.p2pCount ??
          0,

        fundingCount:
          transaction
            ?.fundingCount ??
          0,

        withdrawalCount:
          transaction
            ?.withdrawalCount ??
          0,

        merchantPaymentCount:
          payment
            ?.merchantPaymentCount ??
          0,
      };
    }
  );
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildInsights({
  totalWallets,
  activeStatusWallets,
  frozenWallets,
  blockedWallets,
  engagedWallets,
  merchantPayingWallets,
  p2pWallets,
  repeatEngagedWallets,
}: {
  totalWallets:
    number;

  activeStatusWallets:
    number;

  frozenWallets:
    number;

  blockedWallets:
    number;

  engagedWallets:
    number;

  merchantPayingWallets:
    number;

  p2pWallets:
    number;

  repeatEngagedWallets:
    number;
}): AnalystWalletInsight[] {
  const insights:
    AnalystWalletInsight[] =
    [];

  const engagementRate =
    percentage(
      engagedWallets,
      totalWallets
    );

  const dormantRate =
    percentage(
      Math.max(
        0,
        totalWallets -
          engagedWallets
      ),
      totalWallets
    );

  const merchantAdoption =
    percentage(
      merchantPayingWallets,
      engagedWallets
    );

  const p2pAdoption =
    percentage(
      p2pWallets,
      engagedWallets
    );

  const repeatRate =
    percentage(
      repeatEngagedWallets,
      engagedWallets
    );

  /* =======================================================
     WALLET STATUS
  ======================================================= */

  if (
    blockedWallets >
    0
  ) {
    insights.push({
      id:
        "blocked-wallets",

      severity:
        "high",

      category:
        "wallet_status",

      title:
        "Blocked wallets require review",

      description:
        "One or more personal wallets are currently in BLOCKED status.",

      evidence:
        `${blockedWallets} blocked wallet${blockedWallets === 1 ? "" : "s"}.`,

      recommendedReview:
        "Review the related security or administrative events before changing wallet status.",
    });
  }

  if (
    frozenWallets >
    0
  ) {
    insights.push({
      id:
        "frozen-wallets",

      severity:
        "medium",

      category:
        "wallet_status",

      title:
        "Frozen wallet population detected",

      description:
        "Some personal wallets are currently frozen and unavailable for normal wallet activity.",

      evidence:
        `${frozenWallets} frozen wallet${frozenWallets === 1 ? "" : "s"}.`,

      recommendedReview:
        "Compare frozen wallets with Security and Risk workspaces.",
    });
  }

  /* =======================================================
     ENGAGEMENT
  ======================================================= */

  if (
    totalWallets >
      0 &&
    engagementRate <
      20
  ) {
    insights.push({
      id:
        "wallet-engagement-low",

      severity:
        "medium",

      category:
        "engagement",

      title:
        "Wallet engagement is low",

      description:
        "A relatively small share of wallets recorded completed transaction or merchant-payment activity during the selected period.",

      evidence:
        `${engagementRate.toFixed(
          2
        )}% wallet engagement; ${dormantRate.toFixed(
          2
        )}% dormant in this period.`,

      recommendedReview:
        "Compare new-wallet activation, funding, P2P usage and merchant-payment adoption.",
    });
  }

  /* =======================================================
     MERCHANT PAYMENTS
  ======================================================= */

  if (
    engagedWallets >
    0
  ) {
    insights.push({
      id:
        "merchant-payment-adoption",

      severity:
        merchantAdoption >=
        40
          ? "positive"
          : "info",

      category:
        "merchant_payment",

      title:
        "Merchant payment adoption",

      description:
        "This measures how many engaged Coffer wallets completed at least one live merchant checkout payment.",

      evidence:
        `${merchantAdoption.toFixed(
          2
        )}% of engaged wallets used Coffer merchant payments.`,

      recommendedReview:
        "Track whether merchant-payment adoption increases as merchant coverage grows.",
    });
  }

  /* =======================================================
     P2P
  ======================================================= */

  if (
    engagedWallets >
    0
  ) {
    insights.push({
      id:
        "p2p-adoption",

      severity:
        "info",

      category:
        "p2p",

      title:
        "P2P wallet usage",

      description:
        "Peer-to-peer activity remains a separate use case from merchant checkout payments.",

      evidence:
        `${p2pAdoption.toFixed(
          2
        )}% of engaged wallets participated in a completed transfer.`,

      recommendedReview:
        "Compare P2P adoption with merchant-payment adoption to understand wallet usage mix.",
    });
  }

  /* =======================================================
     REPEAT USAGE
  ======================================================= */

  if (
    repeatRate >=
      50 &&
    engagedWallets >
      0
  ) {
    insights.push({
      id:
        "repeat-wallet-engagement",

      severity:
        "positive",

      category:
        "retention",

      title:
        "Repeat wallet engagement is healthy",

      description:
        "At least half of engaged wallets generated multiple activity events during the selected period.",

      evidence:
        `${repeatRate.toFixed(
          2
        )}% repeat-engagement rate.`,

      recommendedReview:
        "Continue monitoring whether repeat usage is driven by P2P activity, funding or merchant payments.",
    });
  }

  /* =======================================================
     NO WALLETS
  ======================================================= */

  if (
    totalWallets ===
    0
  ) {
    return [
      {
        id:
          "wallet-no-data",

        severity:
          "info",

        category:
          "data_quality",

        title:
          "No wallets available for this currency",

        description:
          "No Coffer personal-user wallet matched the selected currency.",

        evidence:
          "0 matching wallets",

        recommendedReview:
          "Check the currency filter or wallet provisioning flow.",
      },
    ];
  }

  /* =======================================================
     FALLBACK
  ======================================================= */

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "wallet-network-healthy",

      severity:
        "positive",

      category:
        "engagement",

      title:
        "Wallet network is operating normally",

      description:
        "No material wallet-status or engagement signal was triggered.",

      evidence:
        `${activeStatusWallets} active-status wallets and ${engagedWallets} engaged wallets.`,

      recommendedReview:
        "Continue monitoring adoption, repeat engagement and merchant-payment usage.",
    });
  }

  return insights;
}

/* =========================================================
   MAIN SERVICE
========================================================= */

export async function getAnalystWalletAnalytics(
  filters:
    AnalystWalletFilters
) {
  const boundary =
    getRangeBoundary(
      filters.range
    );

  /* =======================================================
     PERSONAL COFFER USERS

     Merchants/admin/support/analyst are excluded.
  ======================================================= */

  const userIds =
    await User.find({
      role:
        "user",

      accountStatus: {
        $ne:
          "deleted",
      },
    }).distinct(
      "_id"
    );

  /* =======================================================
     WALLETS
  ======================================================= */

  const wallets =
    userIds.length >
    0
      ? await Wallet.find({
          userId: {
            $in:
              userIds,
          },

          currency:
            filters.currency,
        })
          .select(
            [
              "_id",
              "userId",
              "balance",
              "pendingBalance",
              "currency",
              "status",
              "createdAt",
              "updatedAt",
            ].join(
              " "
            )
          )
          .lean()
      : [];

  const totalWallets =
    wallets.length;

  const activeStatusWallets =
    wallets.filter(
      (
        wallet
      ) =>
        String(
          wallet.status
        ).toUpperCase() ===
        "ACTIVE"
    ).length;

  const frozenWallets =
    wallets.filter(
      (
        wallet
      ) =>
        String(
          wallet.status
        ).toUpperCase() ===
        "FROZEN"
    ).length;

  const blockedWallets =
    wallets.filter(
      (
        wallet
      ) =>
        String(
          wallet.status
        ).toUpperCase() ===
        "BLOCKED"
    ).length;

  /* =======================================================
     LIQUIDITY

     Wallet balance is read directly from Wallet collection.
     Transaction encrypted amounts are never used.
  ======================================================= */

  const totalBalanceMinor =
    wallets.reduce(
      (
        total,
        wallet
      ) =>
        total +
        majorToMinor(
          wallet.balance
        ),
      0
    );

  const totalPendingBalanceMinor =
    wallets.reduce(
      (
        total,
        wallet
      ) =>
        total +
        majorToMinor(
          wallet.pendingBalance
        ),
      0
    );

  const averageBalanceMinor =
    totalWallets >
    0
      ? Math.round(
          totalBalanceMinor /
            totalWallets
        )
      : 0;

  /* =======================================================
     CURRENT / PREVIOUS
  ======================================================= */

  const [
    current,
    previous,
    currentNewWallets,
    previousNewWallets,
    trend,
  ] =
    await Promise.all([
      loadPeriodSnapshot(
        userIds,
        filters.currency,
        boundary.from,
        boundary.to
      ),

      loadPeriodSnapshot(
        userIds,
        filters.currency,
        boundary.previousFrom,
        boundary.previousTo
      ),

      Wallet.countDocuments({
        userId: {
          $in:
            userIds,
        },

        currency:
          filters.currency,

        createdAt: {
          $gte:
            boundary.from,

          $lt:
            boundary.to,
        },
      }),

      Wallet.countDocuments({
        userId: {
          $in:
            userIds,
        },

        currency:
          filters.currency,

        createdAt: {
          $gte:
            boundary.previousFrom,

          $lt:
            boundary.previousTo,
        },
      }),

      loadTrend(
        userIds,
        filters,
        boundary
      ),
    ]);

  /* =======================================================
     DERIVED
  ======================================================= */

  const dormantWallets =
    Math.max(
      0,
      totalWallets -
        current.engagedWallets
    );

  const lockedWallets =
    frozenWallets +
    blockedWallets;

  const walletEngagementRate =
    percentage(
      current.engagedWallets,
      totalWallets
    );

  const activeStatusRate =
    percentage(
      activeStatusWallets,
      totalWallets
    );

  const dormantWalletRate =
    percentage(
      dormantWallets,
      totalWallets
    );

  const merchantPaymentAdoptionRate =
    percentage(
      current.merchantPayingWallets,
      current.engagedWallets
    );

  const p2pAdoptionRate =
    percentage(
      current.p2pWallets,
      current.engagedWallets
    );

  const repeatActivityRate =
    percentage(
      current.repeatEngagedWallets,
      current.engagedWallets
    );

  /* =======================================================
     USAGE MIX

     Count-based because transaction amounts remain
     encrypted.
  ======================================================= */

  const usageEventTotal =
    current.p2pTransferCount +
    current.fundingCount +
    current.withdrawalCount +
    current.merchantPaymentCount;

  const usageMix =
    [
      {
        key:
          "merchant_payments",

        label:
          "Merchant Payments",

        count:
          current.merchantPaymentCount,
      },

      {
        key:
          "p2p_transfers",

        label:
          "P2P Transfers",

        count:
          current.p2pTransferCount,
      },

      {
        key:
          "funding",

        label:
          "Add Money",

        count:
          current.fundingCount,
      },

      {
        key:
          "withdrawals",

        label:
          "Withdrawals",

        count:
          current.withdrawalCount,
      },
    ].map(
      (
        item
      ) => ({
        ...item,

        percentage:
          percentage(
            item.count,
            usageEventTotal
          ),
      })
    );

  /* =======================================================
     STATUS
  ======================================================= */

  const blockedRate =
    percentage(
      blockedWallets,
      totalWallets
    );

  let status:
    AnalystWalletStatus =
    "healthy";

  if (
    totalWallets >=
      10 &&
    blockedRate >=
      10
  ) {
    status =
      "critical";
  } else if (
    lockedWallets >
      0 ||
    (
      totalWallets >
        0 &&
      walletEngagementRate <
        20
    )
  ) {
    status =
      "attention";
  }

  /* =======================================================
     RESPONSE
  ======================================================= */

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      wallets:
        "mongodb_wallet_collection",

      users:
        "mongodb_user_collection",

      transactions:
        "mongodb_transaction_collection",

      merchantPayments:
        "mongodb_payment_collection",
    },

    privacy: {
      transactionAmountsDecrypted:
        false as const,

      transactionReferencesExposed:
        false as const,

      walletBalancesAggregated:
        true as const,

      note:
        "Wallet balances are aggregated directly from the wallet collection. Transaction encrypted amounts and references are not decrypted or exposed.",
    },

    scopeNote:
      "Wallet Analytics covers Coffer personal-user wallets only. Merchant checkout usage includes completed live payments where sourceType=wallet.",

    status,

    filters: {
      range:
        boundary.range,

      currency:
        filters.currency,

      bucket:
        boundary.bucket,

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
    },

    population: {
      totalWallets,

      activeStatusWallets,

      frozenWallets,

      blockedWallets,

      lockedWallets,

      dormantWallets,

      activeStatusRate,

      dormantWalletRate,
    },

    liquidity: {
      totalBalanceMinor,

      totalPendingBalanceMinor,

      averageBalanceMinor,
    },

    metrics: {
      newWallets:
        metric(
          currentNewWallets,
          previousNewWallets
        ),

      engagedWallets:
        metric(
          current.engagedWallets,
          previous.engagedWallets
        ),

      transactionWallets:
        metric(
          current.transactionWallets,
          previous.transactionWallets
        ),

      merchantPayingWallets:
        metric(
          current.merchantPayingWallets,
          previous.merchantPayingWallets
        ),

      p2pWallets:
        metric(
          current.p2pWallets,
          previous.p2pWallets
        ),

      repeatEngagedWallets:
        metric(
          current.repeatEngagedWallets,
          previous.repeatEngagedWallets
        ),

      walletActivityEvents:
        metric(
          current.walletActivityEvents,
          previous.walletActivityEvents
        ),

      merchantPaymentCount:
        metric(
          current.merchantPaymentCount,
          previous.merchantPaymentCount
        ),

      p2pTransferCount:
        metric(
          current.p2pTransferCount,
          previous.p2pTransferCount
        ),
    },

    engagement: {
      walletEngagementRate,

      merchantPaymentAdoptionRate,

      p2pAdoptionRate,

      repeatActivityRate,

      transactionsPerEngagedWallet:
        current.engagedWallets >
        0
          ? round(
              current.walletActivityEvents /
                current.engagedWallets
            )
          : 0,
    },

    activity: {
      transactionCount:
        current.transactionCount,

      p2pTransferCount:
        current.p2pTransferCount,

      fundingCount:
        current.fundingCount,

      withdrawalCount:
        current.withdrawalCount,

      merchantPaymentCount:
        current.merchantPaymentCount,

      walletActivityEvents:
        current.walletActivityEvents,
    },

    funnel: [
      {
        key:
          "total",

        label:
          "Total Wallets",

        value:
          totalWallets,

        percentage:
          totalWallets >
          0
            ? 100
            : 0,
      },

      {
        key:
          "active_status",

        label:
          "Active Status",

        value:
          activeStatusWallets,

        percentage:
          percentage(
            activeStatusWallets,
            totalWallets
          ),
      },

      {
        key:
          "engaged",

        label:
          "Engaged Wallets",

        value:
          current.engagedWallets,

        percentage:
          percentage(
            current.engagedWallets,
            totalWallets
          ),
      },

      {
        key:
          "merchant_paying",

        label:
          "Merchant-Paying Wallets",

        value:
          current.merchantPayingWallets,

        percentage:
          percentage(
            current.merchantPayingWallets,
            totalWallets
          ),
      },
    ],

    walletStatuses: [
      {
        status:
          "ACTIVE",

        count:
          activeStatusWallets,

        percentage:
          percentage(
            activeStatusWallets,
            totalWallets
          ),
      },

      {
        status:
          "FROZEN",

        count:
          frozenWallets,

        percentage:
          percentage(
            frozenWallets,
            totalWallets
          ),
      },

      {
        status:
          "BLOCKED",

        count:
          blockedWallets,

        percentage:
          percentage(
            blockedWallets,
            totalWallets
          ),
      },
    ],

    usageMix,

    trend,

    insights:
      buildInsights({
        totalWallets,

        activeStatusWallets,

        frozenWallets,

        blockedWallets,

        engagedWallets:
          current.engagedWallets,

        merchantPayingWallets:
          current.merchantPayingWallets,

        p2pWallets:
          current.p2pWallets,

        repeatEngagedWallets:
          current.repeatEngagedWallets,
      }),
  };
}