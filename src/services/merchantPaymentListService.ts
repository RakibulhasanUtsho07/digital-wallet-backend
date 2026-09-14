import mongoose from "mongoose";

import { Merchant } from "../models/Merchant.js";
import { Payment } from "../models/Payment.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantPaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type MerchantPaymentMode =
  | "test"
  | "live";

export interface MerchantPaymentListInput {
  userId: string;

  page?: number;
  limit?: number;

  search?: string;

  status?: MerchantPaymentStatus;
  mode?: MerchantPaymentMode;

  provider?: string;
  sourceType?: string;

  from?: string;
  to?: string;
}

interface MerchantPaymentListResult {
  payments: unknown[];

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
    status: string | null;
    mode: string | null;
    provider: string | null;
    sourceType: string | null;
    from: string | null;
    to: string | null;
  };
}

/* =========================================================
   HELPERS
========================================================= */

function normalizePage(
  value: unknown
): number {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < 1
  ) {
    return 1;
  }

  return Math.floor(parsed);
}

function normalizeLimit(
  value: unknown
): number {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return 20;
  }

  return Math.min(
    100,
    Math.max(
      5,
      Math.floor(parsed)
    )
  );
}

function normalizeText(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function isValidObjectId(
  value: string
) {
  return mongoose.isValidObjectId(
    value
  );
}

function parseDate(
  value: string,
  endOfDay = false
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
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

function toNumber(
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

function roundNumber(
  value: number,
  digits = 2
): number {
  const multiplier =
    10 ** digits;

  return (
    Math.round(
      (value + Number.EPSILON) *
        multiplier
    ) / multiplier
  );
}

/* =========================================================
   MERCHANT LOOKUP
========================================================= */

async function findMerchant(
  userId: string
) {
  if (
    !isValidObjectId(
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
        "_id businessName businessDisplayName slug status verificationStatus defaultCurrency"
      )
      .sort({
        createdAt: -1,
      })
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found."
    );
  }

  return merchant;
}

/* =========================================================
   BUILD QUERY
========================================================= */

function buildPaymentFilter({
  merchantId,
  search,
  status,
  mode,
  provider,
  sourceType,
  from,
  to,
}: {
  merchantId: mongoose.Types.ObjectId;
  search: string;
  status?: MerchantPaymentStatus;
  mode?: MerchantPaymentMode;
  provider: string;
  sourceType: string;
  from: string;
  to: string;
}) {
  const filter: Record<
    string,
    unknown
  > = {
    merchantId,
  };

  /* -------------------------------------------------------
     STATUS
  ------------------------------------------------------- */

  if (status) {
    filter.status =
      status;
  }

  /* -------------------------------------------------------
     MODE
  ------------------------------------------------------- */

  if (mode) {
    filter.mode =
      mode;
  }

  /* -------------------------------------------------------
     PROVIDER
  ------------------------------------------------------- */

  if (provider) {
    filter.provider =
      provider;
  }

  /* -------------------------------------------------------
     SOURCE TYPE
  ------------------------------------------------------- */

  if (sourceType) {
    filter.sourceType =
      sourceType;
  }

  /* -------------------------------------------------------
     DATE RANGE
  ------------------------------------------------------- */

  const fromDate =
    parseDate(from);

  const toDate =
    parseDate(
      to,
      true
    );

  if (
    fromDate ||
    toDate
  ) {
    const createdAt: Record<
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

  /* -------------------------------------------------------
     SEARCH
  ------------------------------------------------------- */

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(
          search
        ),
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
    ];
  }

  return filter;
}

/* =========================================================
   ESCAPE REGEX
========================================================= */

function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/* =========================================================
   MAIN LIST SERVICE
========================================================= */

export async function listMerchantPayments(
  input: MerchantPaymentListInput
): Promise<MerchantPaymentListResult> {
  const merchant =
    await findMerchant(
      input.userId
    );

  const page =
    normalizePage(
      input.page
    );

  const limit =
    normalizeLimit(
      input.limit
    );

  const search =
    normalizeText(
      input.search
    );

  const provider =
    normalizeText(
      input.provider
    );

  const sourceType =
    normalizeText(
      input.sourceType
    );

  const from =
    normalizeText(
      input.from
    );

  const to =
    normalizeText(
      input.to
    );

  const filter =
    buildPaymentFilter({
      merchantId:
        merchant._id as mongoose.Types.ObjectId,

      search,

      status:
        input.status,

      mode:
        input.mode,

      provider,

      sourceType,

      from,

      to,
    });

  /* =======================================================
     COUNT
  ======================================================= */

  const total =
    await Payment.countDocuments(
      filter
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total / limit
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  const skip =
    (safePage - 1) *
    limit;

  /* =======================================================
     PAYMENTS
  ======================================================= */

  const payments =
    await Payment.find(
      filter
    )
      .sort({
        createdAt:
          -1,
      })
      .skip(skip)
      .limit(limit)
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
          "returnUrl",
          "cancelUrl",
          "checkoutUrl",
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

  /* =======================================================
     FORMAT
  ======================================================= */

  const formattedPayments =
    payments.map(
      (payment) => ({
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

        netAmount:
          payment.netAmount
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

        providerPaymentId:
          payment.providerPaymentId ??
          null,

        merchantReference:
          payment.merchantReference ??
          null,

        failureCode:
          payment.failureCode ??
          null,

        failureMessage:
          payment.failureMessage ??
          null,

        returnUrl:
          payment.returnUrl ??
          null,

        cancelUrl:
          payment.cancelUrl ??
          null,

        checkoutUrl:
          payment.checkoutUrl ??
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
      })
    );

  /* =======================================================
     RESULT
  ======================================================= */

  return {
    payments:
      formattedPayments,

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

      status:
        input.status ??
        null,

      mode:
        input.mode ??
        null,

      provider:
        provider ||
        null,

      sourceType:
        sourceType ||
        null,

      from:
        from ||
        null,

      to:
        to ||
        null,
    },
  };
}