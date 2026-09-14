import type {
  PipelineStage,
} from "mongoose";

import {
  AnalyticsDailyFact,
} from "../models/AnalyticsDailyFact.js";

import {
  Dispute,
} from "../models/Dispute.js";

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
  RevenueEvent,
} from "../models/RevenueEvent.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  User,
} from "../models/User.js";

import {
  buildAnalystInsights,
  getAnalystSystemStatus,
} from "./analystInsightService.js";

import type {
  AnalystBreakdownItem,
  AnalystDateFilters,
  AnalystMetric,
  AnalystOverviewData,
  AnalystTrendPoint,
} from "../types/analystTypes.js";

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface PaymentSummaryRow {
  paymentCount?: unknown;
  completedCount?: unknown;
  failedCount?: unknown;
  volumeMinor?: unknown;
  netVolumeMinor?: unknown;
  feeRevenueMinor?: unknown;
}

interface PaymentBreakdownRow {
  _id?: unknown;
  count?: unknown;
  completedCount?: unknown;
  volumeMinor?: unknown;
}

interface PaymentTrendRow {
  _id?: unknown;
  paymentCount?: unknown;
  completedCount?: unknown;
  failedCount?: unknown;
  volumeMinor?: unknown;
  feeRevenueMinor?: unknown;
}

interface RefundSummaryRow {
  count?: unknown;
  amountMinor?: unknown;
}

interface DisputeSummaryRow {
  count?: unknown;
  exposureMinor?: unknown;
}

interface TransactionSummaryRow {
  count?: unknown;
  failedCount?: unknown;
  highRiskCount?: unknown;
  mediumRiskCount?: unknown;
  lowRiskCount?: unknown;
}

interface DailyFactSummaryRow {
  daysCovered?: unknown;
  transactionVolumeMinor?: unknown;
  latestGeneratedAt?: unknown;
}

interface RevenueLedgerRow {
  _id?: {
    currency?: unknown;
    mode?: unknown;
  };

  netRevenueMinor?: unknown;
  eventCount?: unknown;
}

interface PaymentSummary {
  paymentCount: number;
  completedCount: number;
  failedCount: number;
  volumeMinor: number;
  netVolumeMinor: number;
  feeRevenueMinor: number;
}

interface RefundSummary {
  count: number;
  amountMinor: number;
}

interface DisputeSummary {
  count: number;
  exposureMinor: number;
}

