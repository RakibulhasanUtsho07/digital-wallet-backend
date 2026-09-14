import mongoose, {
  type PipelineStage,
} from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  User,
} from "../models/User.js";

import {
  Dispute,
  type DisputeStatus,
} from "../models/Dispute.js";

/* =========================================================
   TYPES
========================================================= */

export interface MerchantDisputeListInput {
  ownerId: string;
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  status?: unknown;
  from?: unknown;
  to?: unknown;
}

export interface MerchantDisputeListResult {
  disputes: Array<{
    disputeId: string;
    paymentId: string;
    customerId: string | null;
    customerName: string;
    customerAvatarUrl?: string;
    amount: string;
    currency: string;
    reason: string;
    description?: string | null;
    status: string;
    merchantResponse?: string | null;
    resolutionNote?: string | null;
    resolvedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;

  summary: {
    total: number;
    disputed: number;
    underReview: number;
    won: number;
    lost: number;
    disputedAmount: string;
  };

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
    from: string;
    to: string;
  };
}

/* =========================================================
   HELPERS
========================================================= */

const decimalToString = (
  value: unknown,
): string => {
  if (
    value === null ||
    value === undefined
  ) {
    return "0";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
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
  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 1
  ) {
    return 1;
  }

  return parsed;
};

const normalizeLimit = (
  value: unknown,
): number => {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 5
  ) {
    return 20;
  }

  return Math.min(
    parsed,
    100,
  );
};

const normalizeText = (
  value: unknown,
  maxLength = 200,
): string => {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength,
    );
};

const escapeRegex = (
  value: string,
): string => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
};

const parseDate = (
  value: unknown,
  endOfDay = false,
): Date | undefined => {
  const normalized =
    normalizeText(
      value,
      30,
    );

  if (!normalized) {
    return undefined;
  }

  const date =
    new Date(
      normalized,
    );

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
   MERCHANT LOOKUP
========================================================= */

async function findMerchantForOwner(
  ownerId: string,
) {
  if (
    !mongoose.isValidObjectId(
      ownerId,
    )
  ) {
    throw new Error(
      "Invalid merchant owner ID.",
    );
  }

  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          ownerId,
        ),
    })
      .select(
        [
          "_id",
          "businessName",
          "displayName",
          "businessDisplayName",
          "defaultCurrency",
        ].join(" "),
      )
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found.",
    );
  }

  return merchant;
}

/* =========================================================
   LIST MERCHANT DISPUTES
========================================================= */

