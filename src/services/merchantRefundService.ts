import crypto from "node:crypto";

import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
  type PaymentMode,
} from "../models/Payment.js";

import {
  Refund,
  type IRefund,
  type RefundStatus,
} from "../models/Refund.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  createLedgerAccount,
  postBalancedLedger,
} from "./ledgerService.js";

import {
  createRefundWebhookEvents,
} from "./refundWebhookService.js";

/* =========================================================
   ERROR
========================================================= */

export type MerchantRefundErrorCode =
  | "INVALID_REQUEST"
  | "MERCHANT_NOT_FOUND"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_NOT_REFUNDABLE"
  | "REFUND_AMOUNT_EXCEEDED"
  | "WALLET_NOT_FOUND"
  | "REFUND_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT";

export class MerchantRefundError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: MerchantRefundErrorCode
  ) {
    super(message);

    this.name =
      "MerchantRefundError";
  }
}

/* =========================================================
   TYPES
========================================================= */

export interface CreateMerchantRefundInput {
  merchantId: string;
  environment: PaymentMode;
  paymentId: string;
  amount?: unknown;
  reason?: unknown;
  merchantReference?: unknown;
  idempotencyKey: string;
}

export interface MerchantRefundView {
  _id: string;

  refundId: string;

  paymentId: string;

  merchantId: string;

  customerId: string;

  amount: string;

  amountMinor: number;

  currency: string;

  mode: PaymentMode;

  status: RefundStatus;

  reason?: string;

  merchantReference?: string;

  ledgerEntryGroupId?: string;

  failureCode?: string;

  failureMessage?: string;

  settlementId?: string;

  settledAt?: Date;

  completedAt?: Date;

  failedAt?: Date;

  cancelledAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

export interface CreateMerchantRefundResult {
  duplicate: boolean;