interface TransactionSummary {
  count: number;
  failedCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(
  input: unknown
): number {
  if (
    typeof input ===
    "number"
  ) {
    return Number.isFinite(
      input
    )
      ? input
      : 0;
  }

  if (
    typeof input ===
    "string"
  ) {
    const parsed =
      Number(input);

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  if (
    input &&
    typeof input ===
      "object" &&
    "toString" in input &&
    typeof input.toString ===
      "function"
  ) {
    const parsed =
      Number(
        input.toString()
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  return 0;
}

function safeInteger(
  input: unknown
): number {
  const value =
    Math.round(
      safeNumber(input)
    );

  if (
    !Number.isSafeInteger(
      value
    )
  ) {
    return 0;
  }

  return value;
}

function percentage(
  numerator: number,
  denominator: number
): number {
  if (
    denominator <= 0
  ) {
    return 0;
  }

  return Number(
    (
      (
        numerator /
        denominator
      ) *
      100
    ).toFixed(2)
  );
}

function calculateChange(
  current: number,
  previous: number
): number | null {
  if (
    previous === 0
  ) {
    return current === 0
      ? 0
      : null;
  }

  return Number(
    (
      (
        (
          current -
          previous
        ) /
        Math.abs(
          previous
        )
      ) *
      100
    ).toFixed(2)
  );
}

function createMetric(
  value: number,
  previousValue: number
): AnalystMetric {
  return {
    value,
    previousValue,

    changePercent:
      calculateChange(
        value,
        previousValue
      ),
  };
}

/* =========================================================
   DATE HELPERS
========================================================= */

function getDateKey(
  date: Date
): string {
  return date
    .toISOString()
    .slice(
      0,
      10
    );
}

function formatLabel(
  input: string
): string {
  return input
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
    );
}

/* =========================================================
   MONGODB HELPERS
========================================================= */

function paymentMatch(
  filters:
    AnalystDateFilters,
  from: Date,
  to: Date
): Record<
  string,
  unknown
> {
  const match:
    Record<
      string,
      unknown
    > = {
      createdAt: {
        $gte:
          from,

        $lt:
          to,
      },

      currency:
        filters.currency,
    };

  if (
    filters.mode !==
    "all"
  ) {
    match.mode =
      filters.mode;
  }

  return match;
}

/*
 * Payment and Dispute amounts use Decimal128 major units.
 *
 * Example:
 * Decimal128("100.50")
 * becomes:
 * 10050 minor units.
 */
function decimalToMinor(
  field: unknown
): Record<
  string,
  unknown
> {
  return {
    $convert: {
      input: {
        $round: [
          {
            $multiply: [
              {
                $ifNull: [
                  field,
                  0,
                ],
              },

              100,
            ],
          },

          0,
        ],
      },

      to:
        "long",

      onError:
        0,

      onNull:
        0,
    },
  };
}

/* =========================================================
   PAYMENT SUMMARY
========================================================= */

async function loadPaymentSummary(
  filters:
    AnalystDateFilters,
  from: Date,
  to: Date
): Promise<PaymentSummary> {
  const rows =
    await Payment.aggregate<PaymentSummaryRow>(
      [
        {
          $match:
            paymentMatch(
              filters,
              from,
              to
            ),
        },

        {
          $group: {
            _id:
              null,

            paymentCount: {
              $sum:
                1,
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

            volumeMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  decimalToMinor(
                    "$amount"
                  ),

                  0,
                ],
              },
            },

            netVolumeMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  decimalToMinor({
                    $ifNull: [
                      "$netAmount",
                      "$amount",
                    ],
                  }),

                  0,
                ],
              },
            },

            feeRevenueMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  decimalToMinor(
                    "$feeAmount"
                  ),

                  0,
                ],
              },
            },
          },
        },
      ]
    );

  /*
   * Do not use:
   *
   * const row = rows[0] ?? {};
   *
   * That creates:
   * PaymentSummaryRow | {}
   *
   * and causes:
   * Property 'paymentCount' does not exist on type '{}'.
   */

  const row:
    PaymentSummaryRow |
    undefined =
    rows[0];

  return {
    paymentCount:
      safeInteger(
        row?.paymentCount
      ),

    completedCount:
      safeInteger(
        row?.completedCount
      ),

    failedCount:
      safeInteger(
        row?.failedCount
      ),

    volumeMinor:
      safeInteger(
        row?.volumeMinor
      ),

    netVolumeMinor:
      safeInteger(
        row?.netVolumeMinor
      ),

    feeRevenueMinor:
      safeInteger(
        row?.feeRevenueMinor
      ),
  };
}

/* =========================================================
   PAYMENT BREAKDOWNS
========================================================= */

