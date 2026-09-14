import mongoose from "mongoose";

import { Merchant } from "../models/Merchant.js";
import { Payment } from "../models/Payment.js";
import { Payout } from "../models/Payout.js";
import { Settlement } from "../models/Settlement.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantReportType =
  | "payments"
  | "payouts"
  | "settlements"
  | "summary";

export interface MerchantReportInput {
  ownerId: string;

  reportType?: unknown;

  from?: unknown;

  to?: unknown;

  status?: unknown;

  provider?: unknown;

  sourceType?: unknown;

  payoutMethod?: unknown;

  currency?: unknown;

  mode?: unknown;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown,
  maxLength = 500
): string | undefined {
  if (typeof value !== "string") {
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

function parseDate(
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
    new Date(normalized);

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
      ) * multiplier
    ) / multiplier
  );
}

function normalizeReportType(
  value: unknown
): MerchantReportType {
  if (
    value === "payments" ||
    value === "payouts" ||
    value === "settlements" ||
    value === "summary"
  ) {
    return value;
  }

  return "summary";
}

/* =========================================================
   MERCHANT
========================================================= */

async function findMerchantForOwner(
  ownerId: string
) {
  const normalizedOwnerId =
    normalizeText(
      ownerId,
      100
    );

  if (!normalizedOwnerId) {
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
   PAYMENT REPORT
========================================================= */

async function buildPaymentReport(
  merchantId: mongoose.Types.ObjectId,
  input: MerchantReportInput
) {
  const filter:
    Record<
      string,
      unknown
    > = {
    merchantId,
  };

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

  const status =
    normalizeText(
      input.status,
      50
    );

  if (status) {
    filter.status =
      status;
  }

  const provider =
    normalizeText(
      input.provider,
      50
    );

  if (provider) {
    filter.provider =
      provider.toLowerCase();
  }

  const sourceType =
    normalizeText(
      input.sourceType,
      50
    );

  if (sourceType) {
    filter.sourceType =
      sourceType;
  }

  const currency =
    normalizeText(
      input.currency,
      3
    )?.toUpperCase();

  if (currency) {
    filter.currency =
      currency;
  }

  if (
    input.mode === "test" ||
    input.mode === "live"
  ) {
    filter.mode =
      input.mode;
  }

  const result =
    await Payment.aggregate([
      {
        $match:
          filter,
      },

      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,

                count: {
                  $sum: 1,
                },

                grossAmount: {
                  $sum:
                    "$amount",
                },

                feeAmount: {
                  $sum: {
                    $ifNull: [
                      "$feeAmount",
                      0,
                    ],
                  },
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
              },
            },
          ],

          rows: [
            {
              $sort: {
                createdAt:
                  -1,
              },
            },

            {
              $limit:
                5000,
            },

            {
              $project: {
                _id: 0,

                paymentId: 1,
                orderId: 1,
                customerId: 1,
                amount: 1,
                currency: 1,
                feeAmount: 1,
                netAmount: 1,
                sourceType: 1,
                provider: 1,
                mode: 1,
                status: 1,
                merchantReference: 1,
                providerPaymentId: 1,
                createdAt: 1,
                completedAt: 1,
                failedAt: 1,
              },
            },
          ],
        },
      },
    ]);

  const summary =
    result?.[0]?.summary?.[0];

  const rows =
    result?.[0]?.rows ?? [];

  return {
    summary: {
      count:
        Number(
          summary?.count ??
            0
        ),

      grossAmount:
        roundNumber(
          toNumber(
            summary?.grossAmount
          )
        ),

      feeAmount:
        roundNumber(
          toNumber(
            summary?.feeAmount
          )
        ),

      completedCount:
        Number(
          summary?.completedCount ??
            0
        ),

      completedAmount:
        roundNumber(
          toNumber(
            summary?.completedAmount
          )
        ),
    },

    rows: rows.map(
      (
        row: Record<
          string,
          unknown
        >
      ) => ({
        paymentId:
          row.paymentId,

        orderId:
          row.orderId
            ? String(
                row.orderId
              )
            : null,

        customerId:
          row.customerId
            ? String(
                row.customerId
              )
            : null,

        amount:
          roundNumber(
            toNumber(
              row.amount
            )
          ),

        currency:
          row.currency,

        feeAmount:
          roundNumber(
            toNumber(
              row.feeAmount
            )
          ),

        netAmount:
          row.netAmount
            ? roundNumber(
                toNumber(
                  row.netAmount
                )
              )
            : null,

        sourceType:
          row.sourceType,

        provider:
          row.provider,

        mode:
          row.mode,

        status:
          row.status,

        merchantReference:
          row.merchantReference ??
          null,

        providerPaymentId:
          row.providerPaymentId ??
          null,

        createdAt:
          row.createdAt,

        completedAt:
          row.completedAt ??
          null,

        failedAt:
          row.failedAt ??
          null,
      })
    ),
  };
}