  refund: MerchantRefundView;
}

export interface MerchantRefundListResult {
  refunds: MerchantRefundView[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* =========================================================
   HELPERS
========================================================= */

const normalizeString = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const normalizeOptionalText = (
  value: unknown,
  fieldName: string,
  maximumLength: number
): string | undefined => {
  const normalized =
    normalizeString(
      value
    );

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.length >
    maximumLength
  ) {
    throw new MerchantRefundError(
      `${fieldName} is too long.`,
      400,
      "INVALID_REQUEST"
    );
  }

  return normalized;
};

const generateRefundId =
  (): string => {
    return `re_${crypto.randomUUID()}`;
  };

const toMinorUnits = (
  value: unknown,
  fieldName: string
): number => {
  let raw: string;

  if (
    value instanceof
    mongoose.Types.Decimal128
  ) {
    raw =
      value.toString();
  } else if (
    typeof value === "number"
  ) {
    if (
      !Number.isFinite(value)
    ) {
      throw new MerchantRefundError(
        `${fieldName} is invalid.`,
        400,
        "INVALID_REQUEST"
      );
    }

    raw =
      value.toString();
  } else {
    raw =
      normalizeString(
        value
      );
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(
      raw
    )
  ) {
    throw new MerchantRefundError(
      `${fieldName} must be a positive amount with maximum 2 decimal places.`,
      400,
      "INVALID_REQUEST"
    );
  }

  const [
    wholePart,
    decimalPart = "",
  ] =
    raw.split(".");

  const normalizedDecimal =
    decimalPart
      .padEnd(
        2,
        "0"
      )
      .slice(
        0,
        2
      );

  const minorUnits =
    Number(
      wholePart
    ) *
      100 +
    Number(
      normalizedDecimal
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits <= 0
  ) {
    throw new MerchantRefundError(
      `${fieldName} must be greater than zero.`,
      400,
      "INVALID_REQUEST"
    );
  }

  return minorUnits;
};

const minorUnitsToString = (
  value: number
): string => {
  if (
    !Number.isSafeInteger(
      value
    ) ||
    value < 0
  ) {
    throw new MerchantRefundError(
      "Invalid financial amount.",
      500,
      "INVALID_REQUEST"
    );
  }

  return (
    value / 100
  ).toFixed(2);
};

const escapeRegExp = (
  value: string
): string => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =========================================================
   VIEW MAPPER
========================================================= */

const toRefundView = (
  refund: {
    _id: unknown;

    refundId: string;

    paymentReference: string;

    merchantId:
      mongoose.Types.ObjectId;

    customerId:
      mongoose.Types.ObjectId;

    amount:
      mongoose.Types.Decimal128;

    amountMinor: number;

    currency: string;

    mode: PaymentMode;

    status: RefundStatus;

    reason?: string;

    merchantReference?: string;

    ledgerEntryGroupId?: string;

    failureCode?: string;

    failureMessage?: string;

    settlementId?:
      mongoose.Types.ObjectId;

    settledAt?: Date;

    completedAt?: Date;

    failedAt?: Date;

    cancelledAt?: Date;

    createdAt: Date;

    updatedAt: Date;
  }
): MerchantRefundView => {
  return {
    _id:
      String(
        refund._id
      ),

    refundId:
      refund.refundId,

    paymentId:
      refund.paymentReference,

    merchantId:
      refund.merchantId.toString(),

    customerId:
      refund.customerId.toString(),

    amount:
      refund.amount.toString(),

    amountMinor:
      refund.amountMinor,

    currency:
      refund.currency,

    mode:
      refund.mode,

    status:
      refund.status,

    reason:
      refund.reason,

    merchantReference:
      refund.merchantReference,

    ledgerEntryGroupId:
      refund.ledgerEntryGroupId,

    failureCode:
      refund.failureCode,

    failureMessage:
      refund.failureMessage,

    settlementId:
      refund.settlementId
        ? refund.settlementId.toString()
        : undefined,

    settledAt:
      refund.settledAt,

    completedAt:
      refund.completedAt,

    failedAt:
      refund.failedAt,

    cancelledAt:
      refund.cancelledAt,

    createdAt:
      refund.createdAt,

    updatedAt:
      refund.updatedAt,
  };
};

/* =========================================================
   IDEMPOTENCY VALIDATION
========================================================= */

const validateExistingRefund = (
  refund: IRefund,
  paymentReference: string,
  requestedAmountMinor?: number
): void => {
  if (
    refund.paymentReference !==
    paymentReference
  ) {
    throw new MerchantRefundError(
      "This idempotency key has already been used for another payment.",
      409,
      "IDEMPOTENCY_CONFLICT"
    );
  }

  if (
    requestedAmountMinor !==
      undefined &&
    refund.amountMinor !==
      requestedAmountMinor
  ) {
    throw new MerchantRefundError(
      "This idempotency key has already been used for another refund amount.",
      409,
      "IDEMPOTENCY_CONFLICT"
    );
  }
};

/* =========================================================
   CREATE REFUND
========================================================= */

export const createMerchantRefund =
  async (
    input: CreateMerchantRefundInput
  ): Promise<CreateMerchantRefundResult> => {
    const merchantId =
      normalizeString(
        input.merchantId
      );

    const paymentReference =
      normalizeString(
        input.paymentId
      );

    const idempotencyKey =
      normalizeString(
        input.idempotencyKey
      );

    /* =======================================================
       VALIDATION
    ======================================================== */

    if (
      !mongoose.isValidObjectId(
        merchantId
      )
    ) {
      throw new MerchantRefundError(
        "Invalid merchant ID.",
        400,
        "INVALID_REQUEST"
      );
    }

    if (!paymentReference) {
      throw new MerchantRefundError(
        "Payment ID is required.",
        400,
        "INVALID_REQUEST"
      );
    }

    if (
      !idempotencyKey ||
      idempotencyKey.length >
        200
    ) {
      throw new MerchantRefundError(
        "A valid Idempotency-Key header is required.",
        400,
        "INVALID_REQUEST"
      );
    }

    const requestedAmountMinor =
      input.amount === undefined
        ? undefined
        : toMinorUnits(
            input.amount,
            "Refund amount"
          );

    const reason =
      normalizeOptionalText(
        input.reason,
        "Refund reason",
        500
      );

    const merchantReference =
      normalizeOptionalText(
        input.merchantReference,
        "Merchant reference",
        150
      );

    const merchantObjectId =
      new mongoose.Types.ObjectId(
        merchantId
      );

    /* =======================================================
       FAST IDEMPOTENCY CHECK
    ======================================================== */

    const existingRefund =
      await Refund.findOne({
        merchantId:
          merchantObjectId,

        mode:
          input.environment,

        idempotencyKey,
      }).select(
        "+idempotencyKey"
      );

    if (existingRefund) {
      validateExistingRefund(
        existingRefund,
        paymentReference,
        requestedAmountMinor
      );

      return {
        duplicate: true,

        refund:
          toRefundView(
            existingRefund
          ),
      };
    }

    /* =======================================================
       SESSION
    ======================================================== */

    const session =
      await mongoose.startSession();

    let refundObjectId:
      string | null = null;

    let wasDuplicate =
      false;

    try {
      await session.withTransaction(
        async () => {
          /* ===============================================
             RESET
          ================================================ */

          refundObjectId =
            null;

          wasDuplicate =
            false;

          /* ===============================================
             IDEMPOTENCY RE-CHECK
          ================================================ */

          const transactionDuplicate =
            await Refund.findOne({
              merchantId:
                merchantObjectId,

              mode:
                input.environment,

              idempotencyKey,
            })
              .select(
                "+idempotencyKey"
              )
              .session(
                session
              );

          if (
            transactionDuplicate
          ) {
            validateExistingRefund(
              transactionDuplicate,
              paymentReference,
              requestedAmountMinor
            );

            wasDuplicate =
              true;

            refundObjectId =
              String(
                transactionDuplicate._id
              );

            return;
          }

          /* ===============================================
             PAYMENT
          ================================================ */

          const payment =
            await Payment.findOne({
              paymentId:
                paymentReference,

              merchantId:
                merchantObjectId,

              mode:
                input.environment,
            }).session(
              session
            );

          if (!payment) {
            throw new MerchantRefundError(
              "Payment not found.",
              404,
              "PAYMENT_NOT_FOUND"
            );
          }

          if (
            payment.status !==
            "completed"
          ) {
            throw new MerchantRefundError(
              `Payment cannot be refunded from status "${payment.status}".`,
              409,
              "PAYMENT_NOT_REFUNDABLE"
            );
          }

          /* ===============================================
             PROVIDER SUPPORT
          ================================================ */
if (
  payment.sourceType !==
    "wallet" ||
  payment.provider !==
    "coffer_wallet"
) {
  throw new MerchantRefundError(
    "This payment provider does not support the internal wallet refund flow.",
    409,
    "PAYMENT_NOT_REFUNDABLE"
  );
}

          if (
            !payment.customerId
          ) {
            throw new MerchantRefundError(
              "The payment does not contain a wallet customer.",
              409,
              "PAYMENT_NOT_REFUNDABLE"
            );
          }

          /* ===============================================
             PAYMENT LOCK
          ================================================ */

          const paymentLock =
            await Payment.updateOne(
              {
                _id:
                  payment._id,

                merchantId:
                  merchantObjectId,

                status:
                  "completed",
              },

              {
                $set: {
                  updatedAt:
                    new Date(),
                },
              },

              {
                session,
              }
            );

          if (
            paymentLock.matchedCount !==
            1
          ) {
            throw new MerchantRefundError(
              "Payment is no longer refundable.",
              409,
              "PAYMENT_NOT_REFUNDABLE"
            );
          }

          /* ===============================================
             REFUNDABLE AMOUNT
          ================================================ */

          const paymentAmountMinor =
            toMinorUnits(
              payment.amount,
              "Payment amount"
            );

          const refundTotals =
            await Refund.aggregate<{
              _id: null;
              totalMinor: number;
            }>([
              {
                $match: {
                  paymentId:
                    payment._id,

                  status:
                    "completed",
                },
              },

              {
                $group: {
                  _id: null,

                  totalMinor: {
                    $sum:
                      "$amountMinor",
                  },
                },
              },
            ]).session(
              session
            );

          const alreadyRefundedMinor =
            refundTotals[0]
              ?.totalMinor ??
            0;

          const remainingMinor =
            paymentAmountMinor -
            alreadyRefundedMinor;

          if (
            remainingMinor <=
            0
          ) {
            throw new MerchantRefundError(
              "This payment has already been fully refunded.",
              409,
              "REFUND_AMOUNT_EXCEEDED"
            );
          }

          const refundAmountMinor =
            requestedAmountMinor ??
            remainingMinor;

          if (
            refundAmountMinor >
            remainingMinor
          ) {
            throw new MerchantRefundError(
              `Refund amount exceeds the remaining refundable amount of ${minorUnitsToString(
                remainingMinor
              )} ${payment.currency}.`,
              409,
              "REFUND_AMOUNT_EXCEEDED"
            );
          }

          const refundAmount =
            minorUnitsToString(
              refundAmountMinor
            );

          /* ===============================================
             CUSTOMER WALLET
          ================================================ */

          const wallet =
            await Wallet.findOne({
              userId:
                payment.customerId,
            }).session(
              session
            );

          if (!wallet) {
            throw new MerchantRefundError(
              "Customer wallet was not found.",
              404,
              "WALLET_NOT_FOUND"
            );
          }

          if (
            wallet.currency
              .toUpperCase() !==
            payment.currency
              .toUpperCase()
          ) {
            throw new MerchantRefundError(
              "Customer wallet currency does not match the payment currency.",
              409,
              "WALLET_NOT_FOUND"
            );
          }

          /* ===============================================
             LEDGER ACCOUNTS
          ================================================ */

          const merchantLedgerAccount =
            await createLedgerAccount({
              accountCode:
                `merchant:payable:${merchantId}`,

              name:
                `Merchant Payable - ${merchantId}`,

              accountType:
                "liability",

              ownerType:
                "merchant",

              ownerId:
                merchantId,

              currency:
                payment.currency,

              description:
                "Merchant payable liability account.",
            });

          const customerLedgerAccount =
            await createLedgerAccount({
              accountCode:
                `wallet:user:${payment.customerId.toString()}`,

              name:
                `Customer Wallet - ${payment.customerId.toString()}`,

              accountType:
                "liability",

              ownerType:
                "user",

              ownerId:
                payment.customerId.toString(),

              currency:
                payment.currency,

              description:
                "Customer wallet liability account.",
            });

          /* ===============================================
             CREATE REFUND
          ================================================ */

          const refundId =
            generateRefundId();

          const createdRefunds =
            await Refund.create(
              [
                {
                  refundId,

                  merchantId:
                    merchantObjectId,

                  paymentId:
                    payment._id,

                  paymentReference:
                    payment.paymentId,

                  customerId:
                    payment.customerId,

                  amount:
                    mongoose.Types.Decimal128.fromString(
                      refundAmount
                    ),

                  amountMinor:
                    refundAmountMinor,

                  currency:
                    payment.currency,

                  mode:
                    payment.mode,

                  status:
                    "pending",

                  reason,

                  merchantReference,

                  idempotencyKey,
                },
              ],
              {
                session,
              }
            );

          const refund =
            createdRefunds[0];

          if (!refund) {
            throw new MerchantRefundError(
              "Unable to create refund.",
              500,
              "INVALID_REQUEST"
            );
          }

          /* ===============================================
             WALLET CREDIT
          ================================================ */

          const updatedWallet =
            await Wallet.findOneAndUpdate(
              {
                _id:
                  wallet._id,

                userId:
                  payment.customerId,

                currency:
                  payment.currency,
              },

              {
                $inc: {
                  balance:
                    refundAmountMinor /
                    100,
                },
              },

              {
                new: true,

                session,

                runValidators:
                  true,
              }
            );

          if (!updatedWallet) {
            throw new MerchantRefundError(
              "Unable to credit the customer wallet.",
              409,
              "WALLET_NOT_FOUND"
            );
          }

          /* ===============================================
             REFUND LEDGER
          ================================================ */

          const ledgerResult =
            await postBalancedLedger({
              referenceType:
                "refund",

              referenceId:
                refundId,

              idempotencyKey:
                `refund:${refundId}`,

              description:
                `Refund for payment ${payment.paymentId}`,

              lines: [
                {
                  accountId:
                    merchantLedgerAccount._id.toString(),

                  direction:
                    "debit",

                  amount:
                    refundAmount,

                  currency:
                    payment.currency,

                  description:
                    `Merchant payable debit for refund ${refundId}`,

                  metadata: {
                    paymentId:
                      payment.paymentId,

                    refundId,
                  },
                },

                {
                  accountId:
                    customerLedgerAccount._id.toString(),

                  direction:
                    "credit",

                  amount:
                    refundAmount,

                  currency:
                    payment.currency,

                  description:
                    `Customer wallet credit for refund ${refundId}`,

                  metadata: {
                    paymentId:
                      payment.paymentId,

                    refundId,
                  },
                },
              ],

              session,
            });

          /* ===============================================
             COMPLETE REFUND
          ================================================ */

          const completedRefund =
            await Refund.findByIdAndUpdate(
              refund._id,

              {
                $set: {
                  status:
                    "completed",

                  ledgerEntryGroupId:
                    ledgerResult.entryGroupId,

                  completedAt:
                    new Date(),
                },

                $unset: {
                  failureCode: 1,

                  failureMessage: 1,

                  failedAt: 1,
                },
              },

              {
                new: true,

                session,

                runValidators:
                  true,
              }
            );

          if (!completedRefund) {
            throw new MerchantRefundError(
              "Unable to complete refund.",
              500,
              "INVALID_REQUEST"
            );
          }

          refundObjectId =
            String(
              completedRefund._id
            );
        },

        {
          readConcern: {
            level:
              "snapshot",
          },

          writeConcern: {
            w:
              "majority",
          },
        }
      );
    } finally {
      await session.endSession();
    }

    /* =======================================================
       FINAL REFUND
    ======================================================== */

    if (!refundObjectId) {
      throw new MerchantRefundError(
        "Unable to complete refund.",
        500,
        "INVALID_REQUEST"
      );
    }

    const finalRefund =
      await Refund.findById(
        refundObjectId
      ).lean();

    if (!finalRefund) {
      throw new MerchantRefundError(
        "Refund record was not found after processing.",
        500,
        "REFUND_NOT_FOUND"
      );
    }

    const refundView =
      toRefundView(
        finalRefund
      );

    /* =======================================================
       WEBHOOK
    ======================================================== */

    if (!wasDuplicate) {
      try {
        await createRefundWebhookEvents({
          refund: {
            refundId:
              refundView.refundId,

            paymentId:
              refundView.paymentId,

            merchantId:
              refundView.merchantId,

            customerId:
              refundView.customerId,

            mode:
              refundView.mode,

            amount:
              refundView.amount,

            currency:
              refundView.currency,

            status:
              refundView.status,

            reason:
              refundView.reason,

            merchantReference:
              refundView.merchantReference,

            ledgerEntryGroupId:
              refundView.ledgerEntryGroupId,

            createdAt:
              refundView.createdAt,

            completedAt:
              refundView.completedAt,

            failedAt:
              refundView.failedAt,
          },

          eventType:
            "refund.completed" as never,
        });
      } catch (
        webhookError: unknown
      ) {
        console.error(
          "REFUND WEBHOOK CREATION ERROR:",
          webhookError instanceof
            Error
            ? webhookError.message
            : webhookError
        );
      }
    }

    /* =======================================================
       RESULT
    ======================================================== */

    return {
      duplicate:
        wasDuplicate,

      refund:
        refundView,
    };
  };

/* =========================================================
   GET API REFUND
========================================================= */

export const getMerchantApiRefund =
  async ({
    merchantId,
    environment,
    refundId,
  }: {
    merchantId: string;
    environment: PaymentMode;
    refundId: string;
  }): Promise<MerchantRefundView> => {
    if (
      !mongoose.isValidObjectId(
        merchantId
      )
    ) {
      throw new MerchantRefundError(
        "Invalid merchant ID.",
        400,
        "INVALID_REQUEST"
      );
    }

    const normalizedRefundId =
      normalizeString(
        refundId
      );

    if (
      !normalizedRefundId
    ) {
      throw new MerchantRefundError(
        "Refund ID is required.",
        400,
        "INVALID_REQUEST"
      );
    }

    const refund =
      await Refund.findOne({
        merchantId:
          new mongoose.Types.ObjectId(
            merchantId
          ),

        mode:
          environment,

        refundId:
          normalizedRefundId,
      }).lean();

    if (!refund) {
      throw new MerchantRefundError(
        "Refund not found.",
        404,
        "REFUND_NOT_FOUND"
      );
    }

    return toRefundView(
      refund
    );
  };

/* =========================================================
   MERCHANT BY OWNER
========================================================= */

const getMerchantByOwner =
  async (
    ownerId: string
  ) => {
    if (
      !mongoose.isValidObjectId(
        ownerId
      )
    ) {
      throw new MerchantRefundError(
        "Invalid merchant owner ID.",
        400,
        "INVALID_REQUEST"
      );
    }

    const merchant =
      await Merchant.findOne({
        ownerId:
          new mongoose.Types.ObjectId(
            ownerId
          ),
      })
        .select(
          "_id"
        )
        .lean();

    if (!merchant) {
      throw new MerchantRefundError(
        "Merchant account not found.",
        404,
        "MERCHANT_NOT_FOUND"
      );
    }

    return merchant;
  };

/* =========================================================
   DASHBOARD REFUND LIST
========================================================= */

export const listMerchantDashboardRefunds =
  async ({
    ownerId,
    status,
    mode,
    search,
    page = 1,
    limit = 20,
  }: {
    ownerId: string;
    status?: string;
    mode?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<MerchantRefundListResult> => {
    const merchant =
      await getMerchantByOwner(
        ownerId
      );

    const allowedStatuses:
      RefundStatus[] = [
        "pending",
        "completed",
        "failed",
        "cancelled",
      ];

    const allowedModes:
      PaymentMode[] = [
        "test",
        "live",
      ];

    const normalizedStatus =
      normalizeString(
        status
      );

    const normalizedMode =
      normalizeString(
        mode
      );

    if (
      normalizedStatus &&
      !allowedStatuses.includes(
        normalizedStatus as RefundStatus
      )
    ) {
      throw new MerchantRefundError(
        "Invalid refund status filter.",
        400,
        "INVALID_REQUEST"
      );
    }

    if (
      normalizedMode &&
      !allowedModes.includes(
        normalizedMode as PaymentMode
      )
    ) {
      throw new MerchantRefundError(
        "Invalid refund mode filter.",
        400,
        "INVALID_REQUEST"
      );
    }

    const safePage =
      Number.isInteger(
        page
      ) &&
      page > 0
        ? page
        : 1;

    const safeLimit =
      Number.isInteger(
        limit
      )
        ? Math.min(
            Math.max(
              limit,
              1
            ),
            100
          )
        : 20;

    const filter:
      Record<
        string,
        unknown
      > = {
      merchantId:
        merchant._id,
    };

    if (
      normalizedStatus
    ) {
      filter.status =
        normalizedStatus;
    }

    if (
      normalizedMode
    ) {
      filter.mode =
        normalizedMode;
    }

    const normalizedSearch =
      normalizeString(
        search
      ).slice(
        0,
        100
      );

    if (
      normalizedSearch
    ) {
      const searchExpression =
        new RegExp(
          escapeRegExp(
            normalizedSearch
          ),
          "i"
        );

      filter.$or = [
        {
          refundId:
            searchExpression,
        },

        {
          paymentReference:
            searchExpression,
        },

        {
          merchantReference:
            searchExpression,
        },
      ];
    }

    const [
      refunds,
      total,
    ] =
      await Promise.all([
        Refund.find(
          filter
        )
          .sort({
            createdAt:
              -1,
          })
          .skip(
            (
              safePage -
              1
            ) *
              safeLimit
          )
          .limit(
            safeLimit
          )
          .lean(),

        Refund.countDocuments(
          filter
        ),
      ]);

    return {
      refunds:
        refunds.map(
          toRefundView
        ),

      pagination: {
        page:
          safePage,

        limit:
          safeLimit,

        total,

        totalPages:
          Math.ceil(
            total /
              safeLimit
          ),
      },
    };
  };

/* =========================================================
   DASHBOARD REFUND DETAIL
========================================================= */

export const getMerchantDashboardRefund =
  async ({
    ownerId,
    refundId,
  }: {
    ownerId: string;
    refundId: string;
  }): Promise<MerchantRefundView> => {
    const merchant =
      await getMerchantByOwner(
        ownerId
      );

    const normalizedRefundId =
      normalizeString(
        refundId
      );

    if (
      !normalizedRefundId
    ) {
      throw new MerchantRefundError(
        "Refund ID is required.",
        400,
        "INVALID_REQUEST"
      );
    }

    const refund =
      await Refund.findOne({
        merchantId:
          merchant._id,

        refundId:
          normalizedRefundId,
      }).lean();

    if (!refund) {
      throw new MerchantRefundError(
        "Refund not found.",
        404,
        "REFUND_NOT_FOUND"
      );
    }

    return toRefundView(
      refund
    );
  };