async function loadPaymentBreakdowns(
  filters:
    AnalystDateFilters
): Promise<{
  statuses:
    AnalystBreakdownItem[];

  providers:
    AnalystBreakdownItem[];
}> {
  const match =
    paymentMatch(
      filters,
      filters.from,
      filters.to
    );

  const [
    statusRows,
    providerRows,
  ] =
    await Promise.all([
      Payment.aggregate<PaymentBreakdownRow>(
        [
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

              volumeMinor: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        "$status",
                        "completed",
                      ],
                    },

                    decimalToMinor(
                      "$amount"
                    ),

                    0,
                  ],
                },
              },
            },
          },

          {
            $sort: {
              count:
                -1,
            },
          },
        ]
      ),

      Payment.aggregate<PaymentBreakdownRow>(
        [
          {
            $match:
              match,
          },

          {
            $group: {
              _id:
                "$provider",

              count: {
                $sum:
                  1,
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

              volumeMinor: {
                $sum: {
                  $cond: [
                    {
                      $eq: [
                        "$status",
                        "completed",
                      ],
                    },

                    decimalToMinor(
                      "$amount"
                    ),

                    0,
                  ],
                },
              },
            },
          },

          {
            $sort: {
              count:
                -1,
            },
          },

          {
            $limit:
              8,
          },
        ]
      ),
    ]);

  const statusTotal =
    statusRows.reduce(
      (
        total,
        row
      ) =>
        total +
        safeInteger(
          row.count
        ),
      0
    );

  const providerTotal =
    providerRows.reduce(
      (
        total,
        row
      ) =>
        total +
        safeInteger(
          row.count
        ),
      0
    );

  const statuses:
    AnalystBreakdownItem[] =
    statusRows.map(
      (
        row
      ) => {
        const key =
          String(
            row._id ??
              "unknown"
          );

        const count =
          safeInteger(
            row.count
          );

        return {
          key,

          label:
            formatLabel(
              key
            ),

          count,

          percentage:
            percentage(
              count,
              statusTotal
            ),

          volumeMinor:
            safeInteger(
              row.volumeMinor
            ),
        };
      }
    );

  const providers:
    AnalystBreakdownItem[] =
    providerRows.map(
      (
        row
      ) => {
        const key =
          String(
            row._id ??
              "unknown"
          );

        const count =
          safeInteger(
            row.count
          );

        return {
          key,

          label:
            formatLabel(
              key
            ),

          count,

          percentage:
            percentage(
              count,
              providerTotal
            ),

          volumeMinor:
            safeInteger(
              row.volumeMinor
            ),
        };
      }
    );

  return {
    statuses,
    providers,
  };
}

/* =========================================================
   PAYMENT TREND
========================================================= */

function createBucketKeys(
  filters:
    AnalystDateFilters
): string[] {
  const buckets:
    string[] = [];

  const cursor =
    new Date(
      filters.from
    );

  if (
    filters.bucket ===
    "hour"
  ) {
    cursor.setUTCMinutes(
      0,
      0,
      0
    );

    while (
      cursor <=
      filters.to
    ) {
      buckets.push(
        `${cursor
          .toISOString()
          .slice(
            0,
            13
          )}:00:00Z`
      );

      cursor.setUTCHours(
        cursor.getUTCHours() +
          1
      );
    }

    return buckets;
  }

  cursor.setUTCHours(
    0,
    0,
    0,
    0
  );

  while (
    cursor <=
    filters.to
  ) {
    buckets.push(
      getDateKey(
        cursor
      )
    );

    cursor.setUTCDate(
      cursor.getUTCDate() +
        1
    );
  }

  return buckets;
}

async function loadPaymentTrend(
  filters:
    AnalystDateFilters
): Promise<
  AnalystTrendPoint[]
> {
  const format =
    filters.bucket ===
    "hour"
      ? "%Y-%m-%dT%H:00:00Z"
      : "%Y-%m-%d";

  const rows =
    await Payment.aggregate<PaymentTrendRow>(
      [
        {
          $match:
            paymentMatch(
              filters,
              filters.from,
              filters.to
            ),
        },

        {
          $group: {
            _id: {
              $dateToString: {
                date:
                  "$createdAt",

                format,

                timezone:
                  "UTC",
              },
            },

            paymentCount: {
              $sum:
                1,
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

            volumeMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  decimalToMinor(
                    "$amount"
                  ),

                  0,
                ],
              },
            },

            feeRevenueMinor: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "completed",
                    ],
                  },

                  decimalToMinor(
                    "$feeAmount"
                  ),

                  0,
                ],
              },
            },
          },
        },

        {
          $sort: {
            _id:
              1,
          },
        },
      ]
    );

  const rowsByBucket =
    new Map<
      string,
      PaymentTrendRow
    >();

  for (
    const row of rows
  ) {
    rowsByBucket.set(
      String(
        row._id
      ),
      row
    );
  }

  return createBucketKeys(
    filters
  ).map(
    (
      bucket
    ) => {
      const row =
        rowsByBucket.get(
          bucket
        );

      const paymentCount =
        safeInteger(
          row?.paymentCount
        );

      const completedCount =
        safeInteger(
          row?.completedCount
        );

      return {
        bucket,

        paymentCount,

        completedCount,

        failedCount:
          safeInteger(
            row?.failedCount
          ),

        volumeMinor:
          safeInteger(
            row?.volumeMinor
          ),

        feeRevenueMinor:
          safeInteger(
            row?.feeRevenueMinor
          ),

        successRate:
          percentage(
            completedCount,
            paymentCount
          ),
      };
    }
  );
}

