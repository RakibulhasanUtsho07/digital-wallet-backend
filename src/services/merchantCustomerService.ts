import mongoose, {
  type PipelineStage,
} from "mongoose";

import { Merchant } from "../models/Merchant.js";
import { Payment } from "../models/Payment.js";
import { User } from "../models/User.js";

/* =========================================================
   TYPES
========================================================= */

export interface MerchantCustomerListItem {
  customerId: string;

  customer: {
    name: string;
    avatarUrl?: string;
    accountStatus?: string;
    kycStatus?: string;
    emailVerified?: boolean;
    createdAt?: Date;
  };

  totalPayments: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;

  totalVolume: string;
  averagePaymentValue: string;

  successRate: number;

  lastPaymentAt: Date | null;
  firstPaymentAt: Date | null;
}

export interface MerchantCustomerListResult {
  customers: MerchantCustomerListItem[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };

  filters: {
    search: string;
    status: string;
    kycStatus: string;
    from: string;
    to: string;
  };
}

/* =========================================================
   HELPERS
========================================================= */

const toNumberString = (
  value: unknown,
): string => {
  if (
    value === null ||
    value === undefined
  ) {
    return "0";
  }

  if (
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return String(value);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value
  ) {
    return String(
      (
        value as {
          toString: () => string;
        }
      ).toString(),
    );
  }

  return "0";
};

const normalizePage = (
  value: unknown,
): number => {
  const page = Number(value);

  if (
    !Number.isInteger(page) ||
    page < 1
  ) {
    return 1;
  }

  return page;
};

const normalizeLimit = (
  value: unknown,
): number => {
  const limit = Number(value);

  if (
    !Number.isInteger(limit) ||
    limit < 5
  ) {
    return 20;
  }

  return Math.min(limit, 100);
};

const parseOptionalDate = (
  value: unknown,
  endOfDay = false,
): Date | undefined => {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return undefined;
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return undefined;
  }

  if (endOfDay) {
    date.setHours(
      23,
      59,
      59,
      999,
    );
  } else {
    date.setHours(
      0,
      0,
      0,
      0,
    );
  }

  return date;
};

/* =========================================================
   LIST MERCHANT CUSTOMERS
========================================================= */

