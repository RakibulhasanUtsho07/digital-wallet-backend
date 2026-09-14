import mongoose from "mongoose";

import {
  Payment,
} from "../models/Payment.js";

import {
  User,
} from "../models/User.js";

import {
  decryptData,
  createLookupHash,
  normalizeEmail,
} from "../utils/crypto.js";

/* =========================================================
   SAFE DECRYPT
========================================================= */

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

const safeDecrypt = (
  value:
    | EncryptedValue
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(
      value
    );
  } catch {
    return "";
  }
};

/* =========================================================
   ESCAPE REGEX
========================================================= */

const escapeRegex = (
  value: string
): string => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =========================================================
   DECIMAL128 → STRING
========================================================= */

const decimalToString = (
  value:
    | mongoose.Types.Decimal128
    | undefined
): string | null => {
  if (!value) {
    return null;
  }

  try {
    return value.toString();
  } catch {
    return null;
  }
};

/* =========================================================
   PAYMENT SEARCH
========================================================= */

export const searchSupportPayments =
  async ({
    search,
    status,
    provider,
    sourceType,
    mode,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    status?: string;
    provider?: string;
    sourceType?: string;
    mode?: string;
    page?: number;
    limit?: number;
  }) => {
    /* =====================================================
       PAGINATION
    ====================================================== */

    const safePage =
      Math.max(
        1,
        Math.floor(page)
      );

    const safeLimit =
      Math.min(
        50,
        Math.max(
          1,
          Math.floor(limit)
        )
      );

    const skip =
      (safePage - 1) *
      safeLimit;

    /* =====================================================
       QUERY CONDITIONS
    ====================================================== */

    /*
     * We intentionally use a plain object here instead of
     * mongoose.FilterQuery because some installed Mongoose
     * versions do not expose FilterQuery as a public export.
     */
    const andConditions:
      Record<
        string,
        unknown
      >[] = [];

    /* =====================================================
       STATUS
    ====================================================== */

    if (
      status &&
      [
        "pending",
        "authorized",
        "captured",
        "completed",
        "failed",
        "cancelled",
        "expired",
      ].includes(
        status
      )
    ) {
      andConditions.push({
        status,
      });
    }

    /* =====================================================
       PROVIDER
    ====================================================== */

    if (
      provider &&
      provider.trim()
    ) {
      andConditions.push({
        provider:
          provider
            .trim()
            .toLowerCase(),
      });
    }

    /* =====================================================
       SOURCE TYPE
    ====================================================== */

    if (
      sourceType &&
      [
        "paypal",
        "card",
        "local_psp",
        "wallet",
      ].includes(
        sourceType
      )
    ) {
      andConditions.push({
        sourceType,
      });
    }

    /* =====================================================
       MODE
    ====================================================== */

    if (
      mode &&
      [
        "test",
        "live",
      ].includes(
        mode
      )
    ) {
      andConditions.push({
        mode,
      });
    }

    /* =====================================================
       SEARCH
    ====================================================== */

    const cleanSearch =
      search
        ?.trim()
        .slice(
          0,
          120
        );

    if (
      cleanSearch
    ) {
      const regex =
        new RegExp(
          escapeRegex(
            cleanSearch
          ),
          "i"
        );

      const searchConditions:
        Record<
          string,
          unknown
        >[] = [
        {
          paymentId: {
            $regex:
              regex,
          },
        },
        {
          providerPaymentId: {
            $regex:
              regex,
          },
        },
        {
          merchantReference: {
            $regex:
              regex,
          },
        },
      ];

      /* ================================================
         CUSTOMER ID SEARCH
      ================================================= */

      if (
        mongoose.Types.ObjectId.isValid(
          cleanSearch
        )
      ) {
        searchConditions.push({
          customerId:
            new mongoose.Types.ObjectId(
              cleanSearch
            ),
        });
      }

      /* ================================================
         CUSTOMER EMAIL SEARCH
      ================================================= */

      if (
        cleanSearch.includes(
          "@"
        )
      ) {
        const normalizedEmail =
          normalizeEmail(
            cleanSearch
          );

        if (
          normalizedEmail
        ) {
          const customer =
            await User.findOne({
              emailLookup:
                createLookupHash(
                  normalizedEmail
                ),
            })
              .select(
                "_id"
              )
              .lean();

          if (
            customer
          ) {
            searchConditions.push({
              customerId:
                customer._id,
            });
          }
        }
      }

      andConditions.push({
        $or:
          searchConditions,
      });
    }

    /* =====================================================
       FINAL PAYMENT QUERY
    ====================================================== */

    const paymentQuery:
      Record<
        string,
        unknown
      > =
      andConditions.length > 0
        ? {
            $and:
              andConditions,
          }
        : {};

    /* =====================================================
       LOAD PAYMENTS
    ====================================================== */

    const [
      payments,
      total,
    ] =
      await Promise.all([
        Payment.find(
          paymentQuery as any
        )
          .select(
            [
              "paymentId",
              "merchantId",
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
              "providerPaymentId",
              "merchantReference",
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
            ].join(" ")
          )
          .sort({
            createdAt:
              -1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),

        Payment.countDocuments(
          paymentQuery as any
        ),
      ]);

    /* =====================================================
       CUSTOMER IDS
    ====================================================== */

    /*
     * IMPORTANT:
     * Do not use `.filter(Boolean)` here.
     *
     * We explicitly narrow the type to ObjectId so that
     * MongoDB `$in` receives the exact type expected by
     * Mongoose.
     */

    const customerIds =
      Array.from(
        new Map(
          payments
            .map(
              (
                payment
              ) =>
                payment.customerId
            )
            .filter(
              (
                id
              ): id is mongoose.Types.ObjectId =>
                id instanceof
                mongoose.Types.ObjectId
            )
            .map(
              (
                id
              ) => [
                id.toString(),
                id,
              ]
            )
        ).values()
      );

    /* =====================================================
       LOAD CUSTOMERS
    ====================================================== */

    const customers =
      customerIds.length > 0
        ? await User.find({
            _id: {
              $in:
                customerIds,
            },
          })
            .select(
              "name emailEncrypted role kycStatus walletId"
            )
            .lean()
        : [];

    /* =====================================================
       CUSTOMER MAP
    ====================================================== */

    const customerMap =
      new Map(
        customers.map(
          (
            customer
          ) => [
            customer._id.toString(),
            customer,
          ]
        )
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      payments:
        payments.map(
          (
            payment
          ) => {
            const customer =
              payment.customerId
                ? customerMap.get(
                    payment.customerId.toString()
                  )
                : null;

            return {
              id:
                payment._id.toString(),

              paymentId:
                payment.paymentId,

              merchantId:
                payment.merchantId.toString(),

              customerId:
                payment.customerId
                  ? payment.customerId.toString()
                  : null,

              orderId:
                payment.orderId
                  ? payment.orderId.toString()
                  : null,

              amount:
                decimalToString(
                  payment.amount
                ),

              currency:
                payment.currency,

              feeAmount:
                decimalToString(
                  payment.feeAmount
                ),

              netAmount:
                decimalToString(
                  payment.netAmount
                ),

              sourceType:
                payment.sourceType,

              provider:
                payment.provider,

              mode:
                payment.mode,

              status:
                payment.status,

              providerPaymentId:
                payment.providerPaymentId ??
                null,

              merchantReference:
                payment.merchantReference ??
                null,

              failure:
                payment.failureCode ||
                payment.failureMessage
                  ? {
                      code:
                        payment.failureCode ??
                        null,

                      message:
                        payment.failureMessage ??
                        null,
                    }
                  : null,

              customer:
                customer
                  ? {
                      id:
                        customer._id.toString(),

                      name:
                        customer.name,

                      email:
                        safeDecrypt(
                          customer.emailEncrypted
                        ),

                      role:
                        customer.role,

                      kycStatus:
                        customer.kycStatus,

                      walletLinked:
                        Boolean(
                          customer.walletId
                        ),
                    }
                  : null,

              timestamps: {
                createdAt:
                  new Date(
                    payment.createdAt
                  ).toISOString(),

                updatedAt:
                  new Date(
                    payment.updatedAt
                  ).toISOString(),

                authorizedAt:
                  payment.authorizedAt
                    ? new Date(
                        payment.authorizedAt
                      ).toISOString()
                    : null,

                capturedAt:
                  payment.capturedAt
                    ? new Date(
                        payment.capturedAt
                      ).toISOString()
                    : null,

                completedAt:
                  payment.completedAt
                    ? new Date(
                        payment.completedAt
                      ).toISOString()
                    : null,

                failedAt:
                  payment.failedAt
                    ? new Date(
                        payment.failedAt
                      ).toISOString()
                    : null,

                cancelledAt:
                  payment.cancelledAt
                    ? new Date(
                        payment.cancelledAt
                      ).toISOString()
                    : null,

                expiredAt:
                  payment.expiredAt
                    ? new Date(
                        payment.expiredAt
                      ).toISOString()
                    : null,
              },
            };
          }
        ),

      total,

      page:
        safePage,

      limit:
        safeLimit,

      totalPages:
        Math.ceil(
          total /
            safeLimit
        ),
    };
  };

/* =========================================================
   PAYMENT DETAIL
========================================================= */

export const getSupportPaymentDetail =
  async (
    paymentId: string
  ) => {
    const cleanPaymentId =
      paymentId
        .trim()
        .slice(
          0,
          120
        );

    if (
      !cleanPaymentId
    ) {
      return null;
    }

    /* =====================================================
       PAYMENT
    ====================================================== */

    const payment =
      await Payment.findOne({
        paymentId:
          cleanPaymentId,
      })
        .select(
          [
            "paymentId",
            "merchantId",
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
            "providerPaymentId",
            "merchantReference",
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
          ].join(" ")
        )
        .lean();

    if (
      !payment
    ) {
      return null;
    }

    /* =====================================================
       CUSTOMER
    ====================================================== */

    const customer =
      payment.customerId
        ? await User.findById(
            payment.customerId
          )
            .select(
              "name emailEncrypted role kycStatus walletId"
            )
            .lean()
        : null;

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      id:
        payment._id.toString(),

      paymentId:
        payment.paymentId,

      merchantId:
        payment.merchantId.toString(),

      customerId:
        payment.customerId
          ? payment.customerId.toString()
          : null,

      orderId:
        payment.orderId
          ? payment.orderId.toString()
          : null,

      amount:
        decimalToString(
          payment.amount
        ),

      currency:
        payment.currency,

      feeAmount:
        decimalToString(
          payment.feeAmount
        ),

      netAmount:
        decimalToString(
          payment.netAmount
        ),

      sourceType:
        payment.sourceType,

      provider:
        payment.provider,

      mode:
        payment.mode,

      status:
        payment.status,

      providerPaymentId:
        payment.providerPaymentId ??
        null,

      merchantReference:
        payment.merchantReference ??
        null,

      failure:
        payment.failureCode ||
        payment.failureMessage
          ? {
              code:
                payment.failureCode ??
                null,

              message:
                payment.failureMessage ??
                null,
            }
          : null,

      customer:
        customer
          ? {
              id:
                customer._id.toString(),

              name:
                customer.name,

              email:
                safeDecrypt(
                  customer.emailEncrypted
                ),

              role:
                customer.role,

              kycStatus:
                customer.kycStatus,

              walletLinked:
                Boolean(
                  customer.walletId
                ),
            }
          : null,

      timestamps: {
        createdAt:
          new Date(
            payment.createdAt
          ).toISOString(),

        updatedAt:
          new Date(
            payment.updatedAt
          ).toISOString(),

        authorizedAt:
          payment.authorizedAt
            ? new Date(
                payment.authorizedAt
              ).toISOString()
            : null,

        capturedAt:
          payment.capturedAt
            ? new Date(
                payment.capturedAt
              ).toISOString()
            : null,

        completedAt:
          payment.completedAt
            ? new Date(
                payment.completedAt
              ).toISOString()
            : null,

        failedAt:
          payment.failedAt
            ? new Date(
                payment.failedAt
              ).toISOString()
            : null,

        cancelledAt:
          payment.cancelledAt
            ? new Date(
                payment.cancelledAt
              ).toISOString()
            : null,

        expiredAt:
          payment.expiredAt
            ? new Date(
                payment.expiredAt
              ).toISOString()
            : null,
      },

      support: {
        readOnly:
          true,

        canExecuteFinancialAction:
          false,
      },
    };
  };