/* =========================================================
   REFUND SUMMARY
========================================================= */

async function loadRefundSummary(
  filters:
    AnalystDateFilters,
  from: Date,
  to: Date
): Promise<RefundSummary> {
  const match:
    Record<
      string,
      unknown
    > = {
      createdAt: {
        $gte:
          from,

        $lt:
          to,
      },

      currency:
        filters.currency,

      status:
        "completed",
    };

  if (
    filters.mode !==
    "all"
  ) {
    match.mode =
      filters.mode;
  }

  const rows =
    await Refund.aggregate<RefundSummaryRow>(
      [
        {
          $match:
            match,
        },

        {
          $group: {
            _id:
              null,

            count: {
              $sum:
                1,
            },

            amountMinor: {
              $sum:
                "$amountMinor",
            },
          },
        },
      ]
    );

  const row:
    RefundSummaryRow |
    undefined =
    rows[0];

  return {
    count:
      safeInteger(
        row?.count
      ),

    amountMinor:
      safeInteger(
        row?.amountMinor
      ),
  };
}

/* =========================================================
   DISPUTE SUMMARY

   Dispute does not contain a mode field.
   Payment lookup is used for Test/Live filtering.
========================================================= */

async function loadDisputeSummary(
  filters:
    AnalystDateFilters,
  from: Date,
  to: Date
): Promise<DisputeSummary> {
  const pipeline:
    PipelineStage[] = [
      {
        $match: {
          createdAt: {
            $gte:
              from,

            $lt:
              to,
          },

          currency:
            filters.currency,

          status: {
            $in: [
              "disputed",
              "under_review",
            ],
          },
        },
      },
  ];

  if (
    filters.mode !==
    "all"
  ) {
    pipeline.push(
      {
        $lookup: {
          from:
            Payment.collection
              .name,

          localField:
            "paymentId",

          foreignField:
            "_id",

          as:
            "payment",
        },
      },

      {
        $unwind:
          "$payment",
      },

      {
        $match: {
          "payment.mode":
            filters.mode,
        },
      }
    );
  }

  pipeline.push({
    $group: {
      _id:
        null,

      count: {
        $sum:
          1,
      },

      exposureMinor: {
        $sum:
          decimalToMinor(
            "$amount"
          ),
      },
    },
  });

  const rows =
    await Dispute.aggregate<DisputeSummaryRow>(
      pipeline
    );

  const row:
    DisputeSummaryRow |
    undefined =
    rows[0];

  return {
    count:
      safeInteger(
        row?.count
      ),

    exposureMinor:
      safeInteger(
        row?.exposureMinor
      ),
  };
}

/* =========================================================
   WALLET TRANSACTION SUMMARY

   Transaction values remain encrypted.
   The service never decrypts amountEncrypted.
========================================================= */

async function loadTransactionSummary(
  from: Date,
  to: Date
): Promise<TransactionSummary> {
  const rows =
    await Transaction.aggregate<TransactionSummaryRow>(
      [
        {
          $match: {
            createdAt: {
              $gte:
                from,

              $lt:
                to,
            },
          },
        },

        {
          $group: {
            _id:
              null,

            count: {
              $sum:
                1,
            },

            failedCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "FAILED",
                    ],
                  },

                  1,
                  0,
                ],
              },
            },

            highRiskCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$riskScore",
                      "HIGH",
                    ],
                  },

                  1,
                  0,
                ],
              },
            },

            mediumRiskCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$riskScore",
                      "MEDIUM",
                    ],
                  },

                  1,
                  0,
                ],
              },
            },

            lowRiskCount: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$riskScore",
                      "LOW",
                    ],
                  },

                  1,
                  0,
                ],
              },
            },
          },
        },
      ]
    );

  const row:
    TransactionSummaryRow |
    undefined =
    rows[0];

  return {
    count:
      safeInteger(
        row?.count
      ),

    failedCount:
      safeInteger(
        row?.failedCount
      ),

    highRiskCount:
      safeInteger(
        row?.highRiskCount
      ),

    mediumRiskCount:
      safeInteger(
        row?.mediumRiskCount
      ),

    lowRiskCount:
      safeInteger(
        row?.lowRiskCount
      ),
  };
}

