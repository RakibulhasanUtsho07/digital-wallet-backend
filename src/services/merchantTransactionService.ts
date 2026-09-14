import mongoose from "mongoose";

import { Merchant } from "../models/Merchant.js";
import { Payment } from "../models/Payment.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantTransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export type MerchantTransactionType =
  | "PAYMENT"
  | "REFUND"
  | "PAYOUT";

export interface MerchantTransactionListInput {
  ownerId: string;

  page?: unknown;
  limit?: unknown;

  search?: unknown;
  status?: unknown;
  type?: unknown;
  currency?: unknown;
  provider?: unknown;
  mode?: unknown;

  from?: unknown;
  to?: unknown;
}

/* =========================================================
   OUTPUT TYPES
========================================================= */

export interface MerchantTransactionRow {
  transactionId: string;

  type: MerchantTransactionType;

  paymentId: string;

  orderId: string | null;

  customerId: string | null;

  amount: number;

  feeAmount: number;

  netAmount: number | null;

  currency: string;

  provider: string;

  sourceType: string;

  mode: string;

  status: MerchantTransactionStatus;

  merchantReference: string | null;

  providerReference: string | null;

  createdAt: Date;

  completedAt: Date | null;

  failedAt: Date | null;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown,
  maxLength = 200
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const result =
    value.trim();

  if (!result) {
    return undefined;
  }

  return result.slice(
    0,
    maxLength
  );
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  max: number
): number {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(parsed),
    max
  );
}

function parseDate(
  value: unknown,
  endOfDay = false
): Date | undefined {
  const text =
    normalizeText(
      value,
      50
    );

  if (!text) {
    return undefined;
  }

  const date =
    new Date(text);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return undefined;
  }

  if (endOfDay) {
    date.setHours(
      23,
      59,
      59,
      999
    );
  }

  return date;
}

function decimalToNumber(
  value: unknown
): number {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const numeric =
    Number(
      String(value)
    );

  return Number.isFinite(
    numeric
  )
    ? numeric
    : 0;
}

function roundMoney(
  value: number
): number {
  return Math.round(
    (
      value +
      Number.EPSILON
    ) * 100
  ) / 100;
}

function toObjectId(
  value: string
): mongoose.Types.ObjectId {
  if (
    !mongoose.isValidObjectId(
      value
    )
  ) {
    throw new Error(
      "Invalid owner ID."
    );
  }

  return new mongoose.Types.ObjectId(
    value
  );
}

/* =========================================================
   MERCHANT LOOKUP
========================================================= */