export const getMerchantCustomers =
  async ({
    ownerId,
    page: rawPage,
    limit: rawLimit,
    search: rawSearch,
    status: rawStatus,
    kycStatus: rawKycStatus,
    from: rawFrom,
    to: rawTo,
  }: {
    ownerId: string;
    page?: unknown;
    limit?: unknown;
    search?: unknown;
    status?: unknown;
    kycStatus?: unknown;
    from?: unknown;
    to?: unknown;
  }): Promise<MerchantCustomerListResult> => {
    /* =======================================================
       VALIDATION
    ======================================================== */

    if (!ownerId) {
      throw new Error(
        "Authenticated merchant owner is required.",
      );
    }

    if (
      !mongoose.isValidObjectId(
        ownerId,
      )
    ) {
      throw new Error(
        "Invalid merchant owner ID.",
      );
    }

    /* =======================================================
       PAGINATION
    ======================================================== */

    const page =
      normalizePage(
        rawPage,
      );

    const limit =
      normalizeLimit(
        rawLimit,
      );

    const skip =
      (page - 1) *
      limit;

    /* =======================================================
       FILTERS
    ======================================================== */

    const search =
      typeof rawSearch ===
      "string"
        ? rawSearch.trim()
        : "";

    const status =
      typeof rawStatus ===
      "string"
        ? rawStatus.trim()
        : "";

    const kycStatus =
      typeof rawKycStatus ===
      "string"
        ? rawKycStatus.trim()
        : "";

    const from =
      typeof rawFrom ===
      "string"
        ? rawFrom.trim()
        : "";

    const to =
      typeof rawTo ===
      "string"
        ? rawTo.trim()
        : "";

    const fromDate =
      parseOptionalDate(
        from,
        false,
      );

    const toDate =
      parseOptionalDate(
        to,
        true,
      );

    /* =======================================================
       MERCHANT
    ======================================================== */

    const merchant =
      await Merchant.findOne({
        ownerId:
          new mongoose.Types.ObjectId(
            ownerId,
          ),
      })
        .select(
          "_id businessName displayName defaultCurrency",
        )
        .lean();

    if (!merchant) {
      throw new Error(
        "Merchant account not found.",
      );
    }

    /* =======================================================
       PAYMENT MATCH
    ======================================================== */

    const paymentMatch:
      Record<string, unknown> = {
      merchantId:
        merchant._id,

      customerId: {
        $exists: true,
        $ne: null,
      },
    };

    if (
      fromDate ||
      toDate
    ) {
      const createdAt:
        Record<string, Date> =
        {};

      if (fromDate) {
        createdAt.$gte =
          fromDate;
      }

      if (toDate) {
        createdAt.$lte =
          toDate;
      }

      paymentMatch.createdAt =
        createdAt;
    }

    /* =======================================================
       BASE PIPELINE
    ======================================================== */

    const basePipeline:
      PipelineStage[] = [
      {
        $match:
          paymentMatch,
      },

      {
        $lookup: {
          from: "users",

          localField:
            "customerId",

          foreignField:
            "_id",

          as: "customer",
        },
      },

      {
        $unwind: {
          path: "$customer",

          preserveNullAndEmptyArrays:
            false,
        },
      },

      {
        $addFields: {
          customerIdString: {
            $toString:
              "$customer._id",
          },
        },
      },
    ];

    /* =======================================================
       SEARCH
    ======================================================== */

    if (search) {
      const safeSearch =
        search.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );

      const searchRegex =
        new RegExp(
          safeSearch,
          "i",
        );

      basePipeline.push({
        $match: {
          $or: [
            {
              "customer.name":
                searchRegex,
            },

            {
              customerIdString:
                searchRegex,
            },
          ],
        },
      });
    }

    /* =======================================================
       ACCOUNT STATUS
    ======================================================== */

    if (status) {
      basePipeline.push({
        $match: {
          "customer.accountStatus":
            status,
        },
      });
    }

    /* =======================================================
       KYC STATUS
    ======================================================== */

    if (kycStatus) {
      basePipeline.push({
        $match: {
          "customer.kycStatus":
            kycStatus,
        },
      });
    }

    /* =======================================================
       GROUP
    ======================================================== */

    basePipeline.push({
      $group: {
        _id:
          "$customer._id",

        name: {
          $first:
            "$customer.name",
        },

        avatarUrl: {
          $first:
            "$customer.avatarUrl",
        },

        accountStatus: {
          $first:
            "$customer.accountStatus",
        },

        kycStatus: {
          $first:
            "$customer.kycStatus",
        },

        emailVerified: {
          $first:
            "$customer.emailVerified",
        },

        customerCreatedAt: {
          $first:
            "$customer.createdAt",
        },

        totalPayments: {
          $sum: 1,
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

        failedPayments: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$status",
                  [
                    "failed",
                    "cancelled",
                    "expired",
                  ],
                ],
              },
              1,
              0,
            ],
          },
        },

        totalVolume: {
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

        successfulVolume: {
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

        lastPaymentAt: {
          $max:
            "$createdAt",
        },

        firstPaymentAt: {
          $min:
            "$createdAt",
        },
      },
    });

    /* =======================================================
       DERIVED METRICS
    ======================================================== */

    basePipeline.push({
      $addFields: {
        averagePaymentValue: {
          $cond: [
            {
              $gt: [
                "$successfulPayments",
                0,
              ],
            },

            {
              $divide: [
                "$successfulVolume",
                "$successfulPayments",
              ],
            },

            0,
          ],
        },

        successRate: {
          $cond: [
            {
              $gt: [
                "$totalPayments",
                0,
              ],
            },

            {
              $multiply: [
                {
                  $divide: [
                    "$successfulPayments",
                    "$totalPayments",
                  ],
                },

                100,
              ],
            },

            0,
          ],
        },
      },
    });

    /* =======================================================
       SORT
    ======================================================== */

    basePipeline.push({
      $sort: {
        lastPaymentAt: -1,
      },
    });

    /* =======================================================
       FACET
    ======================================================== */

    const aggregateResult =
      await Payment.aggregate([
        ...basePipeline,

        {
          $facet: {
            metadata: [
              {
                $count:
                  "total",
              },
            ],

            customers: [
              {
                $skip:
                  skip,
              },

              {
                $limit:
                  limit,
              },
            ],
          },
        },
      ]);

    const result =
      aggregateResult[0];

    /* =======================================================
       PAGINATION
    ======================================================== */

    const total =
      Number(
        result?.metadata?.[0]
          ?.total ?? 0,
      );

    const totalPages =
      Math.max(
        Math.ceil(
          total / limit,
        ),
        1,
      );

    const rawCustomers =
      Array.isArray(
        result?.customers,
      )
        ? result.customers
        : [];

    /* =======================================================
       MAP
    ======================================================== */

    const customers =
      rawCustomers.map(
        (
          item: Record<
            string,
            unknown
          >,
        ) => {
          const totalPayments =
            Number(
              item.totalPayments ??
                0,
            );

          const successfulPayments =
            Number(
              item.successfulPayments ??
                0,
            );

          return {
            customerId:
              String(
                item._id,
              ),

            customer: {
              name:
                typeof item.name ===
                "string"
                  ? item.name
                  : "Customer",

              avatarUrl:
                typeof item.avatarUrl ===
                "string"
                  ? item.avatarUrl
                  : undefined,

              accountStatus:
                typeof item.accountStatus ===
                "string"
                  ? item.accountStatus
                  : undefined,

              kycStatus:
                typeof item.kycStatus ===
                "string"
                  ? item.kycStatus
                  : undefined,

              emailVerified:
                typeof item.emailVerified ===
                "boolean"
                  ? item.emailVerified
                  : undefined,

              createdAt:
                item.customerCreatedAt
                  ? new Date(
                      String(
                        item.customerCreatedAt,
                      ),
                    )
                  : undefined,
            },

            totalPayments,

            successfulPayments,

            pendingPayments:
              Number(
                item.pendingPayments ??
                  0,
              ),

            failedPayments:
              Number(
                item.failedPayments ??
                  0,
              ),

            totalVolume:
              toNumberString(
                item.totalVolume,
              ),

            averagePaymentValue:
              toNumberString(
                item.averagePaymentValue,
              ),

            successRate:
              Number(
                Number(
                  item.successRate ??
                    0,
                ).toFixed(2),
              ),

            lastPaymentAt:
              item.lastPaymentAt
                ? new Date(
                    String(
                      item.lastPaymentAt,
                    ),
                  )
                : null,

            firstPaymentAt:
              item.firstPaymentAt
                ? new Date(
                    String(
                      item.firstPaymentAt,
                    ),
                  )
                : null,
          };
        },
      );

    /* =======================================================
       RESULT
    ======================================================== */

    return {
      customers,

      pagination: {
        page,
        limit,
        total,
        totalPages,

        hasNextPage:
          page < totalPages,

        hasPreviousPage:
          page > 1,
      },

      filters: {
        search,
        status,
        kycStatus,
        from,
        to,
      },
    };
  };