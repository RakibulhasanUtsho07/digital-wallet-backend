import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantAnalyticsPeriod =
  | "7d"
  | "30d"
  | "90d"
  | "12m"
  | "all";

export interface MerchantAnalyticsInput {
  ownerId: string;

  period?: unknown;

  from?: unknown;

  to?: unknown;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value:
    unknown,

  maxLength =
    500
): string | undefined {
  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (
    !normalized
  ) {
    return undefined;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

function normalizePeriod(
  value:
    unknown
): MerchantAnalyticsPeriod {
  if (
    value ===
      "7d" ||
    value ===
      "30d" ||
    value ===
      "90d" ||
    value ===
      "12m" ||
    value ===
      "all"
  ) {
    return value;
  }

  return "30d";
}

function toNumber(
  value:
    unknown
): number {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

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
      "object" &&
    value !==
      null &&
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

function roundNumber(
  value:
    number,

  digits =
    2
): number {
  const multiplier =
    10 **
    digits;

  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        multiplier
    ) /
    multiplier
  );
}

function parseDate(
  value:
    unknown,

  endOfDay =
    false
): Date | null {
  const normalized =
    normalizeText(
      value,
      50
    );

  if (
    !normalized
  ) {
    return null;
  }

  const date =
    new Date(
      normalized
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  if (
    endOfDay
  ) {
    date.setHours(
      23,
      59,
      59,
      999
    );
  } else {
    date.setHours(
      0,
      0,
      0,
      0
    );
  }

  return date;
}

function resolvePeriodStart(
  period:
    MerchantAnalyticsPeriod
): Date | null {
  const now =
    new Date();

  switch (
    period
  ) {
    case "7d": {
      const date =
        new Date(
          now
        );

      date.setDate(
        date.getDate() -
          7
      );

      return date;
    }

    case "30d": {
      const date =
        new Date(
          now
        );

      date.setDate(
        date.getDate() -
          30
      );

      return date;
    }

    case "90d": {
      const date =
        new Date(
          now
        );

      date.setDate(
        date.getDate() -
          90
      );

      return date;
    }

    case "12m": {
      const date =
        new Date(
          now
        );

      date.setMonth(
        date.getMonth() -
          12
      );

      return date;
    }

    case "all":
      return null;

    default:
      return null;
  }
}

/* =========================================================
   MERCHANT
========================================================= */

async function findMerchantForOwner(
  ownerId:
    string
) {
  const normalizedOwnerId =
    normalizeText(
      ownerId,
      100
    );

  if (
    !normalizedOwnerId
  ) {
    throw new Error(
      "Authenticated merchant owner is required."
    );
  }

  if (
    !mongoose.isValidObjectId(
      normalizedOwnerId
    )
  ) {
    throw new Error(
      "Invalid merchant owner ID."
    );
  }

  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          normalizedOwnerId
        ),
    })
      .select(
        [
          "_id",
          "businessName",
          "businessDisplayName",
          "slug",
          "status",
          "verificationStatus",
          "defaultCurrency",
        ].join(
          " "
        )
      )
      .lean();

  if (
    !merchant
  ) {
    throw new Error(
      "Merchant account not found."
    );
  }

  if (
    merchant.status !==
    "active"
  ) {
    throw new Error(
      "Merchant account is not active."
    );
  }

  return merchant;
}

/* =========================================================
   MAIN
========================================================= */