/* =========================================================
   ANALYTICS DAILY FACT SUMMARY
========================================================= */

async function loadDailyFactSummary(
  filters:
    AnalystDateFilters
): Promise<{
  daysCovered: number;
  transactionVolumeMinor:
    number;
  latestGeneratedAt:
    string | null;
}> {
  const rows =
    await AnalyticsDailyFact.aggregate<DailyFactSummaryRow>(
      [
        {
          $match: {
            dateKey: {
              $gte:
                getDateKey(
                  filters.from
                ),

              $lte:
                getDateKey(
                  filters.to
                ),
            },
          },
        },

        {
          $group: {
            _id:
              null,

            daysCovered: {
              $sum:
                1,
            },

            transactionVolumeMinor: {
              $sum:
                "$transaction.volumeMinor",
            },

            latestGeneratedAt: {
              $max:
                "$generatedAt",
            },
          },
        },
      ]
    );

  const row:
    DailyFactSummaryRow |
    undefined =
    rows[0];

  const latestGeneratedAt =
    row?.latestGeneratedAt;

  let latestGeneratedAtValue:
    string | null =
    null;

  if (
    latestGeneratedAt instanceof
    Date
  ) {
    latestGeneratedAtValue =
      latestGeneratedAt.toISOString();
  } else if (
    typeof latestGeneratedAt ===
    "string"
  ) {
    latestGeneratedAtValue =
      latestGeneratedAt;
  }

  /*
   * AnalyticsDailyFact currently has no currency
   * or Test/Live dimension.
   *
   * Therefore its volume is only exposed for the
   * unfiltered BDT platform view.
   */
  const mayUseFactVolume =
    filters.mode ===
      "all" &&
    filters.currency ===
      "BDT" &&
    filters.range !==
      "24h";

  return {
    daysCovered:
      safeInteger(
        row?.daysCovered
      ),

    transactionVolumeMinor:
      mayUseFactVolume
        ? safeInteger(
            row?.transactionVolumeMinor
          )
        : 0,

    latestGeneratedAt:
      latestGeneratedAtValue,
  };
}

/* =========================================================
   REVENUE EVENT LEDGER
========================================================= */

async function loadRevenueLedger(
  filters:
    AnalystDateFilters
): Promise<{
  classifiedNetRevenueMinor:
    number;

  classifiedEventCount:
    number;

  unclassifiedEventCount:
    number;
}> {
  const rows =
    await RevenueEvent.aggregate<RevenueLedgerRow>(
      [
        {
          $match: {
            occurredAt: {
              $gte:
                filters.from,

              $lt:
                filters.to,
            },
          },
        },

        {
          $group: {
            _id: {
              currency: {
                $toUpper: {
                  $convert: {
                    input:
                      "$metadata.currency",

                    to:
                      "string",

                    onError:
                      "",

                    onNull:
                      "",
                  },
                },
              },

              mode: {
                $toLower: {
                  $convert: {
                    input:
                      "$metadata.mode",

                    to:
                      "string",

                    onError:
                      "",

                    onNull:
                      "",
                  },
                },
              },
            },

            netRevenueMinor: {
              $sum: {
                $cond: [
                  {
                    $in: [
                      "$kind",

                      [
                        "REFUND",
                        "FEE_WAIVER",
                        "GATEWAY_REVERSAL",
                      ],
                    ],
                  },

                  {
                    $multiply: [
                      "$feeMinor",
                      -1,
                    ],
                  },

                  "$feeMinor",
                ],
              },
            },

            eventCount: {
              $sum:
                1,
            },
          },
        },
      ]
    );

  let classifiedNetRevenueMinor =
    0;

  let classifiedEventCount =
    0;

  let unclassifiedEventCount =
    0;

  for (
    const row of rows
  ) {
    const currency =
      String(
        row._id
          ?.currency ??
          ""
      ).toUpperCase();

    const mode =
      String(
        row._id
          ?.mode ??
          ""
      ).toLowerCase();

    const count =
      safeInteger(
        row.eventCount
      );

    const currencyMatches =
      currency ===
      filters.currency;

    const modeMatches =
      filters.mode ===
        "all" ||
      mode ===
        filters.mode;

    if (
      currencyMatches &&
      modeMatches
    ) {
      classifiedNetRevenueMinor +=
        safeInteger(
          row.netRevenueMinor
        );

      classifiedEventCount +=
        count;

      continue;
    }

    const missingCurrency =
      currency.length ===
      0;

    const missingMode =
      filters.mode !==
        "all" &&
      currencyMatches &&
      mode.length ===
        0;

    if (
      missingCurrency ||
      missingMode
    ) {
      unclassifiedEventCount +=
        count;
    }
  }

  return {
    classifiedNetRevenueMinor,
    classifiedEventCount,
    unclassifiedEventCount,
  };
}