/* =========================================================
   PAYOUT REPORT
========================================================= */

async function buildPayoutReport(
  merchantId: mongoose.Types.ObjectId,
  input: MerchantReportInput
) {
  const filter:
    Record<
      string,
      unknown
    > = {
    merchantId,
  };

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
    filter.requestedAt = {
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

  const status =
    normalizeText(
      input.status,
      50
    );

  if (status) {
    filter.status =
      status;
  }

  const payoutMethod =
    normalizeText(
      input.payoutMethod,
      50
    );

  if (payoutMethod) {
    filter.payoutMethod =
      payoutMethod;
  }

  const currency =
    normalizeText(
      input.currency,
      3
    )?.toUpperCase();

  if (currency) {
    filter.currency =
      currency;
  }

  const result =
    await Payout.aggregate([
      {
        $match:
          filter,
      },

      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,

                count: {
                  $sum: 1,
                },

                amount: {
                  $sum:
                    "$amount",
                },

                feeAmount: {
                  $sum: {
                    $ifNull: [
                      "$feeAmount",
                      0,
                    ],
                  },
                },

                netAmount: {
                  $sum:
                    "$netAmount",
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
                      "$netAmount",
                      0,
                    ],
                  },
                },
              },
            },
          ],

          rows: [
            {
              $sort: {
                requestedAt:
                  -1,
              },
            },

            {
              $limit:
                5000,
            },
          ],
        },
      },
    ]);

  const summary =
    result?.[0]?.summary?.[0];

  const rows =
    result?.[0]?.rows ?? [];

  return {
    summary: {
      count:
        Number(
          summary?.count ??
            0
        ),

      amount:
        roundNumber(
          toNumber(
            summary?.amount
          )
        ),

      feeAmount:
        roundNumber(
          toNumber(
            summary?.feeAmount
          )
        ),

      netAmount:
        roundNumber(
          toNumber(
            summary?.netAmount
          )
        ),

      completedAmount:
        roundNumber(
          toNumber(
            summary?.completedAmount
          )
        ),
    },

    rows:
      rows.map(
        (
          row: Record<
            string,
            unknown
          >
        ) => ({
          payoutId:
            row.payoutId,

          amount:
            roundNumber(
              toNumber(
                row.amount
              )
            ),

          currency:
            row.currency,

          feeAmount:
            roundNumber(
              toNumber(
                row.feeAmount
              )
            ),

          netAmount:
            roundNumber(
              toNumber(
                row.netAmount
              )
            ),

          payoutMethod:
            row.payoutMethod,

          destination:
            row.destination ??
            null,

          status:
            row.status,

          merchantReference:
            row.merchantReference ??
            null,

          externalReference:
            row.externalReference ??
            null,

          requestedAt:
            row.requestedAt,

          completedAt:
            row.completedAt ??
            null,
        })
      ),
  };
}

/* =========================================================
   SETTLEMENT REPORT
========================================================= */

