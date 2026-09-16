import crypto from "node:crypto";

import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  Refund,
} from "../models/Refund.js";

import {
  Settlement,
  type SettlementStatus,
} from "../models/Settlement.js";

import {
  SettlementItem,
} from "../models/SettlementItem.js";

/* =========================================================
   TYPES
========================================================= */

export interface CreateMerchantSettlementInput {
  ownerId: string;
  periodStart: unknown;
  periodEnd: unknown;
  currency?: unknown;
  note?: unknown;
}

export interface ListMerchantSettlementsInput {
  ownerId: string;
  page?: unknown;
  limit?: unknown;
  search?: unknown;
  status?: unknown;
  currency?: unknown;
  from?: unknown;
  to?: unknown;
}

export interface CreateMerchantSettlementResult {
  duplicate: boolean;

  settlement:
    ReturnType<
      typeof formatSettlement
    >;

  allocatedPaymentCount: number;

  allocatedRefundCount: number;
}

/* =========================================================
   CONSTANTS
========================================================= */

const SETTLEMENT_STATUSES:
  readonly SettlementStatus[] = [
    "pending",
    "processing",
    "settled",
    "failed",
    "cancelled",
  ];

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown,
  maxLength = 500
): string | undefined {
  if (
    typeof value !== "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

function normalizeCurrency(
  value: unknown,
  fallback: string
): string {
  const currency =
    normalizeText(
      value,
      3
    )?.toUpperCase() ||
    fallback.toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency
    )
  ) {
    throw new Error(
      "currency must be a valid three-letter code."
    );
  }

  return currency;
}

function parseRequiredDate(
  value: unknown,
  fieldName: string
): Date {
  const normalized =
    normalizeText(
      value,
      40
    );

  if (!normalized) {
    throw new Error(
      `${fieldName} is required.`
    );
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
    throw new Error(
      `${fieldName} must be a valid date.`
    );
  }

  return date;
}

function parseOptionalDate(
  value: unknown,
  endOfDay = false
): Date | null {
  const normalized =
    normalizeText(
      value,
      40
    );

  if (!normalized) {
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

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value
  ) {
    const parsed =
      Number(
        String(value)
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
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
      (
        value +
        Number.EPSILON
      ) *
        multiplier
    ) /
    multiplier
  );
}

function toDecimal(
  value: number
): mongoose.Types.Decimal128 {
  return mongoose.Types.Decimal128.fromString(
    value.toFixed(2)
  );
}

function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function generateSettlementId(): string {
  return `settlement_${Date.now().toString(
    36
  )}_${crypto
    .randomBytes(12)
    .toString("hex")}`;
}

/* =========================================================
   MERCHANT LOOKUP
========================================================= */

async function findMerchantForOwner(
  ownerId: string
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
          "ownerId",
          "businessName",
          "businessDisplayName",
          "defaultCurrency",
          "status",
          "verificationStatus",
          "testEnabled",
          "liveEnabled",
        ].join(" ")
      )
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found."
    );
  }

  return merchant;
}

/* =========================================================
   FORMAT SETTLEMENT
========================================================= */

function formatSettlement(
  settlement: Record<
    string,
    unknown
  >
) {
  return {
    id:
      String(
        settlement._id
      ),

    settlementId:
      settlement.settlementId,

    merchantId:
      settlement.merchantId
        ? String(
            settlement.merchantId
          )
        : null,

    periodStart:
      settlement.periodStart,

    periodEnd:
      settlement.periodEnd,

    currency:
      settlement.currency,

    paymentCount:
      Number(
        settlement.paymentCount ??
          0
      ),

    grossAmount:
      roundNumber(
        decimalToNumber(
          settlement.grossAmount
        )
      ),

    feeAmount:
      roundNumber(
        decimalToNumber(
          settlement.feeAmount
        )
      ),

    refundAmount:
      roundNumber(
        decimalToNumber(
          settlement.refundAmount
        )
      ),

    adjustmentAmount:
      roundNumber(
        decimalToNumber(
          settlement.adjustmentAmount
        )
      ),

    netAmount:
      roundNumber(
        decimalToNumber(
          settlement.netAmount
        )
      ),

    status:
      settlement.status,

    payoutId:
      settlement.payoutId ??
      null,

    note:
      settlement.note ??
      null,

    failureReason:
      settlement.failureReason ??
      null,

    settledAt:
      settlement.settledAt ??
      null,

    createdAt:
      settlement.createdAt,

    updatedAt:
      settlement.updatedAt,
  };
}