export const getMerchantDisputes =
  async (
    input: MerchantDisputeListInput,
  ): Promise<MerchantDisputeListResult> => {
    if (!input.ownerId) {
      throw new Error(
        "Authenticated merchant owner is required.",
      );
    }

    const merchant =
      await findMerchantForOwner(
        input.ownerId,
      );

    const page =
      normalizePage(
        input.page,
      );

    const limit =
      normalizeLimit(
        input.limit,
      );

    const search =
      normalizeText(
        input.search,
        150,
      );

    const status =
      [
        "disputed",
        "under_review",
        "won",
        "lost",
      ].includes(
        String(
          input.status,
        ),
      )
        ? (String(
            input.status,
          ) as DisputeStatus)
        : "";

    const from =
      normalizeText(
        input.from,
        30,
      );

    const to =
      normalizeText(
        input.to,
        30,
      );

    const fromDate =
      parseDate(
        from,
      );

    const toDate =
      parseDate(
        to,
        true,
      );

    /* =======================================================
       BASE FILTER
    ======================================================== */

    const filter:
      Record<
        string,
        unknown
      > = {
      merchantId:
        merchant._id,
    };

    if (status) {
      filter.status =
        status;
    }

    if (
      fromDate ||
      toDate
    ) {
      const createdAt:
        Record<
          string,
          Date
        > = {};

      if (fromDate) {
        createdAt.$gte =
          fromDate;
      }

      if (toDate) {
        createdAt.$lte =
          toDate;
      }

      filter.createdAt =
        createdAt;
    }

    /* =======================================================
       SEARCH
    ======================================================== */

    if (search) {
      const searchRegex =
        new RegExp(
          escapeRegex(
            search,
          ),
          "i",
        );

      const matchingPayments =
        await Payment.find({
          merchantId:
            merchant._id,

          $or: [
            {
              paymentId:
                searchRegex,
            },

            {
              merchantReference:
                searchRegex,
            },
          ],
        })
          .select("_id")
          .lean();

      const matchingCustomers =
        await User.find({
          $or: [
            {
              name:
                searchRegex,
            },
          ],
        })
          .select("_id")
          .lean();

      const paymentIds =
        matchingPayments.map(
          (payment) =>
            payment._id,
        );

      const customerIds =
        matchingCustomers.map(
          (customer) =>
            customer._id,
        );

      filter.$or = [
        {
          disputeId:
            searchRegex,
        },

        ...(paymentIds.length
          ? [
              {
                paymentId: {
                  $in:
                    paymentIds,
                },
              },
            ]
          : []),

        ...(customerIds.length
          ? [
              {
                customerId: {
                  $in:
                    customerIds,
                },
              },
            ]
          : []),
      ];
    }

    /* =======================================================
       TOTAL
    ======================================================== */

    const total =
      await Dispute.countDocuments(
        filter,
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total /
            limit,
        ),
      );

    const safePage =
      Math.min(
        page,
        totalPages,
      );

    /* =======================================================
       DISPUTES
    ======================================================== */

    const disputes =
      await Dispute.find(
        filter,
      )
        .sort({
          createdAt: -1,
        })
        .skip(
          (
            safePage -
            1
          ) *
            limit,
        )
        .limit(
          limit,
        )
        .lean();

    /* =======================================================
       CUSTOMER DATA
    ======================================================== */

    const customerIds =
      disputes
        .map(
          (dispute) =>
            dispute.customerId,
        )
        .filter(
          (
            value,
          ): value is mongoose.Types.ObjectId =>
            Boolean(value),
        );

    const customers =
      customerIds.length
        ? await User.find({
            _id: {
              $in:
                customerIds,
            },
          })
            .select(
              "_id name avatarUrl",
            )
            .lean()
        : [];

    const customerMap =
      new Map(
        customers.map(
          (customer) => [
            customer._id.toString(),
            customer,
          ],
        ),
      );

    /* =======================================================
       SUMMARY
    ======================================================== */

    const summaryResult =
      await Dispute.aggregate<{
        total: number;
        disputed: number;
        underReview: number;
        won: number;
        lost: number;
        disputedAmount: unknown;
      }>(
        [
          {
            $match: {
              merchantId:
                merchant._id,
            },
          },

          {
            $group: {
              _id: null,

              total: {
                $sum: 1,
              },

              disputed: {
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

              underReview: {
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

              won: {
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

              lost: {
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

              disputedAmount: {
                $sum: {
                  $cond: [
                    {
                      $in: [
                        "$status",
                        [
                          "disputed",
                          "under_review",
                        ],
                      ],
                    },

                    "$amount",

                    0,
                  ],
                },
              },
            },
          },
        ] as PipelineStage[],
      );

    const summary =
      summaryResult[0];

    /* =======================================================
       RESPONSE
    ======================================================== */

    return {
      disputes:
        disputes.map(
          (dispute) => {
            const customer =
              dispute.customerId
                ? customerMap.get(
                    dispute.customerId.toString(),
                  )
                : undefined;

            return {
              disputeId:
                dispute.disputeId,

              paymentId:
                String(
                  dispute.paymentId,
                ),

              customerId:
                dispute.customerId
                  ? String(
                      dispute.customerId,
                    )
                  : null,

              customerName:
                customer?.name ||
                "Unknown customer",

              customerAvatarUrl:
                customer?.avatarUrl,

              amount:
                decimalToString(
                  dispute.amount,
                ),

              currency:
                dispute.currency,

              reason:
                dispute.reason,

              description:
                dispute.description ??
                null,

              status:
                dispute.status,

              merchantResponse:
                dispute.merchantResponse ??
                null,

              resolutionNote:
                dispute.resolutionNote ??
                null,

              resolvedAt:
                dispute.resolvedAt ??
                null,

              createdAt:
                dispute.createdAt,

              updatedAt:
                dispute.updatedAt,
            };
          },
        ),

      summary: {
        total:
          summary?.total ??
          0,

        disputed:
          summary?.disputed ??
          0,

        underReview:
          summary?.underReview ??
          0,

        won:
          summary?.won ??
          0,

        lost:
          summary?.lost ??
          0,

        disputedAmount:
          decimalToString(
            summary?.disputedAmount,
          ),
      },

      pagination: {
        page:
          safePage,

        limit,

        total,

        totalPages,

        hasNextPage:
          safePage <
          totalPages,

        hasPreviousPage:
          safePage >
          1,
      },

      filters: {
        search,
        status,
        from,
        to,
      },
    };
  };