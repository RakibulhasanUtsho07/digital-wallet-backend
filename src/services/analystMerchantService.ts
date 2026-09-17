import type {
  PipelineStage,
} from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

import type {
  AnalystDateFilters,
  AnalystMetric,
} from "../types/analystTypes.js";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export interface AnalystMerchantInsight {
  id: string;

  severity:
    | "critical"
    | "high"
    | "medium"
    | "info"
    | "positive";

  category:
    | "growth"
    | "activation"
    | "verification"
    | "payments"
    | "concentration"
    | "data_quality";

  title: string;

  description: string;

  evidence: string;

  recommendedReview: string;
}

export interface AnalystMerchantAnalyticsData {
  generatedAt: string;

  source: {
    merchants:
      "mongodb_merchant_collection";

    payments:
      "mongodb_payment_collection";
  };

  filters: {
    range:
      AnalystDateFilters["range"];

    mode:
      AnalystDateFilters["mode"];

    currency:
      string;

    bucket:
      AnalystDateFilters["bucket"];

    from:
      string;

    to:
      string;

    previousFrom:
      string;

    previousTo:
      string;
  };

  population: {
    totalMerchants: number;

    activeMerchants: number;

    pendingMerchants: number;

    suspendedMerchants: number;

    disabledMerchants: number;

    verifiedMerchants: number;

    liveEnabledMerchants: number;

    testEnabledMerchants: number;

    verificationCoverage: number;

    liveReadinessRate: number;
  };

  metrics: {
    newMerchants:
      AnalystMetric;

    transactingMerchants:
      AnalystMetric;

    paymentAttempts:
      AnalystMetric;

    completedPayments:
      AnalystMetric;

    paymentVolumeMinor:
      AnalystMetric;

    feeRevenueMinor:
      AnalystMetric;

    successRate:
      AnalystMetric;

    merchantEngagementRate:
      AnalystMetric;
  };

  trend: Array<{
    bucket: string;

    newMerchantCount: number;

    transactingMerchantCount: number;

    paymentAttemptCount: number;

    completedPaymentCount: number;

    paymentVolumeMinor: number;

    successRate: number;
  }>;

  statuses: Array<{
    status: string;

    count: number;

    percentage: number;
  }>;

  verification: Array<{
    status: string;

    count: number;

    percentage: number;
  }>;

  businessTypes: Array<{
    type: string;

    count: number;

    percentage: number;
  }>;

  countries: Array<{
    country: string;

    count: number;

    percentage: number;
  }>;

  topMerchants: Array<{
    merchantId: string;

    businessName: string;

    businessDisplayName:
      string | null;

    businessType: string;

    country: string;

    status: string;

    verificationStatus:
      string;

    liveEnabled: boolean;

    paymentAttempts: number;

    completedPayments: number;

    failedPayments: number;

    paymentVolumeMinor: number;

    feeRevenueMinor: number;

    successRate: number;

    volumeShare: number;
  }>;

  insights:
    AnalystMerchantInsight[];
}

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface ActivitySummaryRow {
  transactingMerchantCount?:
    unknown;

  paymentAttempts?:
    unknown;

  completedPayments?:
    unknown;

  failedPayments?:
    unknown;

  paymentVolumeMinor?:
    unknown;

  feeRevenueMinor?:
    unknown;
}

interface MerchantActivityRow {
  _id?:
    unknown;

  businessName?:
    unknown;

  businessDisplayName?:
    unknown;

  businessType?:
    unknown;

  country?:
    unknown;

  status?:
    unknown;

  verificationStatus?:
    unknown;

  liveEnabled?:
    unknown;

  paymentAttempts?:
    unknown;

  completedPayments?:
    unknown;

  failedPayments?:
    unknown;

  paymentVolumeMinor?:
    unknown;

  feeRevenueMinor?:
    unknown;
}

interface ActivityFacetRow {
  summary?:
    ActivitySummaryRow[];

  top?:
    MerchantActivityRow[];
}

interface ActivitySummary {
  transactingMerchantCount:
    number;

  paymentAttempts:
    number;

  completedPayments:
    number;