/* =========================================================
   DUPLICATE RESULT HELPER
========================================================= */

async function buildDuplicateSettlementResult(
  settlement: any,
  session: mongoose.ClientSession
): Promise<CreateMerchantSettlementResult> {
  const [
    allocatedPaymentCount,
    allocatedRefundCount,
  ] = await Promise.all([
    SettlementItem.countDocuments({
      settlementId:
        settlement._id,

      status:
        "allocated",
    }).session(
      session
    ),

    Refund.countDocuments({
      merchantId:
        settlement.merchantId,

      currency:
        settlement.currency,

      settlementId:
        settlement._id,

      status:
        "completed",
    }).session(
      session
    ),
  ]);

  return {
    duplicate: true,

    settlement:
      formatSettlement(
        settlement as unknown as Record<
          string,
          unknown
        >
      ),

    allocatedPaymentCount,

    allocatedRefundCount,
  };
}

/* =========================================================
   CREATE SETTLEMENT
========================================================= */

export async function createMerchantSettlement(
  input: CreateMerchantSettlementInput
): Promise<CreateMerchantSettlementResult> {
  const session =
    await mongoose.startSession();

  try {
    let finalResult:
      CreateMerchantSettlementResult | null =
      null;

    await session.withTransaction(
      async () => {
        /* =================================================
           MERCHANT
        ================================================= */

        const merchant =
          await findMerchantForOwner(
            input.ownerId
          );

        if (
          merchant.status !==
          "active"
        ) {
          throw new Error(
            "Merchant account is not active."
          );
        }

        /* =================================================
           PERIOD
        ================================================= */

        const periodStart =
          parseRequiredDate(
            input.periodStart,
            "periodStart"
          );

        const periodEnd =
          parseRequiredDate(
            input.periodEnd,
            "periodEnd"
          );

        if (
          periodStart >=
          periodEnd
        ) {
          throw new Error(
            "periodStart must be earlier than periodEnd."
          );
        }

        /* =================================================
           CURRENCY
        ================================================= */

        const currency =
          normalizeCurrency(
            input.currency,
            merchant.defaultCurrency
          );

        /* =================================================
           EXACT DUPLICATE SETTLEMENT
        ================================================= */

        const existing =
          await Settlement.findOne({
            merchantId:
              merchant._id,

            periodStart,

            periodEnd,

            currency,
          })
            .session(session)
            .lean();

        if (existing) {
          finalResult =
            await buildDuplicateSettlementResult(
              existing,
              session
            );

          return;
        }

        /* =================================================
           ALREADY-SETTLED PAYMENTS
        ================================================= */

        const alreadyAllocatedPaymentIds =
          await SettlementItem.distinct(
            "paymentId",
            {
              merchantId:
                merchant._id,

              status:
                "allocated",
            }
          ).session(
            session
          );

        /* =================================================
           COMPLETED PAYMENTS
        ================================================= */

        const paymentQuery:
          Record<string, unknown> = {
          merchantId:
            merchant._id,

          status:
            "completed",

          currency,

          completedAt: {
            $gte:
              periodStart,

            $lte:
              periodEnd,
          },
        };

        if (
          alreadyAllocatedPaymentIds.length
        ) {
          paymentQuery.paymentId = {
            $nin:
              alreadyAllocatedPaymentIds,
          };
        }

        /* =================================================
           LOAD PAYMENTS
        ================================================= */

        const candidatePayments =
          await Payment.find(
            paymentQuery
          )
            .sort({
              completedAt:
                1,
            })
            .session(session)
            .lean();

        /* =================================================
           CALCULATE PAYMENT TOTALS
        ================================================= */

        let paymentCount =
          0;

        let grossAmount =
          0;

        let feeAmount =
          0;

        let netAmount =
          0;

        for (
          const payment of
            candidatePayments
        ) {
          const amount =
            decimalToNumber(
              payment.amount
            );

          const fee =
            decimalToNumber(
              payment.feeAmount
            );

          const paymentNet =
            payment.netAmount !==
              undefined &&
            payment.netAmount !==
              null
              ? decimalToNumber(
                  payment.netAmount
                )
              : amount - fee;

          paymentCount +=
            1;

          grossAmount +=
            amount;

          feeAmount +=
            fee;

          netAmount +=
            paymentNet;
        }

        grossAmount =
          roundNumber(
            grossAmount
          );

        feeAmount =
          roundNumber(
            feeAmount
          );

        netAmount =
          roundNumber(
            netAmount
          );

        /* =================================================
           REFUND RECONCILIATION
        ================================================= */

        const unallocatedRefunds =
          await Refund.find({
            merchantId:
              merchant._id,

            currency,

            status:
              "completed",

            settlementId: {
              $exists: false,
            },
          })
            .sort({
              createdAt:
                1,
            })
            .session(
              session
            );

        let refundAmount =
          0;

        for (
          const refund of
            unallocatedRefunds
        ) {
          refundAmount +=
            decimalToNumber(
              refund.amount
            );
        }

        refundAmount =
          roundNumber(
            refundAmount
          );

        /* =================================================
           ADJUSTMENT
        ================================================= */

        const adjustmentAmount =
          0;

        /* =================================================
           FINAL RECONCILED NET
        ================================================= */

        const calculatedNetAmount =
          roundNumber(
            grossAmount -
              feeAmount -
              refundAmount +
              adjustmentAmount
          );

        const paymentDerivedNet =
          roundNumber(
            netAmount -
              refundAmount +
              adjustmentAmount
          );

        const reconciledNetAmount =
          candidatePayments.length >
          0
            ? paymentDerivedNet
            : calculatedNetAmount;

        /* =================================================
           CREATE SETTLEMENT
        ================================================= */

        const settlementId =
          generateSettlementId();

        let settlement: any;

        try {
          const created =
            await Settlement.create(
              [
                {
                  settlementId,

                  merchantId:
                    merchant._id,

                  periodStart,

                  periodEnd,

                  currency,

                  paymentCount,

                  grossAmount:
                    toDecimal(
                      grossAmount
                    ),

                  feeAmount:
                    toDecimal(
                      feeAmount
                    ),

                  refundAmount:
                    toDecimal(
                      refundAmount
                    ),

                  adjustmentAmount:
                    toDecimal(
                      adjustmentAmount
                    ),

                  netAmount:
                    toDecimal(
                      reconciledNetAmount
                    ),

                  status:
                    "pending",

                  note:
                    normalizeText(
                      input.note,
                      1000
                    ),

                  createdAt:
                    new Date(),

                  updatedAt:
                    new Date(),
                },
              ],
              {
                session,
              }
            );

          settlement =
            created[0];
        } catch (
          error: unknown
        ) {
          /*
           * Duplicate key during concurrent settlement
           * creation cannot safely be queried again inside
           * the aborted MongoDB transaction.
           *
           * The normal exact-duplicate check above handles
           * regular duplicate requests. A concurrent conflict
           * is returned as a conflict error.
           */
          if (
            typeof error ===
              "object" &&
            error !== null &&
            "code" in error &&
            error.code ===
              11000
          ) {
            throw new Error(
              "A settlement for this period and currency already exists. Please retry."
            );
          }

          throw error;
        }

        if (!settlement) {
          throw new Error(
            "Unable to create settlement."
          );
        }

        /* =================================================
           ALLOCATE PAYMENTS
        ================================================= */

        if (
          candidatePayments.length
        ) {
          const now =
            new Date();

          const settlementItems =
            candidatePayments.map(
              (
                payment
              ) => {
                const fallbackNet =
                  decimalToNumber(
                    payment.amount
                  ) -
                  decimalToNumber(
                    payment.feeAmount
                  );

                return {
                  settlementId:
                    settlement._id,

                  settlementPublicId:
                    settlement.settlementId,

                  paymentId:
                    payment.paymentId,

                  merchantId:
                    merchant._id,

                  /*
                   * SettlementItem uses a snapshot
                   * of the financial payment values.
                   */
                  snapshot: {
                    amount:
                      payment.amount,

                    feeAmount:
                      payment.feeAmount ??
                      mongoose.Types.Decimal128.fromString(
                        "0.00"
                      ),

                    netAmount:
                      payment.netAmount ??
                      mongoose.Types.Decimal128.fromString(
                        fallbackNet.toFixed(
                          2
                        )
                      ),

                    currency:
                      payment.currency,

                    completedAt:
                      payment.completedAt ??
                      payment.createdAt,
                  },

                  status:
                    "allocated",

                  allocatedAt:
                    now,
                };
              }
            );

          try {
            await SettlementItem.insertMany(
              settlementItems,
              {
                session,

                ordered:
                  true,
              }
            );
          } catch (
            error: unknown
          ) {
            if (
              typeof error ===
                "object" &&
              error !== null &&
              "code" in error &&
              error.code ===
                11000
            ) {
              throw new Error(
                "One or more payments were already allocated to another settlement. Please retry the settlement."
              );
            }

            throw error;
          }
        }

        /* =================================================
           ALLOCATE REFUNDS
        ================================================= */

        /*
         * This intentionally stays outside the payment
         * allocation block so a settlement may reconcile
         * refunds even when there are zero new payments.
         */

        if (
          unallocatedRefunds.length
        ) {
          const refundIds =
            unallocatedRefunds.map(
              (
                refund
              ) =>
                refund._id
            );

          const refundAllocationResult =
            await Refund.updateMany(
              {
                _id: {
                  $in:
                    refundIds,
                },

                merchantId:
                  merchant._id,

                currency,

                status:
                  "completed",

                settlementId: {
                  $exists: false,
                },
              },

              {
                $set: {
                  settlementId:
                    settlement._id,

                  settledAt:
                    new Date(),
                },
              },

              {
                session,
              }
            );

          if (
            refundAllocationResult.modifiedCount !==
            unallocatedRefunds.length
          ) {
            throw new Error(
              "One or more refunds were already allocated to another settlement. Please retry the settlement."
            );
          }
        }

        /* =================================================
           FINAL RESULT
        ================================================= */

        finalResult = {
          duplicate: false,

          settlement:
            formatSettlement(
              settlement.toObject() as unknown as Record<
                string,
                unknown
              >
            ),

          allocatedPaymentCount:
            candidatePayments.length,

          allocatedRefundCount:
            unallocatedRefunds.length,
        };
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

    if (!finalResult) {
      throw new Error(
        "Settlement creation produced no result."
      );
    }

    return finalResult;
  } finally {
    await session.endSession();
  }
}

/* =========================================================
   LIST SETTLEMENTS
========================================================= */

export async function listMerchantSettlements(
  input: ListMerchantSettlementsInput
) {
  const merchant =
    await findMerchantForOwner(
      input.ownerId
    );

  const pageValue =
    Number(
      input.page
    );

  const page =
    Number.isInteger(
      pageValue
    ) &&
    pageValue > 0
      ? pageValue
      : 1;

  const limitValue =
    Number(
      input.limit
    );

  const limit =
    Number.isInteger(
      limitValue
    ) &&
    limitValue >= 5
      ? Math.min(
          limitValue,
          100
        )
      : 20;

  const search =
    normalizeText(
      input.search,
      150
    ) || "";

  const status =
    SETTLEMENT_STATUSES.includes(
      input.status as SettlementStatus
    )
      ? (
          input.status as SettlementStatus
        )
      : undefined;

  const currency =
    normalizeText(
      input.currency,
      3
    )?.toUpperCase();

  const fromDate =
    parseOptionalDate(
      input.from
    );

  const toDate =
    parseOptionalDate(
      input.to,
      true
    );

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

  if (currency) {
    filter.currency =
      currency;
  }

  if (
    fromDate ||
    toDate
  ) {
    const periodStart:
      Record<
        string,
        Date
      > = {};

    if (fromDate) {
      periodStart.$gte =
        fromDate;
    }

    if (toDate) {
      periodStart.$lte =
        toDate;
    }

    filter.periodStart =
      periodStart;
  }

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
        settlementId:
          regex,
      },

      {
        payoutId:
          regex,
      },

      {
        note:
          regex,
      },
    ];
  }

  /* =======================================================
     COUNT
  ======================================================== */

  const total =
    await Settlement.countDocuments(
      filter
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
          limit
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  /* =======================================================
     SETTLEMENTS
  ======================================================== */

  const settlements =
    await Settlement.find(
      filter
    )
      .sort({
        periodStart:
          -1,

        createdAt:
          -1,
      })
      .skip(
        (
          safePage -
          1
        ) *
          limit
      )
      .limit(
        limit
      )
      .lean();

  /* =======================================================
     SUMMARY
  ======================================================== */

  const summaryResult =
    await Settlement.aggregate<{
      total: number;
      pending: number;
      processing: number;
      settled: number;
      failed: number;
      cancelled: number;
      grossAmount: unknown;
      feeAmount: unknown;
      refundAmount: unknown;
      netAmount: unknown;
    }>([
      {
        $match: {
          merchantId:
            merchant._id,

          ...(currency
            ? {
                currency,
              }
            : {}),
        },
      },

      {
        $group: {
          _id: null,

          total: {
            $sum: 1,
          },

          pending: {
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

          processing: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "processing",
                  ],
                },

                1,

                0,
              ],
            },
          },

          settled: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "settled",
                  ],
                },

                1,

                0,
              ],
            },
          },

          failed: {
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

          cancelled: {
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

          grossAmount: {
            $sum:
              "$grossAmount",
          },

          feeAmount: {
            $sum:
              "$feeAmount",
          },

          refundAmount: {
            $sum:
              "$refundAmount",
          },

          netAmount: {
            $sum:
              "$netAmount",
          },
        },
      },
    ]);

  const summary =
    summaryResult[0];

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

    settlements:
      settlements.map(
        (
          settlement
        ) =>
          formatSettlement(
            settlement as unknown as Record<
              string,
              unknown
            >
          )
      ),

    summary: {
      total:
        summary?.total ??
        0,

      pending:
        summary?.pending ??
        0,

      processing:
        summary?.processing ??
        0,

      settled:
        summary?.settled ??
        0,

      failed:
        summary?.failed ??
        0,

      cancelled:
        summary?.cancelled ??
        0,

      grossAmount:
        roundNumber(
          decimalToNumber(
            summary?.grossAmount
          )
        ),

      feeAmount:
        roundNumber(
          decimalToNumber(
            summary?.feeAmount
          )
        ),

      refundAmount:
        roundNumber(
          decimalToNumber(
            summary?.refundAmount
          )
        ),

      netAmount:
        roundNumber(
          decimalToNumber(
            summary?.netAmount
          )
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

      status:
        status ??
        null,

      currency:
        currency ??
        null,

      from:
        normalizeText(
          input.from,
          40
        ) || null,

      to:
        normalizeText(
          input.to,
          40
        ) || null,
    },
  };
}