export async function getMerchantAnalytics(
  input:
    MerchantAnalyticsInput
) {
  const merchant =
    await findMerchantForOwner(
      input.ownerId
    );

  const period =
    normalizePeriod(
      input.period
    );

  const customFrom =
    parseDate(
      input.from
    );

  const customTo =
    parseDate(
      input.to,
      true
    );

  let startDate =
    resolvePeriodStart(
      period
    );

  let endDate =
    new Date();

  if (
    customFrom
  ) {
    startDate =
      customFrom;
  }

  if (
    customTo
  ) {
    endDate =
      customTo;
  }

  if (
    startDate &&
    startDate >
      endDate
  ) {
    throw new Error(
      "Analytics start date cannot be later than end date."
    );
  }

  const merchantId =
    merchant._id as
      mongoose.Types.ObjectId;

  /* =======================================================
     BASE MATCH
  ======================================================== */

  const match:
    Record<
      string,
      unknown
    > = {
    merchantId,
  };

  if (
    startDate
  ) {
    match.createdAt = {
      $gte:
        startDate,

      $lte:
        endDate,
    };
  } else {
    /*
     * All-time:
     * no artificial 30-day start limit.
     */
    match.createdAt = {
      $lte:
        endDate,
    };
  }

  /* =======================================================
     OVERVIEW
  ======================================================== */

  const overviewResult =
    await Payment.aggregate<{
      totalPayments:
        number;

      completedPayments:
        number;

      pendingPayments:
        number;

      processingPayments:
        number;

      failedPayments:
        number;

      cancelledPayments:
        number;

      expiredPayments:
        number;

      grossVolume:
        unknown;

      totalFees:
        unknown;

      averageAmount:
        unknown;

      uniqueCustomers:
        number;
    }>([
      {
        $match:
          match,
      },

      {
        $group: {
          _id:
            null,

          totalPayments: {
            $sum:
              1,
          },

          completedPayments: {
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

          pendingPayments: {
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

          processingPayments: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$status",

                    [
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

          cancelledPayments: {
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

          expiredPayments: {
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

          grossVolume: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amount",

                0,
              ],
            },
          },

          totalFees: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                {
                  $ifNull: [
                    "$feeAmount",
                    0,
                  ],
                },

                0,
              ],
            },
          },

          averageAmount: {
            $avg: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amount",

                null,
              ],
            },
          },

          uniqueCustomers: {
            $addToSet:
              "$customerId",
          },
        },
      },

      {
        $project: {
          totalPayments:
            1,

          completedPayments:
            1,

          pendingPayments:
            1,

          processingPayments:
            1,

          failedPayments:
            1,

          cancelledPayments:
            1,

          expiredPayments:
            1,

          grossVolume:
            1,

          totalFees:
            1,

          averageAmount:
            1,

          uniqueCustomers: {
            $size: {
              $filter: {
                input:
                  "$uniqueCustomers",

                as:
                  "customerId",

                cond: {
                  $ne: [
                    "$$customerId",
                    null,
                  ],
                },
              },
            },
          },
        },
      },
    ]);

  const overview =
    overviewResult[0];

  const totalPayments =
    Number(
      overview
        ?.totalPayments ??
        0
    );

  const completedPayments =
    Number(
      overview
        ?.completedPayments ??
        0
    );

  const pendingPayments =
    Number(
      overview
        ?.pendingPayments ??
        0
    );

  const processingPayments =
    Number(
      overview
        ?.processingPayments ??
        0
    );

  const failedPayments =
    Number(
      overview
        ?.failedPayments ??
        0
    );

  const cancelledPayments =
    Number(
      overview
        ?.cancelledPayments ??
        0
    );

  const expiredPayments =
    Number(
      overview
        ?.expiredPayments ??
        0
    );

  const grossVolume =
    toNumber(
      overview
        ?.grossVolume
    );

  const totalFees =
    toNumber(
      overview
        ?.totalFees
    );

  const netRevenue =
    grossVolume -
    totalFees;

  const successRate =
    totalPayments >
    0
      ? (
          completedPayments /
          totalPayments
        ) *
        100
      : 0;

  const averagePaymentValue =
    toNumber(
      overview
        ?.averageAmount
    );

  const uniqueCustomers =
    Number(
      overview
        ?.uniqueCustomers ??
        0
    );

  /* =======================================================
     TREND

     Important:
     Uses the SAME period/range as overview.

     Previous implementation used last 30 days when
     period = all, which caused mismatched analytics.
  ======================================================== */

  const trendResult =
    await Payment.aggregate<{
      _id:
        string;

      paymentCount:
        number;

      completedCount:
        number;

      failedCount:
        number;

      volume:
        unknown;
    }>([
      {
        $match:
          match,
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format:
                "%Y-%m-%d",

              date:
                "$createdAt",
            },
          },

          paymentCount: {
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

          volume: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amount",

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
    ]);

  const trend =
    trendResult.map(
      (
        item
      ) => ({
        date:
          item._id,

        paymentCount:
          Number(
            item.paymentCount
          ),

        completedCount:
          Number(
            item.completedCount
          ),

        failedCount:
          Number(
            item.failedCount
          ),

        volume:
          roundNumber(
            toNumber(
              item.volume
            )
          ),
      })
    );

  /* =======================================================
     PAYMENT METHODS
  ======================================================== */

  const methodResult =
    await Payment.aggregate<{
      _id:
        string | null;

      count:
        number;

      volume:
        unknown;
    }>([
      {
        $match: {
          ...match,

          status:
            "completed",
        },
      },

      {
        $group: {
          _id:
            "$sourceType",

          count: {
            $sum:
              1,
          },

          volume: {
            $sum:
              "$amount",
          },
        },
      },

      {
        $sort: {
          volume:
            -1,
        },
      },
    ]);

  const paymentMethods =
    methodResult.map(
      (
        item
      ) => ({
        key:
          item._id ||
          "unknown",

        count:
          Number(
            item.count
          ),

        volume:
          roundNumber(
            toNumber(
              item.volume
            )
          ),
      })
    );

  /* =======================================================
     PROVIDERS
  ======================================================== */

  const providerResult =
    await Payment.aggregate<{
      _id:
        string | null;

      count:
        number;

      volume:
        unknown;
    }>([
      {
        $match: {
          ...match,

          status:
            "completed",
        },
      },

      {
        $group: {
          _id:
            "$provider",

          count: {
            $sum:
              1,
          },

          volume: {
            $sum:
              "$amount",
          },
        },
      },

      {
        $sort: {
          volume:
            -1,
        },
      },
    ]);

  const providers =
    providerResult.map(
      (
        item
      ) => ({
        key:
          item._id ||
          "unknown",

        count:
          Number(
            item.count
          ),

        volume:
          roundNumber(
            toNumber(
              item.volume
            )
          ),
      })
    );

  /* =======================================================
     STATUS BREAKDOWN
  ======================================================== */

  const statusResult =
    await Payment.aggregate<{
      _id:
        string | null;

      count:
        number;

      volume:
        unknown;
    }>([
      {
        $match:
          match,
      },

      {
        $group: {
          _id:
            "$status",

          count: {
            $sum:
              1,
          },

          volume: {
            $sum:
              "$amount",
          },
        },
      },

      {
        $sort: {
          count:
            -1,
        },
      },
    ]);

  const statusBreakdown =
    statusResult.map(
      (
        item
      ) => ({
        key:
          item._id ||
          "unknown",

        count:
          Number(
            item.count
          ),

        volume:
          roundNumber(
            toNumber(
              item.volume
            )
          ),
      })
    );

  /* =======================================================
     TOP DAYS
  ======================================================== */

  const topDays =
    [
      ...trend,
    ]
      .sort(
        (
          first,
          second
        ) =>
          second.volume -
          first.volume
      )
      .slice(
        0,
        5
      );

  /* =======================================================
     RESPONSE
  ======================================================== */

  return {
    merchant: {
      id:
        merchant._id.toString(),

      businessName:
        merchant.businessName,

      businessDisplayName:
        merchant.businessDisplayName ??
        null,

      slug:
        merchant.slug,

      defaultCurrency:
        merchant.defaultCurrency,
    },

    period,

    range: {
      start:
        startDate,

      end:
        endDate,
    },

    generatedAt:
      new Date(),

    overview: {
      totalPayments,

      completedPayments,

      pendingPayments,

      processingPayments,

      failedPayments,

      cancelledPayments,

      expiredPayments,

      grossVolume:
        roundNumber(
          grossVolume
        ),

      totalFees:
        roundNumber(
          totalFees
        ),

      netRevenue:
        roundNumber(
          netRevenue
        ),

      successRate:
        roundNumber(
          successRate
        ),

      averagePaymentValue:
        roundNumber(
          averagePaymentValue
        ),

      uniqueCustomers,
    },

    trend,

    paymentMethods,

    providers,

    statusBreakdown,

    topDays,
  };
}