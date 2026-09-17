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

export type MerchantOverviewPeriod =
  | "1d"
  | "7d"
  | "30d"
  | "90d"
  | "12m"
  | "all";

interface MerchantOverviewInput {
  userId: string;

  period?:
    MerchantOverviewPeriod;
}

interface PaymentAggregationResult {
  totalPayments:
    number;

  successfulPayments:
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
    number;

  totalFees:
    number;

  netRevenue:
    number;

  successRate:
    number;

  averagePaymentValue:
    number;

  uniqueCustomers:
    number;
}

interface TrendItem {
  date:
    string;

  paymentCount:
    number;

  volume:
    number;
}

interface BreakdownItem {
  key:
    string;

  count:
    number;

  amount:
    number;
}

/* =========================================================
   PERIOD HELPERS
========================================================= */

function resolvePeriodStart(
  period:
    MerchantOverviewPeriod
): Date | null {
  const now =
    new Date();

  switch (
    period
  ) {
    case "1d": {
      const date =
        new Date(
          now
        );

      date.setDate(
        date.getDate() -
          1
      );

      return date;
    }

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
      return resolvePeriodStart(
        "30d"
      );
  }
}

function normalizePeriod(
  value:
    unknown
): MerchantOverviewPeriod {
  if (
    value === "1d" ||
    value === "7d" ||
    value === "30d" ||
    value === "90d" ||
    value === "12m" ||
    value === "all"
  ) {
    return value;
  }

  return "30d";
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

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

  /*
   * MongoDB Decimal128 support.
   */
  if (
    typeof value ===
      "object" &&
    value !== null
  ) {
    if (
      "$numberDecimal" in
      value
    ) {
      const decimalValue =
        (
          value as {
            $numberDecimal?:
              string;
          }
        ).$numberDecimal;

      if (
        typeof decimalValue ===
        "string"
      ) {
        const parsed =
          Number(
            decimalValue
          );

        return Number.isFinite(
          parsed
        )
          ? parsed
          : 0;
      }
    }

    if (
      "toString" in
      value &&
      typeof (
        value as {
          toString?: unknown;
        }
      ).toString ===
        "function"
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

/* =========================================================
   MERCHANT LOOKUP
========================================================= */

async function findMerchantForOwner(
  userId:
    string
) {
  if (
    !mongoose.isValidObjectId(
      userId
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
          userId
        ),
    })
      .select(
        [
          "_id",
          "ownerId",
          "businessName",
          "businessDisplayName",
          "slug",
          "status",
          "verificationStatus",
          "defaultCurrency",
          "testEnabled",
          "liveEnabled",
        ].join(
          " "
        )
      )
      .sort({
        createdAt:
          -1,
      })
      .lean();

  if (
    !merchant
  ) {
    throw new Error(
      "Merchant account not found."
    );
  }

  return merchant;
}

/* =========================================================
   BUILD PAYMENT MATCH
========================================================= */

function buildPaymentMatch(
  merchantId:
    mongoose.Types.ObjectId,
  startDate:
    Date | null
) {
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
        new Date(),
    };
  }

  return match;
}

/* =========================================================
   MAIN OVERVIEW
========================================================= */