/* =========================================================
   GET SETTLEMENT DETAIL
========================================================= */

export async function getMerchantSettlement(
  ownerId: string,
  settlementIdValue: string
) {
  const merchant =
    await findMerchantForOwner(
      ownerId
    );

  const settlementId =
    normalizeText(
      settlementIdValue,
      120
    );

  if (!settlementId) {
    throw new Error(
      "Settlement ID is required."
    );
  }

  const settlement =
    await Settlement.findOne({
      settlementId,

      merchantId:
        merchant._id,
    }).lean();

  if (!settlement) {
    throw new Error(
      "Settlement not found."
    );
  }

  /* =======================================================
     LOAD EXACT SETTLEMENT PAYMENTS
  ======================================================== */

  const settlementItems =
    await SettlementItem.find({
      settlementId:
        settlement._id,

      status:
        "allocated",

      merchantId:
        merchant._id,
    })
      .sort({
        allocatedAt:
          -1,
      })
      .lean();

  const paymentIds =
    settlementItems.map(
      (
        item
      ) =>
        item.paymentId
    );

  const payments =
    paymentIds.length
      ? await Payment.find({
          merchantId:
            merchant._id,

          paymentId: {
            $in:
              paymentIds,
          },
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
              "provider",
              "sourceType",
              "mode",
              "merchantReference",
              "completedAt",
            ].join(" ")
          )
          .lean()
      : [];

  const paymentMap =
    new Map(
      payments.map(
        (
          payment
        ) => [
          payment.paymentId,
          payment,
        ]
      )
    );

  const settlementPayments =
    settlementItems
      .map(
        (
          item
        ) => {
          const payment =
            paymentMap.get(
              item.paymentId
            );

          if (!payment) {
            return null;
          }

          return {
            paymentId:
              payment.paymentId,

            orderId:
              payment.orderId
                ? payment.orderId.toString()
                : null,

            customerId:
              payment.customerId
                ? payment.customerId.toString()
                : null,

            amount:
              roundNumber(
                decimalToNumber(
                  payment.amount
                )
              ),

            currency:
              payment.currency,

            feeAmount:
              roundNumber(
                decimalToNumber(
                  payment.feeAmount
                )
              ),

            netAmount:
              payment.netAmount
                ? roundNumber(
                    decimalToNumber(
                      payment.netAmount
                    )
                  )
                : null,

            provider:
              payment.provider,

            sourceType:
              payment.sourceType,

            mode:
              payment.mode,

            merchantReference:
              payment.merchantReference ??
              null,

            completedAt:
              payment.completedAt ??
              null,
          };
        }
      )
      .filter(
        (
          payment
        ): payment is NonNullable<
          typeof payment
        > =>
          payment !== null
      );

  /* =======================================================
     LOAD SETTLEMENT REFUNDS
  ======================================================== */

  const settlementRefunds =
    await Refund.find({
      merchantId:
        merchant._id,

      settlementId:
        settlement._id,

      status:
        "completed",
    })
      .sort({
        settledAt:
          -1,

        createdAt:
          -1,
      })
      .lean();

  const formattedRefunds =
    settlementRefunds.map(
      (
        refund
      ) => ({
        refundId:
          refund.refundId,

        paymentId:
          refund.paymentReference,

        customerId:
          refund.customerId
            ? refund.customerId.toString()
            : null,

        amount:
          roundNumber(
            decimalToNumber(
              refund.amount
            )
          ),

        amountMinor:
          refund.amountMinor,

        currency:
          refund.currency,

        mode:
          refund.mode,

        status:
          refund.status,

        reason:
          refund.reason ??
          null,

        merchantReference:
          refund.merchantReference ??
          null,

        ledgerEntryGroupId:
          refund.ledgerEntryGroupId ??
          null,

        createdAt:
          refund.createdAt,

        completedAt:
          refund.completedAt ??
          null,

        settledAt:
          refund.settledAt ??
          null,
      })
    );

  /* =======================================================
     RECONCILIATION
  ======================================================== */

  const refundAmount =
    roundNumber(
      settlementRefunds.reduce(
        (
          total,
          refund
        ) =>
          total +
          decimalToNumber(
            refund.amount
          ),

        0
      )
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

    settlement:
      formatSettlement(
        settlement as unknown as Record<
          string,
          unknown
        >
      ),

    payments:
      payments.map(
        (
          payment
        ) => ({
          paymentId:
            payment.paymentId,

          orderId:
            payment.orderId
              ? payment.orderId.toString()
              : null,

          customerId:
            payment.customerId
              ? payment.customerId.toString()
              : null,

          amount:
            roundNumber(
              decimalToNumber(
                payment.amount
              )
            ),

          currency:
            payment.currency,

          feeAmount:
            roundNumber(
              decimalToNumber(
                payment.feeAmount
              )
            ),

          netAmount:
            payment.netAmount
              ? roundNumber(
                  decimalToNumber(
                    payment.netAmount
                  )
                )
              : null,

          provider:
            payment.provider,

          sourceType:
            payment.sourceType,

          mode:
            payment.mode,

          merchantReference:
            payment.merchantReference ??
            null,

          completedAt:
            payment.completedAt ??
            null,
        })
      ),

    settlementPayments,

    refunds:
      formattedRefunds,

    reconciliation: {
      paymentCount:
        settlementItems.length,

      refundCount:
        settlementRefunds.length,

      refundAmount,

      status:
        "reconciled" as const,
    },
  };
}