  failedPayments:
    number;

  paymentVolumeMinor:
    number;

  feeRevenueMinor:
    number;
}

interface BreakdownRow {
  _id?:
    unknown;

  count?:
    unknown;
}

interface PaymentTrendRow {
  _id?:
    unknown;

  transactingMerchantCount?:
    unknown;

  paymentAttemptCount?:
    unknown;

  completedPaymentCount?:
    unknown;

  paymentVolumeMinor?:
    unknown;
}

interface SignupTrendRow {
  _id?:
    unknown;

  count?:
    unknown;
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(
  value: unknown
): number {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function safeInteger(
  value: unknown
): number {
  return Math.max(
    0,
    Math.round(
      safeNumber(value)
    )
  );
}

function round(
  value: number
): number {
  return Number(
    value.toFixed(2)
  );
}

function percentage(
  part: number,
  total: number
): number {
  if (
    total <=
    0
  ) {
    return 0;
  }

  return round(
    (
      part /
      total
    ) *
      100
  );
}

function changePercent(
  current: number,
  previous: number
): number | null {
  if (
    previous ===
    0
  ) {
    return current ===
      0
      ? 0
      : null;
  }

  return round(
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
  );
}

function metric(
  current: number,
  previous: number
): AnalystMetric {
  return {
    value:
      round(current),

    previousValue:
      round(previous),

    changePercent:
      changePercent(
        current,
        previous
      ),
  };
}

/* =========================================================
   STRING HELPERS
========================================================= */

function stringValue(
  value: unknown,
  fallback = "unknown"
): string {
  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  return fallback;
}

/* =========================================================
   DECIMAL128 -> MINOR UNITS
========================================================= */

function decimalToMinor(
  field: string
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
                $convert: {
                  input:
                    field,

                  to:
                    "double",

                  onError:
                    0,

                  onNull:
                    0,
                },
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
   PAYMENT MATCH
========================================================= */

function createPaymentMatch(
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

/* =========================================================
   MERCHANT POPULATION
========================================================= */

async function loadPopulation() {
  const [
    totalMerchants,
    activeMerchants,
    pendingMerchants,
    suspendedMerchants,
    disabledMerchants,
    verifiedMerchants,
    liveEnabledMerchants,
    testEnabledMerchants,
  ] =
    await Promise.all([
      Merchant.countDocuments(
        {}
      ),

      Merchant.countDocuments({
        status:
          "active",
      }),

      Merchant.countDocuments({
        status:
          "pending",
      }),

      Merchant.countDocuments({
        status:
          "suspended",
      }),

      Merchant.countDocuments({
        status:
          "disabled",
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

      Merchant.countDocuments({
        testEnabled:
          true,
      }),
    ]);

  return {
    totalMerchants,

    activeMerchants,

    pendingMerchants,

    suspendedMerchants,

    disabledMerchants,

    verifiedMerchants,

    liveEnabledMerchants,

    testEnabledMerchants,

    verificationCoverage:
      percentage(
        verifiedMerchants,
        totalMerchants
      ),

    liveReadinessRate:
      percentage(
        liveEnabledMerchants,
        totalMerchants
      ),
  };
}

/* =========================================================
   NEW MERCHANT COUNT
========================================================= */

async function countNewMerchants(
  from: Date,
  to: Date
): Promise<number> {
  return Merchant.countDocuments({
    createdAt: {
      $gte:
        from,

      $lt:
        to,
    },
  });
}

/* =========================================================
   MERCHANT PAYMENT ACTIVITY
========================================================= */

async function loadMerchantActivity(
  filters:
    AnalystDateFilters,
  from: Date,
  to: Date
): Promise<{
  summary:
    ActivitySummary;

  top:
    MerchantActivityRow[];
}> {
  const pipeline:
    PipelineStage[] = [
      {
        $match:
          createPaymentMatch(
            filters,
            from,
            to
          ),
      },

      {
        $addFields: {
          amountMinorValue:
            decimalToMinor(
              "$amount"
            ),

          feeMinorValue:
            decimalToMinor(
              "$feeAmount"
            ),
        },
      },

      {
        $group: {
          _id:
            "$merchantId",

          paymentAttempts: {
            $sum:
              1,
          },

          completedPayments: {
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

          failedPayments: {
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

          paymentVolumeMinor: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amountMinorValue",

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

                "$feeMinorValue",

                0,
              ],
            },
          },
        },
      },

      {
        $lookup: {
          from:
            Merchant.collection
              .name,

          localField:
            "_id",

          foreignField:
            "_id",

          as:
            "merchant",
        },
      },

      {
        $unwind:
          "$merchant",
      },

      {
        $project: {
          _id:
            1,

          businessName:
            "$merchant.businessName",

          businessDisplayName:
            "$merchant.businessDisplayName",

          businessType:
            "$merchant.businessType",

          country:
            "$merchant.country",

          status:
            "$merchant.status",

          verificationStatus:
            "$merchant.verificationStatus",

          liveEnabled:
            "$merchant.liveEnabled",

          paymentAttempts:
            1,

          completedPayments:
            1,

          failedPayments:
            1,

          paymentVolumeMinor:
            1,

          feeRevenueMinor:
            1,
        },
      },

      {
        $facet: {
          summary: [
            {
              $group: {
                _id:
                  null,

                transactingMerchantCount: {
                  $sum:
                    1,
                },

                paymentAttempts: {
                  $sum:
                    "$paymentAttempts",
                },

                completedPayments: {
                  $sum:
                    "$completedPayments",
                },

                failedPayments: {
                  $sum:
                    "$failedPayments",
                },

                paymentVolumeMinor: {
                  $sum:
                    "$paymentVolumeMinor",
                },

                feeRevenueMinor: {
                  $sum:
                    "$feeRevenueMinor",
                },
              },
            },
          ],

          top: [
            {
              $sort: {
                paymentVolumeMinor:
                  -1,

                paymentAttempts:
                  -1,
              },
            },

            {
              $limit:
                12,
            },
          ],
        },
      },
    ];

  const rows =
    await Payment.aggregate<ActivityFacetRow>(
      pipeline
    );

  const root =
    rows[0];

  const summaryRow =
    root
      ?.summary?.[0];

  return {
    summary: {
      transactingMerchantCount:
        safeInteger(
          summaryRow
            ?.transactingMerchantCount
        ),

      paymentAttempts:
        safeInteger(
          summaryRow
            ?.paymentAttempts
        ),

      completedPayments:
        safeInteger(
          summaryRow
            ?.completedPayments
        ),

      failedPayments:
        safeInteger(
          summaryRow
            ?.failedPayments
        ),

      paymentVolumeMinor:
        safeInteger(
          summaryRow
            ?.paymentVolumeMinor
        ),

      feeRevenueMinor:
        safeInteger(
          summaryRow
            ?.feeRevenueMinor
        ),
    },

    top:
      root?.top ??
      [],
  };
}

/* =========================================================
   BREAKDOWN
========================================================= */

async function merchantBreakdown(
  field:
    | "status"
    | "verificationStatus"
    | "businessType"
    | "country"
): Promise<
  Array<{
    key: string;
    count: number;
    percentage: number;
  }>
> {
  const rows =
    await Merchant.aggregate<BreakdownRow>(
      [
        {
          $group: {
            _id: {
              $ifNull: [
                `$${field}`,
                "unknown",
              ],
            },

            count: {
              $sum:
                1,
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
    );

  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        safeInteger(
          row.count
        ),
      0
    );

  return rows.map(
    (
      row
    ) => {
      const count =
        safeInteger(
          row.count
        );

      return {
        key:
          stringValue(
            row._id
          ),

        count,

        percentage:
          percentage(
            count,
            total
          ),
      };
    }
  );
}

/* =========================================================
   BUCKET HELPERS
========================================================= */

function createBucketKeys(
  filters:
    AnalystDateFilters
): string[] {
  const count =
    filters.range ===
      "24h"
      ? 24
      : filters.range ===
          "7d"
        ? 7
        : filters.range ===
            "30d"
          ? 30
          : 90;

  const intervalMs =
    filters.bucket ===
    "hour"
      ? 60 *
        60 *
        1000
      : 24 *
        60 *
        60 *
        1000;

  const end =
    new Date(
      filters.to
    );

  if (
    filters.bucket ===
    "hour"
  ) {
    end.setUTCMinutes(
      0,
      0,
      0
    );
  } else {
    end.setUTCHours(
      0,
      0,
      0,
      0
    );
  }

  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      index
    ) => {
      const date =
        new Date(
          end.getTime() -
            (
              count -
              1 -
              index
            ) *
              intervalMs
        );

      return filters.bucket ===
        "hour"
        ? `${date
            .toISOString()
            .slice(
              0,
              13
            )}:00:00Z`
        : date
            .toISOString()
            .slice(
              0,
              10
            );
    }
  );
}

/* =========================================================
   MERCHANT SIGNUP TREND
========================================================= */

async function loadSignupTrend(
  filters:
    AnalystDateFilters
): Promise<
  SignupTrendRow[]
> {
  const format =
    filters.bucket ===
    "hour"
      ? "%Y-%m-%dT%H:00:00Z"
      : "%Y-%m-%d";

  return Merchant.aggregate<SignupTrendRow>(
    [
      {
        $match: {
          createdAt: {
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
            $dateToString: {
              date:
                "$createdAt",

              format,

              timezone:
                "UTC",
            },
          },

          count: {
            $sum:
              1,
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
}

/* =========================================================
   PAYMENT TREND
========================================================= */

async function loadPaymentTrend(
  filters:
    AnalystDateFilters
): Promise<
  PaymentTrendRow[]
> {
  const format =
    filters.bucket ===
    "hour"
      ? "%Y-%m-%dT%H:00:00Z"
      : "%Y-%m-%d";

  const pipeline:
    PipelineStage[] = [
      {
        $match:
          createPaymentMatch(
            filters,
            filters.from,
            filters.to
          ),
      },

      {
        $addFields: {
          amountMinorValue:
            decimalToMinor(
              "$amount"
            ),
        },
      },

      {
        $group: {
          _id: {
            bucket: {
              $dateToString: {
                date:
                  "$createdAt",

                format,

                timezone:
                  "UTC",
              },
            },

            merchantId:
              "$merchantId",
          },

          paymentAttemptCount: {
            $sum:
              1,
          },

          completedPaymentCount: {
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

          paymentVolumeMinor: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "completed",
                  ],
                },

                "$amountMinorValue",

                0,
              ],
            },
          },
        },
      },

      {
        $group: {
          _id:
            "$_id.bucket",

          transactingMerchantCount: {
            $sum:
              1,
          },

          paymentAttemptCount: {
            $sum:
              "$paymentAttemptCount",
          },

          completedPaymentCount: {
            $sum:
              "$completedPaymentCount",
          },

          paymentVolumeMinor: {
            $sum:
              "$paymentVolumeMinor",
          },
        },
      },

      {
        $sort: {
          _id:
            1,
        },
      },
    ];

  return Payment.aggregate<PaymentTrendRow>(
    pipeline
  );
}

/* =========================================================
   BUILD TREND
========================================================= */

async function buildTrend(
  filters:
    AnalystDateFilters
): Promise<
  AnalystMerchantAnalyticsData[
    "trend"
  ]
> {
  const [
    signupRows,
    paymentRows,
  ] =
    await Promise.all([
      loadSignupTrend(
        filters
      ),

      loadPaymentTrend(
        filters
      ),
    ]);

  const signupMap =
    new Map<
      string,
      number
    >();

  for (
    const row of
    signupRows
  ) {
    signupMap.set(
      stringValue(
        row._id,
        ""
      ),
      safeInteger(
        row.count
      )
    );
  }

  const paymentMap =
    new Map<
      string,
      PaymentTrendRow
    >();

  for (
    const row of
    paymentRows
  ) {
    paymentMap.set(
      stringValue(
        row._id,
        ""
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
      const payment =
        paymentMap.get(
          bucket
        );

      const attempts =
        safeInteger(
          payment
            ?.paymentAttemptCount
        );

      const completed =
        safeInteger(
          payment
            ?.completedPaymentCount
        );

      return {
        bucket,

        newMerchantCount:
          signupMap.get(
            bucket
          ) ??
          0,

        transactingMerchantCount:
          safeInteger(
            payment
              ?.transactingMerchantCount
          ),

        paymentAttemptCount:
          attempts,

        completedPaymentCount:
          completed,

        paymentVolumeMinor:
          safeInteger(
            payment
              ?.paymentVolumeMinor
          ),

        successRate:
          percentage(
            completed,
            attempts
          ),
      };
    }
  );
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildMerchantInsights(
  input: {
    population:
      Awaited<
        ReturnType<
          typeof loadPopulation
        >
      >;

    current:
      ActivitySummary;

    previous:
      ActivitySummary;

    currentNew:
      number;

    previousNew:
      number;

    topMerchants:
      AnalystMerchantAnalyticsData[
        "topMerchants"
      ];
  }
): AnalystMerchantInsight[] {
  const insights:
    AnalystMerchantInsight[] =
    [];

  const verificationCoverage =
    input.population
      .verificationCoverage;

  const liveReadiness =
    input.population
      .liveReadinessRate;

  const successRate =
    percentage(
      input.current
        .completedPayments,
      input.current
        .paymentAttempts
    );

  const engagementRate =
    percentage(
      input.current
        .transactingMerchantCount,
      input.population
        .totalMerchants
    );

  const signupChange =
    changePercent(
      input.currentNew,
      input.previousNew
    );

  if (
    verificationCoverage <
    70
  ) {
    insights.push({
      id:
        "merchant-verification-low",

      severity:
        verificationCoverage <
        50
          ? "high"
          : "medium",

      category:
        "verification",

      title:
        "Merchant verification coverage needs attention",

      description:
        "A meaningful share of merchant accounts is not verified.",

      evidence:
        `${verificationCoverage.toFixed(
          2
        )}% of merchant accounts are verified.`,

      recommendedReview:
        "Review verification pipeline throughput and pending merchant distribution with the operations team.",
    });
  }

  if (
    liveReadiness <
      50 &&
    input.population
        .totalMerchants >
      0
  ) {
    insights.push({
      id:
        "merchant-live-readiness",

      severity:
        liveReadiness <
        25
          ? "medium"
          : "info",

      category:
        "activation",

      title:
        "Live merchant readiness is limited",

      description:
        "Only part of the merchant population is active, verified, and enabled for live payments.",

      evidence:
        `${input.population.liveEnabledMerchants} of ${input.population.totalMerchants} merchants are live enabled (${liveReadiness.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare verification completion and live enablement to understand the activation gap.",
    });
  }

  if (
    input.current
        .paymentAttempts >=
      10 &&
    successRate <
      90
  ) {
    insights.push({
      id:
        "merchant-payment-reliability",

      severity:
        successRate <
        75
          ? "high"
          : "medium",

      category:
        "payments",

      title:
        "Merchant payment reliability is below target",

      description:
        "The combined merchant payment population has a weaker completion rate in the selected period.",

      evidence:
        `${successRate.toFixed(
          2
        )}% of ${input.current.paymentAttempts} payment attempts completed.`,

      recommendedReview:
        "Compare top merchant success rates and provider performance before escalating.",
    });
  }

  if (
    input.population
        .totalMerchants >=
      5 &&
    engagementRate <
      30
  ) {
    insights.push({
      id:
        "merchant-engagement-low",

      severity:
        engagementRate <
        15
          ? "medium"
          : "info",

      category:
        "activation",

      title:
        "Merchant transaction engagement is low",

      description:
        "Only a limited share of registered merchants generated payment traffic during this period.",

      evidence:
        `${input.current.transactingMerchantCount} of ${input.population.totalMerchants} merchants were transacting (${engagementRate.toFixed(
          2
        )}%).`,

      recommendedReview:
        "Compare newly onboarded, verified and live-enabled merchants to identify activation friction.",
    });
  }

  const topMerchant =
    input.topMerchants[0];

  if (
    topMerchant &&
    topMerchant.volumeShare >=
      50 &&
    input.current
        .paymentVolumeMinor >
      0
  ) {
    insights.push({
      id:
        "merchant-volume-concentration",

      severity:
        topMerchant.volumeShare >=
        70
          ? "high"
          : "medium",

      category:
        "concentration",

      title:
        "Merchant payment volume is concentrated",

      description:
        "One merchant contributes a large share of completed payment volume.",

      evidence:
        `${topMerchant.businessDisplayName || topMerchant.businessName} represents ${topMerchant.volumeShare.toFixed(
          2
        )}% of completed payment volume.`,

      recommendedReview:
        "Monitor concentration trends so platform growth is not interpreted as broadly distributed merchant growth.",
    });
  }

  if (
    signupChange !==
      null &&
    signupChange >=
      25
  ) {
    insights.push({
      id:
        "merchant-signup-growth",

      severity:
        "positive",

      category:
        "growth",

      title:
        "Merchant acquisition increased",

      description:
        "More merchant accounts were created than in the preceding equivalent period.",

      evidence:
        `New merchant creation changed by ${signupChange.toFixed(
          2
        )}%.`,

      recommendedReview:
        "Track whether new merchants progress from onboarding to verification and live transaction activity.",
    });
  }

  if (
    input.population
        .suspendedMerchants +
      input.population
        .disabledMerchants >
    0
  ) {
    insights.push({
      id:
        "merchant-restricted-accounts",

      severity:
        "info",

      category:
        "data_quality",

      title:
        "Restricted merchant accounts remain in the population",

      description:
        "The merchant population includes suspended or disabled accounts.",

      evidence:
        `${input.population.suspendedMerchants} suspended and ${input.population.disabledMerchants} disabled merchant accounts.`,

      recommendedReview:
        "Keep restricted accounts separated from active merchant performance when interpreting platform growth.",
    });
  }

  if (
    insights.length ===
    0
  ) {
    insights.push({
      id:
        "merchant-health-stable",

      severity:
        "positive",

      category:
        "growth",

      title:
        "Merchant ecosystem is within current thresholds",

      description:
        "No major deterministic activation, verification, payment, or concentration threshold was triggered.",

      evidence:
        `${input.population.totalMerchants} merchant accounts and ${input.current.transactingMerchantCount} transacting merchants were evaluated.`,

      recommendedReview:
        "Continue monitoring merchant growth, conversion and concentration.",
    });
  }

  return insights;
}

/* =========================================================
   PUBLIC SERVICE
========================================================= */

export async function getAnalystMerchantAnalytics(
  filters:
    AnalystDateFilters
): Promise<AnalystMerchantAnalyticsData> {
  const [
    population,

    currentNewMerchants,
    previousNewMerchants,

    currentActivity,
    previousActivity,

    trend,

    statuses,
    verification,
    businessTypes,
    countries,
  ] =
    await Promise.all([
      loadPopulation(),

      countNewMerchants(
        filters.from,
        filters.to
      ),

      countNewMerchants(
        filters.previousFrom,
        filters.previousTo
      ),

      loadMerchantActivity(
        filters,
        filters.from,
        filters.to
      ),

      loadMerchantActivity(
        filters,
        filters.previousFrom,
        filters.previousTo
      ),

      buildTrend(
        filters
      ),

      merchantBreakdown(
        "status"
      ),

      merchantBreakdown(
        "verificationStatus"
      ),

      merchantBreakdown(
        "businessType"
      ),

      merchantBreakdown(
        "country"
      ),
    ]);

  const currentSuccessRate =
    percentage(
      currentActivity
        .summary
        .completedPayments,
      currentActivity
        .summary
        .paymentAttempts
    );

  const previousSuccessRate =
    percentage(
      previousActivity
        .summary
        .completedPayments,
      previousActivity
        .summary
        .paymentAttempts
    );

  const currentEngagementRate =
    percentage(
      currentActivity
        .summary
        .transactingMerchantCount,
      population
        .totalMerchants
    );

  const previousEngagementRate =
    percentage(
      previousActivity
        .summary
        .transactingMerchantCount,
      population
        .totalMerchants
    );

  const totalVolume =
    currentActivity
      .summary
      .paymentVolumeMinor;

  const topMerchants:
    AnalystMerchantAnalyticsData[
      "topMerchants"
    ] =
    currentActivity.top.map(
      (
        row
      ) => {
        const attempts =
          safeInteger(
            row.paymentAttempts
          );

        const completed =
          safeInteger(
            row.completedPayments
          );

        const volume =
          safeInteger(
            row.paymentVolumeMinor
          );

        return {
          merchantId:
            stringValue(
              row._id,
              ""
            ),

          businessName:
            stringValue(
              row.businessName,
              "Unnamed merchant"
            ),

          businessDisplayName:
            typeof row.businessDisplayName ===
              "string" &&
            row.businessDisplayName.trim()
              ? row.businessDisplayName.trim()
              : null,

          businessType:
            stringValue(
              row.businessType
            ),

          country:
            stringValue(
              row.country
            ),

          status:
            stringValue(
              row.status
            ),

          verificationStatus:
            stringValue(
              row.verificationStatus
            ),

          liveEnabled:
            row.liveEnabled ===
            true,

          paymentAttempts:
            attempts,

          completedPayments:
            completed,

          failedPayments:
            safeInteger(
              row.failedPayments
            ),

          paymentVolumeMinor:
            volume,

          feeRevenueMinor:
            safeInteger(
              row.feeRevenueMinor
            ),

          successRate:
            percentage(
              completed,
              attempts
            ),

          volumeShare:
            percentage(
              volume,
              totalVolume
            ),
        };
      }
    );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      merchants:
        "mongodb_merchant_collection",

      payments:
        "mongodb_payment_collection",
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

      previousFrom:
        filters.previousFrom
          .toISOString(),

      previousTo:
        filters.previousTo
          .toISOString(),
    },

    population,

    metrics: {
      newMerchants:
        metric(
          currentNewMerchants,
          previousNewMerchants
        ),

      transactingMerchants:
        metric(
          currentActivity
            .summary
            .transactingMerchantCount,

          previousActivity
            .summary
            .transactingMerchantCount
        ),

      paymentAttempts:
        metric(
          currentActivity
            .summary
            .paymentAttempts,

          previousActivity
            .summary
            .paymentAttempts
        ),

      completedPayments:
        metric(
          currentActivity
            .summary
            .completedPayments,

          previousActivity
            .summary
            .completedPayments
        ),

      paymentVolumeMinor:
        metric(
          currentActivity
            .summary
            .paymentVolumeMinor,

          previousActivity
            .summary
            .paymentVolumeMinor
        ),

      feeRevenueMinor:
        metric(
          currentActivity
            .summary
            .feeRevenueMinor,

          previousActivity
            .summary
            .feeRevenueMinor
        ),

      successRate:
        metric(
          currentSuccessRate,
          previousSuccessRate
        ),

      merchantEngagementRate:
        metric(
          currentEngagementRate,
          previousEngagementRate
        ),
    },

    trend,

    statuses:
      statuses.map(
        (
          item
        ) => ({
          status:
            item.key,

          count:
            item.count,

          percentage:
            item.percentage,
        })
      ),

    verification:
      verification.map(
        (
          item
        ) => ({
          status:
            item.key,

          count:
            item.count,

          percentage:
            item.percentage,
        })
      ),

    businessTypes:
      businessTypes.map(
        (
          item
        ) => ({
          type:
            item.key,

          count:
            item.count,

          percentage:
            item.percentage,
        })
      ),

    countries:
      countries
        .slice(
          0,
          10
        )
        .map(
          (
            item
          ) => ({
            country:
              item.key,

            count:
              item.count,

            percentage:
              item.percentage,
          })
        ),

    topMerchants,

    insights:
      buildMerchantInsights({
        population,

        current:
          currentActivity
            .summary,

        previous:
          previousActivity
            .summary,

        currentNew:
          currentNewMerchants,

        previousNew:
          previousNewMerchants,

        topMerchants,
      }),
  };
}