async function buildSettlementReport(
  merchantId: mongoose.Types.ObjectId,
  input: MerchantReportInput
) {
  const filter:
    Record<
      string,
      unknown
    > = {
    merchantId,
  };

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
    filter.periodStart = {
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

  const status =
    normalizeText(
      input.status,
      50
    );

  if (status) {
    filter.status =
      status;
  }

  const currency =
    normalizeText(
      input.currency,
      3
    )?.toUpperCase();

  if (currency) {
    filter.currency =
      currency;
  }

  const result =
    await Settlement.aggregate([
      {
        $match:
          filter,
      },

      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,

                count: {
                  $sum: 1,
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

                adjustmentAmount: {
                  $sum:
                    "$adjustmentAmount",
                },

                netAmount: {
                  $sum:
                    "$netAmount",
                },
              },
            },
          ],

          rows: [
            {
              $sort: {
                periodStart:
                  -1,
              },
            },

            {
              $limit:
                5000,
            },
          ],
        },
      },
    ]);

  const summary =
    result?.[0]?.summary?.[0];

  const rows =
    result?.[0]?.rows ?? [];

  return {
    summary: {
      count:
        Number(
          summary?.count ??
            0
        ),

      grossAmount:
        roundNumber(
          toNumber(
            summary?.grossAmount
          )
        ),

      feeAmount:
        roundNumber(
          toNumber(
            summary?.feeAmount
          )
        ),

      refundAmount:
        roundNumber(
          toNumber(
            summary?.refundAmount
          )
        ),

      adjustmentAmount:
        roundNumber(
          toNumber(
            summary?.adjustmentAmount
          )
        ),

      netAmount:
        roundNumber(
          toNumber(
            summary?.netAmount
          )
        ),
    },

    rows:
      rows.map(
        (
          row: Record<
            string,
            unknown
          >
        ) => ({
          settlementId:
            row.settlementId,

          periodStart:
            row.periodStart,

          periodEnd:
            row.periodEnd,

          currency:
            row.currency,

          paymentCount:
            Number(
              row.paymentCount ??
                0
            ),

          grossAmount:
            roundNumber(
              toNumber(
                row.grossAmount
              )
            ),

          feeAmount:
            roundNumber(
              toNumber(
                row.feeAmount
              )
            ),

          refundAmount:
            roundNumber(
              toNumber(
                row.refundAmount
              )
            ),

          adjustmentAmount:
            roundNumber(
              toNumber(
                row.adjustmentAmount
              )
            ),

          netAmount:
            roundNumber(
              toNumber(
                row.netAmount
              )
            ),

          status:
            row.status,

          payoutId:
            row.payoutId ??
            null,

          settledAt:
            row.settledAt ??
            null,
        })
      ),
  };
}

/* =========================================================
   SUMMARY REPORT
========================================================= */

async function buildSummaryReport(
  merchantId: mongoose.Types.ObjectId,
  input: MerchantReportInput
) {
  const [
    payments,
    payouts,
    settlements,
  ] = await Promise.all([
    buildPaymentReport(
      merchantId,
      input
    ),

    buildPayoutReport(
      merchantId,
      input
    ),

    buildSettlementReport(
      merchantId,
      input
    ),
  ]);

  return {
    paymentSummary:
      payments.summary,

    payoutSummary:
      payouts.summary,

    settlementSummary:
      settlements.summary,
  };
}

/* =========================================================
   MAIN
========================================================= */

export async function getMerchantReport(
  input: MerchantReportInput
) {
  const merchant =
    await findMerchantForOwner(
      input.ownerId
    );

  const reportType =
    normalizeReportType(
      input.reportType
    );

  let report:
    Record<
      string,
      unknown
    >;

  if (
    reportType ===
    "payments"
  ) {
    report =
      await buildPaymentReport(
        merchant._id,
        input
      );
  } else if (
    reportType ===
    "payouts"
  ) {
    report =
      await buildPayoutReport(
        merchant._id,
        input
      );
  } else if (
    reportType ===
    "settlements"
  ) {
    report =
      await buildSettlementReport(
        merchant._id,
        input
      );
  } else {
    report =
      await buildSummaryReport(
        merchant._id,
        input
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

    reportType,

    range: {
      from:
        parseDate(
          input.from
        ),

      to:
        parseDate(
          input.to,
          true
        ),
    },

    generatedAt:
      new Date(),

    report,
  };
}