/* =========================================================
   PUBLIC ANALYST OVERVIEW SERVICE
========================================================= */

export async function getAnalystOverview(
  filters:
    AnalystDateFilters
): Promise<AnalystOverviewData> {
  const [
    currentPayments,
    previousPayments,

    breakdowns,
    trend,

    currentRefunds,
    previousRefunds,

    currentDisputes,
    previousDisputes,

    currentTransactions,
    previousTransactions,

    facts,
    revenueLedger,

    activeUsers,
    newUsers,
    kycVerifiedUsers,

    totalMerchants,
    activeMerchants,
    verifiedMerchants,
    liveEnabledMerchants,
  ] =
    await Promise.all([
      loadPaymentSummary(
        filters,
        filters.from,
        filters.to
      ),

      loadPaymentSummary(
        filters,
        filters.previousFrom,
        filters.previousTo
      ),

      loadPaymentBreakdowns(
        filters
      ),

      loadPaymentTrend(
        filters
      ),

      loadRefundSummary(
        filters,
        filters.from,
        filters.to
      ),

      loadRefundSummary(
        filters,
        filters.previousFrom,
        filters.previousTo
      ),

      loadDisputeSummary(
        filters,
        filters.from,
        filters.to
      ),

      loadDisputeSummary(
        filters,
        filters.previousFrom,
        filters.previousTo
      ),

      loadTransactionSummary(
        filters.from,
        filters.to
      ),

      loadTransactionSummary(
        filters.previousFrom,
        filters.previousTo
      ),

      loadDailyFactSummary(
        filters
      ),

      loadRevenueLedger(
        filters
      ),

      User.countDocuments({
        accountStatus:
          "active",
      }),

      User.countDocuments({
        accountStatus:
          "active",

        createdAt: {
          $gte:
            filters.from,

          $lt:
            filters.to,
        },
      }),

      User.countDocuments({
        accountStatus:
          "active",

        kycStatus:
          "verified",
      }),

      Merchant.countDocuments(
        {}
      ),

      Merchant.countDocuments({
        status:
          "active",
      }),

      Merchant.countDocuments({
        verificationStatus:
          "verified",
      }),

      Merchant.countDocuments({
        status:
          "active",

        verificationStatus:
          "verified",

        liveEnabled:
          true,
      }),
    ]);

  const currentSuccessRate =
    percentage(
      currentPayments
        .completedCount,

      currentPayments
        .paymentCount
    );

  const previousSuccessRate =
    percentage(
      previousPayments
        .completedCount,

      previousPayments
        .paymentCount
    );

  const riskCounts = [
    {
      key:
        "LOW",

      label:
        "Low",

      count:
        currentTransactions
          .lowRiskCount,
    },

    {
      key:
        "MEDIUM",

      label:
        "Medium",

      count:
        currentTransactions
          .mediumRiskCount,
    },

    {
      key:
        "HIGH",

      label:
        "High",

      count:
        currentTransactions
          .highRiskCount,
    },
  ];

  const transactionRisk:
    AnalystBreakdownItem[] =
    riskCounts.map(
      (
        item
      ) => ({
        ...item,

        percentage:
          percentage(
            item.count,
            currentTransactions
              .count
          ),
      })
    );

  const insights =
    buildAnalystInsights({
      paymentCount:
        currentPayments
          .paymentCount,

      failedPaymentCount:
        currentPayments
          .failedCount,

      successRate:
        currentSuccessRate,

      previousSuccessRate,

      paymentVolumeMinor:
        currentPayments
          .volumeMinor,

      previousPaymentVolumeMinor:
        previousPayments
          .volumeMinor,

      feeRevenueMinor:
        currentPayments
          .feeRevenueMinor,

      previousFeeRevenueMinor:
        previousPayments
          .feeRevenueMinor,

      refundAmountMinor:
        currentRefunds
          .amountMinor,

      disputeExposureMinor:
        currentDisputes
          .exposureMinor,

      openDisputeCount:
        currentDisputes
          .count,

      transactionCount:
        currentTransactions
          .count,

      failedTransactionCount:
        currentTransactions
          .failedCount,

      highRiskTransactionCount:
        currentTransactions
          .highRiskCount,

      trend,

      revenueUnclassifiedEventCount:
        revenueLedger
          .unclassifiedEventCount,
    });

  const generatedAt =
    new Date()
      .toISOString();

  return {
    generatedAt,

    intelligenceEngine: {
      type:
        "deterministic_rules",

      paidProviderUsed:
        false,

      version:
        "1.0.0",
    },

    filters: {
      range:
        filters.range,

      mode:
        filters.mode,

      currency:
        filters.currency,

      bucket:
        filters.bucket,

      from:
        filters.from
          .toISOString(),

      to:
        filters.to
          .toISOString(),
    },

    freshness: {
      liveCollectionsReadAt:
        generatedAt,

      latestDailyFactGeneratedAt:
        facts.latestGeneratedAt,

      dailyFactDaysCovered:
        facts.daysCovered,
    },

    status:
      getAnalystSystemStatus(
        insights
      ),

    metrics: {
      paymentVolumeMinor:
        createMetric(
          currentPayments
            .volumeMinor,

          previousPayments
            .volumeMinor
        ),

      netPaymentVolumeMinor:
        createMetric(
          currentPayments
            .netVolumeMinor,

          previousPayments
            .netVolumeMinor
        ),

      paymentCount:
        createMetric(
          currentPayments
            .paymentCount,

          previousPayments
            .paymentCount
        ),

      completedPaymentCount:
        createMetric(
          currentPayments
            .completedCount,

          previousPayments
            .completedCount
        ),

      successRate:
        createMetric(
          currentSuccessRate,
          previousSuccessRate
        ),

      paymentFeeRevenueMinor:
        createMetric(
          currentPayments
            .feeRevenueMinor,

          previousPayments
            .feeRevenueMinor
        ),

      refundAmountMinor:
        createMetric(
          currentRefunds
            .amountMinor,

          previousRefunds
            .amountMinor
        ),

      openDisputeExposureMinor:
        createMetric(
          currentDisputes
            .exposureMinor,

          previousDisputes
            .exposureMinor
        ),

      walletTransactionCount:
        createMetric(
          currentTransactions
            .count,

          previousTransactions
            .count
        ),
    },

    accounts: {
      activeUsers,
      newUsers,
      kycVerifiedUsers,
      totalMerchants,
      activeMerchants,
      verifiedMerchants,
      liveEnabledMerchants,
    },

    operations: {
      failedPaymentCount:
        currentPayments
          .failedCount,

      refundCount:
        currentRefunds
          .count,

      openDisputeCount:
        currentDisputes
          .count,

      failedTransactionCount:
        currentTransactions
          .failedCount,

      highRiskTransactionCount:
        currentTransactions
          .highRiskCount,

      walletTransactionVolumeMinor:
        facts
          .transactionVolumeMinor,
    },

    revenueLedger: {
      ...revenueLedger,

      note:
        "Only revenue events tagged with the selected currency and environment are included. Core payment revenue uses completed Payment.feeAmount.",
    },

    trend,

    paymentStatus:
      breakdowns.statuses,

    providers:
      breakdowns.providers,

    transactionRisk,

    insights,
  };
}