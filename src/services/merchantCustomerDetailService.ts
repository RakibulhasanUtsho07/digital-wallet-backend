import mongoose, {
  type PipelineStage,
} from "mongoose";

import { Merchant } from "../models/Merchant.js";
import { Payment } from "../models/Payment.js";
import { User } from "../models/User.js";

/* =========================================================
   TYPES
========================================================= */

export interface MerchantCustomerDetailResult {
  merchant: {
    _id: string;
    businessName?: string;
    displayName?: string;
    defaultCurrency?: string;
  };

  customer: {
    customerId: string;
    name: string;
    avatarUrl?: string;
    accountStatus?: string;
    kycStatus?: string;
    emailVerified?: boolean;
    emailVerifiedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  };

  summary: {
    totalPayments: number;
    successfulPayments: number;
    pendingPayments: number;
    failedPayments: number;
    totalVolume: string;
    averagePaymentValue: string;
    successRate: number;
    firstPaymentAt: Date | null;
    lastPaymentAt: Date | null;
  };

  payments: Array<{
    paymentId: string;
    orderId?: string | null;
    amount: string;
    currency: string;
    feeAmount: string;
    netAmount: string;
    sourceType: string;
    provider: string;
    mode: string;
    status: string;
    merchantReference?: string | null;
    providerPaymentId?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    authorizedAt?: Date | null;
    capturedAt?: Date | null;
    completedAt?: Date | null;
    failedAt?: Date | null;
    cancelledAt?: Date | null;
    expiredAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

/* =========================================================
   INTERNAL MERCHANT PROJECTION TYPE

   This avoids depending on whether IMerchant currently
   declares displayName.
========================================================= */

interface MerchantProjection {
  _id: mongoose.Types.ObjectId;
  businessName?: string;
  displayName?: string;
  defaultCurrency?: string;
}

/* =========================================================
   HELPERS
========================================================= */

const decimalToString = (
  value: unknown,
): string => {
  if (
    value === undefined ||
    value === null
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

/* =========================================================
   ERROR STATUS
========================================================= */

const getErrorStatus = (
  message: string,
): number => {
  if (
    message ===
      "Merchant account not found." ||
    message ===
      "Customer not found."
  ) {
    return 404;
  }

  if (
    message ===
      "Invalid merchant owner ID." ||
    message ===
      "Invalid customer ID."
  ) {
    return 400;
  }

  if (
    message ===
    "Authenticated merchant owner is required."
  ) {
    return 400;
  }

  return 500;
};

/* =========================================================
   GET MERCHANT CUSTOMER DETAIL
========================================================= */

export const getMerchantCustomerDetail =
  async ({
    ownerId,
    customerId,
  }: {
    ownerId: string;
    customerId: string;
  }): Promise<MerchantCustomerDetailResult> => {
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

    if (
      !customerId ||
      !mongoose.isValidObjectId(
        customerId,
      )
    ) {
      throw new Error(
        "Invalid customer ID.",
      );
    }

    const merchantOwnerId =
      new mongoose.Types.ObjectId(
        ownerId,
      );

    const targetCustomerId =
      new mongoose.Types.ObjectId(
        customerId,
      );

    /* =======================================================
       MERCHANT
    ======================================================== */

    const merchant =
      await Merchant.findOne({
        ownerId:
          merchantOwnerId,
      })
        .select(
          "_id businessName displayName defaultCurrency",
        )
        .lean() as MerchantProjection | null;

    if (!merchant) {
      throw new Error(
        "Merchant account not found.",
      );
    }

    /* =======================================================
       VERIFY CUSTOMER BELONGS TO THIS MERCHANT

       Only expose customers who have at least one
       payment belonging to this merchant.
    ======================================================== */

    const customerPaymentExists =
      await Payment.exists({
        merchantId:
          merchant._id,

        customerId:
          targetCustomerId,
      });

    if (!customerPaymentExists) {
      throw new Error(
        "Customer not found.",
      );
    }

    /* =======================================================
       CUSTOMER

       Sensitive fields are intentionally excluded.
    ======================================================== */

    const customer =
      await User.findById(
        targetCustomerId,
      )
        .select(
          [
            "name",
            "avatarUrl",
            "accountStatus",
            "emailVerified",
            "emailVerifiedAt",
            "kycStatus",
            "createdAt",
            "updatedAt",
          ].join(" "),
        )
        .lean();

    if (!customer) {
      throw new Error(
        "Customer not found.",
      );
    }

    /* =======================================================
       PAYMENT SUMMARY
    ======================================================== */

    const summaryResult =
      await Payment.aggregate(
        [
          {
            $match: {
              merchantId:
                merchant._id,

              customerId:
                targetCustomerId,
            },
          },

          {
            $group: {
              _id: null,

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

              firstPaymentAt: {
                $min:
                  "$createdAt",
              },

              lastPaymentAt: {
                $max:
                  "$createdAt",
              },
            },
          },

          {
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
                      "$totalVolume",
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
          },
        ] as PipelineStage[],
      );

    /* =======================================================
       DEFAULT SUMMARY
    ======================================================== */

    const summary =
      summaryResult[0] ?? {
        totalPayments: 0,
        successfulPayments: 0,
        pendingPayments: 0,
        failedPayments: 0,
        totalVolume: "0",
        averagePaymentValue: "0",
        successRate: 0,
        firstPaymentAt:
          null,
        lastPaymentAt:
          null,
      };

    /* =======================================================
       PAYMENT HISTORY
    ======================================================== */

    const paymentHistory =
      await Payment.find({
        merchantId:
          merchant._id,

        customerId:
          targetCustomerId,
      })
        .select(
          [
            "paymentId",
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
            "providerPaymentId",
            "failureCode",
            "failureMessage",
            "authorizedAt",
            "capturedAt",
            "completedAt",
            "failedAt",
            "cancelledAt",
            "expiredAt",
            "createdAt",
            "updatedAt",
          ].join(" "),
        )
        .sort({
          createdAt:
            -1,
        })
        .limit(50)
        .lean();

    /* =======================================================
       RESPONSE
    ======================================================== */

    return {
      merchant: {
        _id:
          String(
            merchant._id,
          ),

        businessName:
          merchant.businessName,

        displayName:
          merchant.displayName,

        defaultCurrency:
          merchant.defaultCurrency,
      },

      customer: {
        customerId:
          String(
            customer._id,
          ),

        name:
          customer.name,

        avatarUrl:
          customer.avatarUrl,

        accountStatus:
          customer.accountStatus,

        kycStatus:
          customer.kycStatus,

        emailVerified:
          customer.emailVerified,

        emailVerifiedAt:
          customer.emailVerifiedAt,

        createdAt:
          customer.createdAt,

        updatedAt:
          customer.updatedAt,
      },

      summary: {
        totalPayments:
          Number(
            summary.totalPayments ??
              0,
          ),

        successfulPayments:
          Number(
            summary.successfulPayments ??
              0,
          ),

        pendingPayments:
          Number(
            summary.pendingPayments ??
              0,
          ),

        failedPayments:
          Number(
            summary.failedPayments ??
              0,
          ),

        totalVolume:
          decimalToString(
            summary.totalVolume,
          ),

        averagePaymentValue:
          decimalToString(
            summary.averagePaymentValue,
          ),

        successRate:
          Number(
            Number(
              summary.successRate ??
                0,
            ).toFixed(2),
          ),

        firstPaymentAt:
          summary.firstPaymentAt
            ? new Date(
                summary.firstPaymentAt,
              )
            : null,

        lastPaymentAt:
          summary.lastPaymentAt
            ? new Date(
                summary.lastPaymentAt,
              )
            : null,
      },

      payments:
        paymentHistory.map(
          (payment) => ({
            paymentId:
              payment.paymentId,

            orderId:
              payment.orderId
                ? String(
                    payment.orderId,
                  )
                : null,

            amount:
              decimalToString(
                payment.amount,
              ),

            currency:
              payment.currency,

            feeAmount:
              decimalToString(
                payment.feeAmount,
              ),

            netAmount:
              decimalToString(
                payment.netAmount,
              ),

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

            providerPaymentId:
              payment.providerPaymentId ??
              null,

            failureCode:
              payment.failureCode ??
              null,

            failureMessage:
              payment.failureMessage ??
              null,

            authorizedAt:
              payment.authorizedAt ??
              null,

            capturedAt:
              payment.capturedAt ??
              null,

            completedAt:
              payment.completedAt ??
              null,

            failedAt:
              payment.failedAt ??
              null,

            cancelledAt:
              payment.cancelledAt ??
              null,

            expiredAt:
              payment.expiredAt ??
              null,

            createdAt:
              payment.createdAt,

            updatedAt:
              payment.updatedAt,
          }),
        ),
    };
  };

/* =========================================================
   EXPORT
========================================================= */

export {
  getErrorStatus,
};