export async function getMerchantOverview(
  input:
    MerchantOverviewInput
) {
  const period =
    normalizePeriod(
      input.period
    );

  const merchant =
    await findMerchantForOwner(
      input.userId
    );

  const merchantObjectId =
    merchant._id as
      mongoose.Types.ObjectId;

  const periodStart =
    resolvePeriodStart(
      period
    );

  const match =
    buildPaymentMatch(
      merchantObjectId,
      periodStart
    );

  /* =======================================================
     PAYMENT SUMMARY
  ======================================================= */

  const summaryResult =
    await Payment.aggregate([
      {
        $match:
          match,
      },

      {
        $facet: {
          totals: [
            {
              $group: {
                _id:
                  null,

                totalPayments: {
                  $sum:
                    1,
                },

                successfulPayments: {
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
              },
            },
          ],

          customers: [
            {
              $match: {
                customerId: {
                  $ne:
                    null,
                },
              },
            },

            {
              $group: {
                _id:
                  "$customerId",
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

  const totals =
    summaryResult
      ?.[0]
      ?.totals
      ?.[0] ??
    {};

  const customerResult =
    summaryResult
      ?.[0]
      ?.customers
      ?.[0];

  const totalPayments =
    toNumber(
      totals.totalPayments
    );

  const successfulPayments =
    toNumber(
      totals.successfulPayments
    );

  const pendingPayments =
    toNumber(
      totals.pendingPayments
    );

  const processingPayments =
    toNumber(
      totals.processingPayments
    );

  const failedPayments =
    toNumber(
      totals.failedPayments
    );

  const cancelledPayments =
    toNumber(
      totals.cancelledPayments
    );

  const expiredPayments =
    toNumber(
      totals.expiredPayments
    );

  const grossVolume =
    toNumber(
      totals.grossVolume
    );

  const totalFees =
    toNumber(
      totals.totalFees
    );

  const netRevenue =
    grossVolume -
    totalFees;

  const successRate =
    totalPayments >
    0
      ? (
          successfulPayments /
          totalPayments
        ) *
        100
      : 0;

  const averagePaymentValue =
    successfulPayments >
    0
      ? grossVolume /
        successfulPayments
      : 0;

  const uniqueCustomers =
    toNumber(
      customerResult
        ?.count
    );

  const summary:
    PaymentAggregationResult = {
    totalPayments:
      roundNumber(
        totalPayments,
        0
      ),

    successfulPayments:
      roundNumber(
        successfulPayments,
        0
      ),

    pendingPayments:
      roundNumber(
        pendingPayments,
        0
      ),

    processingPayments:
      roundNumber(
        processingPayments,
        0
      ),

    failedPayments:
      roundNumber(
        failedPayments,
        0
      ),

    cancelledPayments:
      roundNumber(
        cancelledPayments,
        0
      ),

    expiredPayments:
      roundNumber(
        expiredPayments,
        0
      ),

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

    uniqueCustomers:
      roundNumber(
        uniqueCustomers,
        0
      ),
  };

  /* =======================================================
     PAYMENT STATUS BREAKDOWN
  ======================================================= */

  const statusBreakdownRaw =
    await Payment.aggregate([
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

          amount: {
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

  const statusBreakdown:
    BreakdownItem[] =
    statusBreakdownRaw.map(
      (
        item: {
          _id:
            string;

          count:
            number;

          amount:
            unknown;
        }
      ) => ({
        key:
          item._id,

        count:
          toNumber(
            item.count
          ),

        amount:
          roundNumber(
            toNumber(
              item.amount
            )
          ),
      })
    );

  /* =======================================================
     PAYMENT METHOD BREAKDOWN
  ======================================================= */

  const methodBreakdownRaw =
    await Payment.aggregate([
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

          amount: {
            $sum:
              "$amount",
          },
        },
      },

      {
        $sort: {
          amount:
            -1,
        },
      },
    ]);

  const paymentMethods:
    BreakdownItem[] =
    methodBreakdownRaw.map(
      (
        item: {
          _id:
            string;

          count:
            number;

          amount:
            unknown;
        }
      ) => ({
        key:
          item._id,

        count:
          toNumber(
            item.count
          ),

        amount:
          roundNumber(
            toNumber(
              item.amount
            )
          ),
      })
    );

  /* =======================================================
     PROVIDER BREAKDOWN
  ======================================================= */

  const providerBreakdownRaw =
    await Payment.aggregate([
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

          amount: {
            $sum:
              "$amount",
          },
        },
      },

      {
        $sort: {
          amount:
            -1,
        },
      },
    ]);

  const providers:
    BreakdownItem[] =
    providerBreakdownRaw.map(
      (
        item: {
          _id:
            string;

          count:
            number;

          amount:
            unknown;
        }
      ) => ({
        key:
          item._id,

        count:
          toNumber(
            item.count
          ),

        amount:
          roundNumber(
            toNumber(
              item.amount
            )
          ),
      })
    );

  /* =======================================================
     REVENUE / PAYMENT TREND

     IMPORTANT:
     - 1d / 7d / 30d / 90d / 12m use periodStart
     - all means genuinely ALL completed payments
  ======================================================= */

  const trendMatch:
    Record<
      string,
      unknown
    > = {
    merchantId:
      merchantObjectId,

    status:
      "completed",
  };

  if (
    periodStart
  ) {
    trendMatch.createdAt = {
      $gte:
        periodStart,

      $lte:
        new Date(),
    };
  }

  const trendRaw =
    await Payment.aggregate([
      {
        $match:
          trendMatch,
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

          volume: {
            $sum:
              "$amount",
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

  const trend:
    TrendItem[] =
    trendRaw.map(
      (
        item: {
          _id:
            string;

          paymentCount:
            number;

          volume:
            unknown;
        }
      ) => ({
        date:
          item._id,

        paymentCount:
          toNumber(
            item.paymentCount
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
     RECENT PAYMENTS

     IMPORTANT:
     Mongo Decimal128 values are converted to plain numbers
     BEFORE sending data to frontend.
  ======================================================= */

  const recentPayments =
    await Payment.find(
      match
    )
      .sort({
        createdAt:
          -1,
      })
      .limit(
        12
      )
      .select(
        [
          "paymentId",
          "customerId",
          "orderId",
          "amount",
          "currency",
          "feeAmount",
          "netAmount",
          "sourceType",
          "provider",
          "mode",
          "status",
          "merchantReference",
          "failureCode",
          "failureMessage",
          "createdAt",
          "completedAt",
        ].join(
          " "
        )
      )
      .lean();

  const formattedRecentPayments =
    recentPayments.map(
      (
        payment
      ) => ({
        paymentId:
          payment.paymentId,

        customerId:
          payment.customerId
            ? payment.customerId.toString()
            : null,

        orderId:
          payment.orderId
            ? payment.orderId.toString()
            : null,

        amount:
          roundNumber(
            toNumber(
              payment.amount
            )
          ),

        currency:
          payment.currency,

        feeAmount:
          roundNumber(
            toNumber(
              payment.feeAmount
            )
          ),

        /*
         * Do not use:
         *
         * payment.netAmount ? ... : null
         *
         * Because numeric zero is valid.
         */
        netAmount:
          payment.netAmount !==
            null &&
          payment.netAmount !==
            undefined
            ? roundNumber(
                toNumber(
                  payment.netAmount
                )
              )
            : null,

        sourceType:
          payment.sourceType,

        provider:
          payment.provider,

        mode:
          payment.mode,

        status:
          payment.status,

        merchantReference:
          payment.merchantReference ??
          null,

        failureCode:
          payment.failureCode ??
          null,

        failureMessage:
          payment.failureMessage ??
          null,

        createdAt:
          payment.createdAt,

        completedAt:
          payment.completedAt ??
          null,
      })
    );

  /* =======================================================
     RESULT
  ======================================================= */

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

      status:
        merchant.status,

      verificationStatus:
        merchant.verificationStatus,

      defaultCurrency:
        merchant.defaultCurrency,

      testEnabled:
        merchant.testEnabled,

      liveEnabled:
        merchant.liveEnabled,
    },

    period,

    periodStart,

    generatedAt:
      new Date(),

    summary,

    statusBreakdown,

    paymentMethods,

    providers,

    trend,

    /*
     * IMPORTANT:
     *
     * Return formatted recent payments.
     * Never return raw Mongo Decimal128 payment amounts.
     */
    recentPayments:
      formattedRecentPayments,
  };
}