async function getMerchantByOwner(
  ownerId: string
) {
  const normalizedOwnerId =
    normalizeText(
      ownerId,
      100
    );

  if (!normalizedOwnerId) {
    throw new Error(
      "Merchant owner is required."
    );
  }

  const merchant =
    await Merchant.findOne({
      ownerId:
        toObjectId(
          normalizedOwnerId
        ),
    })
      .select(
        [
          "_id",
          "businessName",
          "businessDisplayName",
          "defaultCurrency",
          "status",
          "verificationStatus",
        ].join(" ")
      )
      .lean();

  if (!merchant) {
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
   LIST MERCHANT TRANSACTIONS
========================================================= */

export async function listMerchantTransactions(
  input: MerchantTransactionListInput
) {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  const page =
    normalizePositiveInteger(
      input.page,
      1,
      1000000
    );

  const limit =
    normalizePositiveInteger(
      input.limit,
      20,
      100
    );

  const skip =
    (page - 1) * limit;

  /*
   * IMPORTANT:
   * We intentionally read from Payment here instead of changing
   * the existing wallet Transaction model.
   *
   * Existing Transaction is used by user wallet transfers.
   */

  const filter:
    Record<
      string,
      unknown
    > = {
    merchantId:
      merchant._id,
  };

  /* -------------------------------------------------------
     STATUS
  ------------------------------------------------------- */

  const status =
    normalizeText(
      input.status,
      40
    );

  if (status) {
    filter.status =
      status.toLowerCase();
  }

  /* -------------------------------------------------------
     CURRENCY
  ------------------------------------------------------- */

  const currency =
    normalizeText(
      input.currency,
      10
    );

  if (currency) {
    filter.currency =
      currency.toUpperCase();
  }

  /* -------------------------------------------------------
     PROVIDER
  ------------------------------------------------------- */

  const provider =
    normalizeText(
      input.provider,
      80
    );

  if (provider) {
    filter.provider =
      provider.toLowerCase();
  }

  /* -------------------------------------------------------
     MODE
  ------------------------------------------------------- */

  if (
    input.mode === "test" ||
    input.mode === "live"
  ) {
    filter.mode =
      input.mode;
  }

  /* -------------------------------------------------------
     DATE RANGE
  ------------------------------------------------------- */

  const from =
    parseDate(
      input.from
    );

  const to =
    parseDate(
      input.to,
      true
    );

  if (from || to) {
    filter.createdAt = {
      ...(from
        ? {
            $gte: from,
          }
        : {}),

      ...(to
        ? {
            $lte: to,
          }
        : {}),
    };
  }

  /* -------------------------------------------------------
     SEARCH
  ------------------------------------------------------- */

  const search =
    normalizeText(
      input.search,
      100
    );

  if (search) {
    const escaped =
      search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const regex =
      new RegExp(
        escaped,
        "i"
      );

    filter.$or = [
      {
        paymentId:
          regex,
      },
      {
        merchantReference:
          regex,
      },
      {
        providerPaymentId:
          regex,
      },
      {
        orderId:
          mongoose.isValidObjectId(
            search
          )
            ? new mongoose.Types.ObjectId(
                search
              )
            : undefined,
      },
    ].filter(
      (
        item
      ) => {
        const values =
          Object.values(
            item
          );

        return values.some(
          (
            value
          ) =>
            value !==
            undefined
        );
      }
    );
  }

  /* -------------------------------------------------------
     TYPE
     
     Current gateway transaction read model is Payment-based.
     PAYMENT is the direct available type.
  ------------------------------------------------------- */

  const requestedType =
    normalizeText(
      input.type,
      40
    )?.toUpperCase();

  if (
    requestedType &&
    requestedType !== "PAYMENT"
  ) {
    return {
      merchant: {
        id:
          merchant._id.toString(),

        businessName:
          merchant.businessName,

        businessDisplayName:
          merchant.businessDisplayName ??
          null,

        defaultCurrency:
          merchant.defaultCurrency,
      },

      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },

      summary: {
        totalCount: 0,
        totalAmount: 0,
        completedCount: 0,
        completedAmount: 0,
        pendingCount: 0,
        failedCount: 0,
      },

      transactions: [],
    };
  }

  /* -------------------------------------------------------
     QUERY
  ------------------------------------------------------- */

  const [
    documents,
    total,
  ] =
    await Promise.all([
      Payment.find(
        filter
      )
        .select(
          [
            "paymentId",
            "orderId",
            "customerId",
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
            "createdAt",
            "completedAt",
            "failedAt",
          ].join(" ")
        )
        .sort({
          createdAt:
            -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Payment.countDocuments(
        filter
      ),
    ]);

  /* -------------------------------------------------------
     SUMMARY
  ------------------------------------------------------- */

  const summaryResult =
    await Payment.aggregate([
      {
        $match:
          filter,
      },

      {
        $group: {
          _id: null,

          totalCount: {
            $sum: 1,
          },

          totalAmount: {
            $sum: "$amount",
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

          completedAmount: {
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
        },
      },
    ]);

  const summary =
    summaryResult?.[0];

  const transactions:
    MerchantTransactionRow[] =
    documents.map(
      (
        payment
      ) => ({
        transactionId:
          payment.paymentId,

        type:
          "PAYMENT",

        paymentId:
          payment.paymentId,

        orderId:
          payment.orderId
            ? String(
                payment.orderId
              )
            : null,

        customerId:
          payment.customerId
            ? String(
                payment.customerId
              )
            : null,

        amount:
          roundMoney(
            decimalToNumber(
              payment.amount
            )
          ),

        feeAmount:
          roundMoney(
            decimalToNumber(
              payment.feeAmount
            )
          ),

        netAmount:
          payment.netAmount !==
          undefined
            ? roundMoney(
                decimalToNumber(
                  payment.netAmount
                )
              )
            : null,

        currency:
          payment.currency,

        provider:
          payment.provider,

        sourceType:
          payment.sourceType,

        mode:
          payment.mode,

        status:
          String(
            payment.status
          ).toUpperCase() as MerchantTransactionStatus,

        merchantReference:
          payment.merchantReference ??
          null,

        providerReference:
          payment.providerPaymentId ??
          null,

        createdAt:
          payment.createdAt,

        completedAt:
          payment.completedAt ??
          null,

        failedAt:
          payment.failedAt ??
          null,
      })
    );

  const totalPages =
    total === 0
      ? 0
      : Math.ceil(
          total / limit
        );

  return {
    merchant: {
      id:
        merchant._id.toString(),

      businessName:
        merchant.businessName,

      businessDisplayName:
        merchant.businessDisplayName ??
        null,

      defaultCurrency:
        merchant.defaultCurrency,
    },

    pagination: {
      page,
      limit,
      total,

      totalPages,
    },

    summary: {
      totalCount:
        Number(
          summary?.totalCount ??
            0
        ),

      totalAmount:
        roundMoney(
          decimalToNumber(
            summary?.totalAmount
          )
        ),

      completedCount:
        Number(
          summary?.completedCount ??
            0
        ),

      completedAmount:
        roundMoney(
          decimalToNumber(
            summary?.completedAmount
          )
        ),

      pendingCount:
        Number(
          summary?.pendingCount ??
            0
        ),

      failedCount:
        Number(
          summary?.failedCount ??
            0
        ),
    },

    transactions,
  };
}

/* =========================================================
   GET SINGLE MERCHANT TRANSACTION
========================================================= */

export async function getMerchantTransaction(
  ownerId: string,
  transactionId: string
) {
  const merchant =
    await getMerchantByOwner(
      ownerId
    );

  const normalizedId =
    normalizeText(
      transactionId,
      150
    );

  if (!normalizedId) {
    throw new Error(
      "Transaction ID is required."
    );
  }

  /*
   * We use Payment.paymentId as the stable merchant transaction
   * identifier in this read-only gateway transaction view.
   */

  const payment =
    await Payment.findOne({
      merchantId:
        merchant._id,

      paymentId:
        normalizedId,
    })
      .select(
        [
          "paymentId",
          "orderId",
          "customerId",
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
          "idempotencyKey",
          "createdAt",
          "authorizedAt",
          "capturedAt",
          "completedAt",
          "failedAt",
          "cancelledAt",
          "expiredAt",
          "checkoutUrl",
        ].join(" ")
      )
      .lean();

  if (!payment) {
    throw new Error(
      "Merchant transaction not found."
    );
  }

  return {
    merchant: {
      id:
        merchant._id.toString(),

      businessName:
        merchant.businessName,

      businessDisplayName:
        merchant.businessDisplayName ??
        null,

      defaultCurrency:
        merchant.defaultCurrency,
    },

    transaction: {
      transactionId:
        payment.paymentId,

      type:
        "PAYMENT" as const,

      paymentId:
        payment.paymentId,

      orderId:
        payment.orderId
          ? String(
              payment.orderId
            )
          : null,

      customerId:
        payment.customerId
          ? String(
              payment.customerId
            )
          : null,

      amount:
        roundMoney(
          decimalToNumber(
            payment.amount
          )
        ),

      feeAmount:
        roundMoney(
          decimalToNumber(
            payment.feeAmount
          )
        ),

      netAmount:
        payment.netAmount !==
        undefined
          ? roundMoney(
              decimalToNumber(
                payment.netAmount
              )
            )
          : null,

      currency:
        payment.currency,

      provider:
        payment.provider,

      sourceType:
        payment.sourceType,

      mode:
        payment.mode,

      status:
        String(
          payment.status
        ).toUpperCase(),

      merchantReference:
        payment.merchantReference ??
        null,

      providerReference:
        payment.providerPaymentId ??
        null,

      failureCode:
        payment.failureCode ??
        null,

      failureMessage:
        payment.failureMessage ??
        null,

      idempotencyKey:
        payment.idempotencyKey ??
        null,

      checkoutUrl:
        payment.checkoutUrl ??
        null,

      timeline: {
        createdAt:
          payment.createdAt,

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
      },
    },
  };
}