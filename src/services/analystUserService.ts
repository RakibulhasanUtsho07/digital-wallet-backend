import type {
  PipelineStage,
  Types,
} from "mongoose";

import {
  User,
} from "../models/User.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  Budget,
} from "../models/Budget.js";

import {
  CashFlowPlan,
} from "../models/CashFlowPlan.js";

import {
  AuthSession,
} from "../models/AuthSession.js";

/* =========================================================
   TYPES
========================================================= */

export type AnalystUserRange =
  | "24h"
  | "7d"
  | "30d"
  | "90d";

export interface AnalystUserMetric {
  value:
    number;

  previousValue:
    number;

  changePercent:
    number | null;
}

interface RangeBoundary {
  range:
    AnalystUserRange;

  bucket:
    "hour" | "day";

  bucketCount:
    number;

  from:
    Date;

  to:
    Date;

  previousFrom:
    Date;

  previousTo:
    Date;
}

interface TrendRow {
  bucket:
    string;

  count:
    number;
}

interface UniqueTrendRow {
  bucket:
    string;

  users:
    unknown[];
}

/* =========================================================
   NUMBER HELPERS
========================================================= */

function round(
  value: number,
  digits = 2
): number {
  const multiplier =
    10 ** digits;

  return (
    Math.round(
      value *
        multiplier
    ) /
    multiplier
  );
}

function percentage(
  value: number,
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
      value /
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
      previous
    ) *
      100
  );
}

function metric(
  current: number,
  previous: number
): AnalystUserMetric {
  return {
    value:
      current,

    previousValue:
      previous,

    changePercent:
      changePercent(
        current,
        previous
      ),
  };
}

/* =========================================================
   RANGE
========================================================= */

function normalizeBucketStart(
  input: Date,
  bucket:
    "hour" | "day"
): Date {
  const value =
    new Date(
      input
    );

  if (
    bucket ===
    "hour"
  ) {
    value.setUTCMinutes(
      0,
      0,
      0
    );

    return value;
  }

  value.setUTCHours(
    0,
    0,
    0
  );

  return value;
}

function getRangeBoundary(
  range:
    AnalystUserRange
): RangeBoundary {
  const now =
    new Date();

  const settings: Record<
    AnalystUserRange,
    {
      bucket:
        "hour" | "day";

      bucketCount:
        number;

      bucketMs:
        number;
    }
  > = {
    "24h": {
      bucket:
        "hour",

      bucketCount:
        24,

      bucketMs:
        60 *
        60 *
        1000,
    },

    "7d": {
      bucket:
        "day",

      bucketCount:
        7,

      bucketMs:
        24 *
        60 *
        60 *
        1000,
    },

    "30d": {
      bucket:
        "day",

      bucketCount:
        30,

      bucketMs:
        24 *
        60 *
        60 *
        1000,
    },

    "90d": {
      bucket:
        "day",

      bucketCount:
        90,

      bucketMs:
        24 *
        60 *
        60 *
        1000,
    },
  };

  const setting =
    settings[
      range
    ];

  const currentBucketStart =
    normalizeBucketStart(
      now,
      setting.bucket
    );

  const from =
    new Date(
      currentBucketStart.getTime() -
        (
          setting.bucketCount -
          1
        ) *
          setting.bucketMs
    );

  const previousTo =
    new Date(
      from
    );

  const previousFrom =
    new Date(
      previousTo.getTime() -
        setting.bucketCount *
          setting.bucketMs
    );

  return {
    range,

    bucket:
      setting.bucket,

    bucketCount:
      setting.bucketCount,

    from,

    to:
      now,

    previousFrom,

    previousTo,
  };
}

/* =========================================================
   BUCKET FORMAT
========================================================= */

function getBucketExpression(
  field:
    string,
  bucket:
    "hour" | "day"
): PipelineStage.Project["$project"] {
  const format =
    bucket ===
    "hour"
      ? "%Y-%m-%dT%H:00:00.000Z"
      : "%Y-%m-%dT00:00:00.000Z";

  return {
    bucket: {
      $dateToString: {
        date:
          field,

        format,

        timezone:
          "UTC",
      },
    },
  };
}

function formatBucketKey(
  date: Date,
  bucket:
    "hour" | "day"
): string {
  if (
    bucket ===
    "hour"
  ) {
    return (
      date
        .toISOString()
        .slice(
          0,
          13
        ) +
      ":00:00.000Z"
    );
  }

  return (
    date
      .toISOString()
      .slice(
        0,
        10
      ) +
    "T00:00:00.000Z"
  );
}

/* =========================================================
   USER ID HELPERS
========================================================= */

function uniqueIds(
  ...groups:
    Array<
      Array<
        Types.ObjectId |
        string
      >
    >
): string[] {
  const values =
    new Set<string>();

  for (
    const group of
    groups
  ) {
    for (
      const id of
      group
    ) {
      if (
        id
      ) {
        values.add(
          id.toString()
        );
      }
    }
  }

  return [
    ...values,
  ];
}

/* =========================================================
   DISTINCT TRANSACTION USERS
========================================================= */

async function getTransactionUsers(
  userIds:
    Types.ObjectId[],
  from:
    Date,
  to:
    Date,
  highRiskOnly =
    false
): Promise<string[]> {
  if (
    userIds.length ===
    0
  ) {
    return [];
  }

  const query = {
    createdAt: {
      $gte:
        from,

      $lt:
        to,
    },

    ...(highRiskOnly
      ? {
          riskScore:
            "HIGH",
        }
      : {}),

    $or: [
      {
        senderId: {
          $in:
            userIds,
        },
      },

      {
        receiverId: {
          $in:
            userIds,
        },
      },
    ],
  };

  const [
    senders,
    receivers,
  ] =
    await Promise.all([
      Transaction.distinct(
        "senderId",
        query
      ),

      Transaction.distinct(
        "receiverId",
        query
      ),
    ]);

  const allowed =
    new Set(
      userIds.map(
        (
          id
        ) =>
          id.toString()
      )
    );

  return uniqueIds(
    senders,
    receivers
  ).filter(
    (
      id
    ) =>
      allowed.has(
        id
      )
  );
}

/* =========================================================
   PERIOD SNAPSHOT
========================================================= */

async function getPeriodSnapshot(
  userIds:
    Types.ObjectId[],
  from:
    Date,
  to:
    Date
) {
  if (
    userIds.length ===
    0
  ) {
    return {
      activeUsers:
        0,

      transactionUsers:
        0,

      highRiskUsers:
        0,

      budgetUsers:
        0,

      cashFlowUsers:
        0,

      transactionCount:
        0,

      failedTransactionCount:
        0,
    };
  }

  const [
    activeSessionUsers,
    transactionUsers,
    highRiskUsers,
    budgetUsers,
    cashFlowUsers,
    transactionCount,
    failedTransactionCount,
  ] =
    await Promise.all([
      AuthSession.distinct(
        "userId",
        {
          userId: {
            $in:
              userIds,
          },

          lastActiveAt: {
            $gte:
              from,

            $lt:
              to,
          },
        }
      ),

      getTransactionUsers(
        userIds,
        from,
        to
      ),

      getTransactionUsers(
        userIds,
        from,
        to,
        true
      ),

      Budget.distinct(
        "userId",
        {
          userId: {
            $in:
              userIds,
          },

          createdAt: {
            $gte:
              from,

            $lt:
              to,
          },
        }
      ),

      CashFlowPlan.distinct(
        "userId",
        {
          userId: {
            $in:
              userIds,
          },

          createdAt: {
            $gte:
              from,

            $lt:
              to,
          },
        }
      ),

      Transaction.countDocuments({
        createdAt: {
          $gte:
            from,

          $lt:
            to,
        },

        $or: [
          {
            senderId: {
              $in:
                userIds,
            },
          },

          {
            receiverId: {
              $in:
                userIds,
            },
          },
        ],
      }),

      Transaction.countDocuments({
        createdAt: {
          $gte:
            from,

          $lt:
            to,
        },

        status:
          "FAILED",

        $or: [
          {
            senderId: {
              $in:
                userIds,
            },
          },

          {
            receiverId: {
              $in:
                userIds,
            },
          },
        ],
      }),
    ]);

  const allowed =
    new Set(
      userIds.map(
        (
          id
        ) =>
          id.toString()
      )
    );

  const validActiveUsers =
    activeSessionUsers.filter(
      (
        id
      ) =>
        allowed.has(
          id.toString()
        )
    );

  return {
    activeUsers:
      new Set(
        validActiveUsers.map(
          (
            id
          ) =>
            id.toString()
        )
      ).size,

    transactionUsers:
      transactionUsers.length,

    highRiskUsers:
      highRiskUsers.length,

    budgetUsers:
      new Set(
        budgetUsers.map(
          (
            id
          ) =>
            id.toString()
        )
      ).size,

    cashFlowUsers:
      new Set(
        cashFlowUsers.map(
          (
            id
          ) =>
            id.toString()
        )
      ).size,

    transactionCount,

    failedTransactionCount,
  };
}

/* =========================================================
   NEW USER TREND
========================================================= */

async function getNewUserTrend(
  boundary:
    RangeBoundary
): Promise<
  TrendRow[]
> {
  const rows =
    await User.aggregate<{
      _id:
        string;

      count:
        number;
    }>([
      {
        $match: {
          role:
            "user",

          accountStatus: {
            $ne:
              "deleted",
          },

          createdAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },
        },
      },

      {
        $project: {
          ...getBucketExpression(
            "$createdAt",
            boundary.bucket
          ),
        },
      },

      {
        $group: {
          _id:
            "$bucket",

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
    ]);

  return rows.map(
    (
      row
    ) => ({
      bucket:
        row._id,

      count:
        row.count,
    })
  );
}

/* =========================================================
   ACTIVE USER TREND
========================================================= */

async function getActiveUserTrend(
  userIds:
    Types.ObjectId[],
  boundary:
    RangeBoundary
): Promise<
  TrendRow[]
> {
  if (
    userIds.length ===
    0
  ) {
    return [];
  }

  const rows =
    await AuthSession.aggregate<{
      _id:
        string;

      users:
        unknown[];
    }>([
      {
        $match: {
          userId: {
            $in:
              userIds,
          },

          lastActiveAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },
        },
      },

      {
        $project: {
          userId:
            1,

          ...getBucketExpression(
            "$lastActiveAt",
            boundary.bucket
          ),
        },
      },

      {
        $group: {
          _id:
            "$bucket",

          users: {
            $addToSet:
              "$userId",
          },
        },
      },

      {
        $sort: {
          _id:
            1,
        },
      },
    ]);

  return rows.map(
    (
      row
    ) => ({
      bucket:
        row._id,

      count:
        Array.isArray(
          row.users
        )
          ? row.users.length
          : 0,
    })
  );
}

/* =========================================================
   TRANSACTION TREND
========================================================= */

async function getTransactionTrend(
  userIds:
    Types.ObjectId[],
  boundary:
    RangeBoundary
): Promise<
  Array<{
    bucket:
      string;

    transactionCount:
      number;

    failedCount:
      number;

    highRiskCount:
      number;
  }>
> {
  if (
    userIds.length ===
    0
  ) {
    return [];
  }

  const rows =
    await Transaction.aggregate<{
      _id:
        string;

      transactionCount:
        number;

      failedCount:
        number;

      highRiskCount:
        number;
    }>([
      {
        $match: {
          createdAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },

          $or: [
            {
              senderId: {
                $in:
                  userIds,
              },
            },

            {
              receiverId: {
                $in:
                  userIds,
              },
            },
          ],
        },
      },

      {
        $project: {
          status:
            1,

          riskScore:
            1,

          ...getBucketExpression(
            "$createdAt",
            boundary.bucket
          ),
        },
      },

      {
        $group: {
          _id:
            "$bucket",

          transactionCount: {
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
        },
      },

      {
        $sort: {
          _id:
            1,
        },
      },
    ]);

  return rows.map(
    (
      row
    ) => ({
      bucket:
        row._id,

      transactionCount:
        row.transactionCount,

      failedCount:
        row.failedCount,

      highRiskCount:
        row.highRiskCount,
    })
  );
}

/* =========================================================
   MERGE TREND
========================================================= */

async function getTrend(
  userIds:
    Types.ObjectId[],
  boundary:
    RangeBoundary
) {
  const [
    newUsers,
    activeUsers,
    transactionRows,
  ] =
    await Promise.all([
      getNewUserTrend(
        boundary
      ),

      getActiveUserTrend(
        userIds,
        boundary
      ),

      getTransactionTrend(
        userIds,
        boundary
      ),
    ]);

  const newUserMap =
    new Map(
      newUsers.map(
        (
          row
        ) => [
          row.bucket,
          row.count,
        ]
      )
    );

  const activeUserMap =
    new Map(
      activeUsers.map(
        (
          row
        ) => [
          row.bucket,
          row.count,
        ]
      )
    );

  const transactionMap =
    new Map(
      transactionRows.map(
        (
          row
        ) => [
          row.bucket,
          row,
        ]
      )
    );

  const bucketMs =
    boundary.bucket ===
    "hour"
      ? 60 *
        60 *
        1000
      : 24 *
        60 *
        60 *
        1000;

  return Array.from(
    {
      length:
        boundary.bucketCount,
    },

    (
      _,
      index
    ) => {
      const date =
        new Date(
          boundary.from.getTime() +
            index *
              bucketMs
        );

      const bucket =
        formatBucketKey(
          date,
          boundary.bucket
        );

      const transaction =
        transactionMap.get(
          bucket
        );

      return {
        bucket,

        newUsers:
          newUserMap.get(
            bucket
          ) ??
          0,

        activeUsers:
          activeUserMap.get(
            bucket
          ) ??
          0,

        transactionCount:
          transaction?.transactionCount ??
          0,

        failedTransactionCount:
          transaction?.failedCount ??
          0,

        highRiskTransactionCount:
          transaction?.highRiskCount ??
          0,
      };
    }
  );
}

/* =========================================================
   BREAKDOWNS
========================================================= */

async function getKycBreakdown(
  totalUsers:
    number
) {
  const rows =
    await User.aggregate<{
      _id:
        string;

      count:
        number;
    }>([
      {
        $match: {
          role:
            "user",

          accountStatus: {
            $ne:
              "deleted",
          },
        },
      },

      {
        $group: {
          _id: {
            $ifNull: [
              "$kycStatus",
              "not_started",
            ],
          },

          count: {
            $sum:
              1,
          },
        },
      },
    ]);

  return rows
    .map(
      (
        row
      ) => ({
        status:
          row._id,

        count:
          row.count,

        percentage:
          percentage(
            row.count,
            totalUsers
          ),
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        b.count -
        a.count
    );
}

async function getWalletBreakdown(
  userIds:
    Types.ObjectId[]
) {
  if (
    userIds.length ===
    0
  ) {
    return [];
  }

  const rows =
    await Wallet.aggregate<{
      _id:
        string;

      count:
        number;
    }>([
      {
        $match: {
          userId: {
            $in:
              userIds,
          },
        },
      },

      {
        $group: {
          _id: {
            $toLower: {
              $ifNull: [
                "$status",
                "unknown",
              ],
            },
          },

          count: {
            $sum:
              1,
          },
        },
      },
    ]);

  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        row.count,
      0
    );

  return rows
    .map(
      (
        row
      ) => ({
        status:
          row._id,

        count:
          row.count,

        percentage:
          percentage(
            row.count,
            total
          ),
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        b.count -
        a.count
    );
}

async function getRiskBreakdown(
  userIds:
    Types.ObjectId[],
  boundary:
    RangeBoundary
) {
  if (
    userIds.length ===
    0
  ) {
    return [];
  }

  const rows =
    await Transaction.aggregate<{
      _id:
        string;

      count:
        number;
    }>([
      {
        $match: {
          createdAt: {
            $gte:
              boundary.from,

            $lt:
              boundary.to,
          },

          $or: [
            {
              senderId: {
                $in:
                  userIds,
              },
            },

            {
              receiverId: {
                $in:
                  userIds,
              },
            },
          ],
        },
      },

      {
        $group: {
          _id: {
            $ifNull: [
              "$riskScore",
              "LOW",
            ],
          },

          count: {
            $sum:
              1,
          },
        },
      },
    ]);

  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        row.count,
      0
    );

  return rows
    .map(
      (
        row
      ) => ({
        risk:
          row._id,

        count:
          row.count,

        percentage:
          percentage(
            row.count,
            total
          ),
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        b.count -
        a.count
    );
}

/* =========================================================
   INSIGHTS
========================================================= */

function buildInsights({
  totalUsers,
  activeUsers,
  verifiedUsers,
  activeWallets,
  highRiskUsers,
  budgetUsers,
  cashFlowUsers,
}: {
  totalUsers:
    number;

  activeUsers:
    number;

  verifiedUsers:
    number;

  activeWallets:
    number;

  highRiskUsers:
    number;

  budgetUsers:
    number;

  cashFlowUsers:
    number;
}) {
  const activeRate =
    percentage(
      activeUsers,
      totalUsers
    );

  const kycCoverage =
    percentage(
      verifiedUsers,
      totalUsers
    );

  const walletCoverage =
    percentage(
      activeWallets,
      totalUsers
    );

  const budgetAdoption =
    percentage(
      budgetUsers,
      activeUsers
    );

  const cashFlowAdoption =
    percentage(
      cashFlowUsers,
      activeUsers
    );

  const insights: Array<{
    id:
      string;

    severity:
      | "critical"
      | "high"
      | "medium"
      | "info"
      | "positive";

    title:
      string;

    description:
      string;

    evidence:
      string;

    recommendedReview:
      string;
  }> = [];

  if (
    highRiskUsers >
    0
  ) {
    insights.push({
      id:
        "user-risk",

      severity:
        highRiskUsers >=
        5
          ? "high"
          : "medium",

      title:
        "High-risk wallet users detected",

      description:
        "One or more wallet users participated in transactions classified as HIGH risk during the selected period.",

      evidence:
        `${highRiskUsers} unique wallet users were connected to HIGH risk transactions.`,

      recommendedReview:
        "Review the Risk & Fraud workspace and related transactions before taking any operational action.",
    });
  }

  if (
    kycCoverage <
    60
  ) {
    insights.push({
      id:
        "kyc-coverage",

      severity:
        "medium",

      title:
        "User KYC coverage is limited",

      description:
        "A meaningful portion of wallet users are not currently KYC verified.",

      evidence:
        `${kycCoverage.toFixed(
          1
        )}% of current platform users are KYC verified.`,

      recommendedReview:
        "Review KYC funnel completion and identify where users stop before verification.",
    });
  } else {
    insights.push({
      id:
        "kyc-positive",

      severity:
        "positive",

      title:
        "Healthy KYC verification coverage",

      description:
        "Most current wallet users have completed identity verification.",

      evidence:
        `${kycCoverage.toFixed(
          1
        )}% KYC verification coverage.`,

      recommendedReview:
        "Continue monitoring pending and rejected verification segments.",
    });
  }

  if (
    activeRate <
    25 &&
    totalUsers >
    0
  ) {
    insights.push({
      id:
        "user-activity",

      severity:
        "medium",

      title:
        "User activity is relatively low",

      description:
        "Only a smaller portion of registered wallet users were active during the selected period.",

      evidence:
        `${activeRate.toFixed(
          1
        )}% of current users recorded authenticated session activity.`,

      recommendedReview:
        "Compare new-user activation, wallet usage and transaction participation across periods.",
    });
  }

  if (
    walletCoverage <
    90 &&
    totalUsers >
    0
  ) {
    insights.push({
      id:
        "wallet-coverage",

      severity:
        "info",

      title:
        "Not every user has an active wallet",

      description:
        "Some current platform users do not currently map to an active wallet record.",

      evidence:
        `${walletCoverage.toFixed(
          1
        )}% active-wallet coverage across current users.`,

      recommendedReview:
        "Review account provisioning and wallet activation flows.",
    });
  }

  insights.push({
    id:
      "feature-adoption",

    severity:
      "info",

    title:
      "Financial planning feature adoption",

    description:
      "Budgeting and cash-flow usage can indicate deeper wallet engagement beyond basic transfers.",

    evidence:
      `${budgetAdoption.toFixed(
        1
      )}% budget adoption and ${cashFlowAdoption.toFixed(
        1
      )}% cash-flow adoption among active users in the selected period.`,

    recommendedReview:
      "Track whether financially active users increasingly adopt budgeting and cash-flow tools.",
  });

  return insights;
}

/* =========================================================
   MAIN SERVICE
========================================================= */

export async function getAnalystUserAnalytics(
  range:
    AnalystUserRange
) {
  const boundary =
    getRangeBoundary(
      range
    );

  /* =======================================================
     CURRENT PLATFORM USERS ONLY

     Important:
     merchant / analyst / support / admin / super_admin
     are excluded.
  ======================================================= */

  const userIds =
    await User.find({
      role:
        "user",

      accountStatus: {
        $ne:
          "deleted",
      },
    }).distinct(
      "_id"
    ) as Types.ObjectId[];

  const totalUsers =
    userIds.length;

  /* =======================================================
     POPULATION
  ======================================================= */

  const [
    verifiedUsers,
    pendingKycUsers,
    rejectedKycUsers,
    notStartedKycUsers,
    activeWallets,
    totalWallets,
    newUsersCurrent,
    newUsersPrevious,
  ] =
    await Promise.all([
      User.countDocuments({
        role:
          "user",

        accountStatus: {
          $ne:
            "deleted",
        },

        kycStatus:
          "verified",
      }),

      User.countDocuments({
        role:
          "user",

        accountStatus: {
          $ne:
            "deleted",
        },

        kycStatus:
          "pending",
      }),

      User.countDocuments({
        role:
          "user",

        accountStatus: {
          $ne:
            "deleted",
        },

        kycStatus:
          "rejected",
      }),

      User.countDocuments({
        role:
          "user",

        accountStatus: {
          $ne:
            "deleted",
        },

        kycStatus:
          "not_started",
      }),

      userIds.length
        ? Wallet.countDocuments({
            userId: {
              $in:
                userIds,
            },

            status: {
              $in: [
                "active",
                "ACTIVE",
              ],
            },
          })
        : 0,

      userIds.length
        ? Wallet.countDocuments({
            userId: {
              $in:
                userIds,
            },
          })
        : 0,

      User.countDocuments({
        role:
          "user",

        accountStatus: {
          $ne:
            "deleted",
        },

        createdAt: {
          $gte:
            boundary.from,

          $lt:
            boundary.to,
        },
      }),

      User.countDocuments({
        role:
          "user",

        accountStatus: {
          $ne:
            "deleted",
        },

        createdAt: {
          $gte:
            boundary.previousFrom,

          $lt:
            boundary.previousTo,
        },
      }),
    ]);

  /* =======================================================
     PERIOD ACTIVITY
  ======================================================= */

  const [
    current,
    previous,
    trend,
    kycBreakdown,
    walletBreakdown,
    riskBreakdown,
  ] =
    await Promise.all([
      getPeriodSnapshot(
        userIds,
        boundary.from,
        boundary.to
      ),

      getPeriodSnapshot(
        userIds,
        boundary.previousFrom,
        boundary.previousTo
      ),

      getTrend(
        userIds,
        boundary
      ),

      getKycBreakdown(
        totalUsers
      ),

      getWalletBreakdown(
        userIds
      ),

      getRiskBreakdown(
        userIds,
        boundary
      ),
    ]);

  /* =======================================================
     STATUS
  ======================================================= */

  const failedRate =
    percentage(
      current.failedTransactionCount,
      current.transactionCount
    );

  const status:
    | "healthy"
    | "attention"
    | "critical" =
    current.highRiskUsers >=
      5 ||
    failedRate >=
      20
      ? "critical"
      : current.highRiskUsers >
            0 ||
          failedRate >=
            10
        ? "attention"
        : "healthy";

  /* =======================================================
     RESPONSE
  ======================================================= */

  return {
    generatedAt:
      new Date()
        .toISOString(),

    source: {
      users:
        "mongodb_user_collection",

      wallets:
        "mongodb_wallet_collection",

      transactions:
        "mongodb_transaction_collection",

      sessions:
        "mongodb_auth_session_collection",

      budgets:
        "mongodb_budget_collection",

      cashFlowPlans:
        "mongodb_cash_flow_plan_collection",
    },

    scopeNote:
      "Only Coffer platform users with role=user are included. Merchant owners, merchant customers, support agents, analysts and administrators are excluded.",

    privacyNote:
      "This analytics view uses aggregate operational metadata only. Encrypted contact details and encrypted transaction amounts are not decrypted.",

    status,

    filters: {
      range:
        boundary.range,

      bucket:
        boundary.bucket,

      from:
        boundary.from
          .toISOString(),

      to:
        boundary.to
          .toISOString(),

      previousFrom:
        boundary.previousFrom
          .toISOString(),

      previousTo:
        boundary.previousTo
          .toISOString(),
    },

    population: {
      totalUsers,

      totalWallets,

      activeWallets,

      verifiedUsers,

      pendingKycUsers,

      rejectedKycUsers,

      notStartedKycUsers,

      walletCoverage:
        percentage(
          totalWallets,
          totalUsers
        ),

      activeWalletCoverage:
        percentage(
          activeWallets,
          totalUsers
        ),

      kycVerificationCoverage:
        percentage(
          verifiedUsers,
          totalUsers
        ),
    },

    metrics: {
      newUsers:
        metric(
          newUsersCurrent,
          newUsersPrevious
        ),

      activeUsers:
        metric(
          current.activeUsers,
          previous.activeUsers
        ),

      transactionUsers:
        metric(
          current.transactionUsers,
          previous.transactionUsers
        ),

      highRiskUsers:
        metric(
          current.highRiskUsers,
          previous.highRiskUsers
        ),

      transactionCount:
        metric(
          current.transactionCount,
          previous.transactionCount
        ),

      failedTransactionCount:
        metric(
          current.failedTransactionCount,
          previous.failedTransactionCount
        ),

      budgetUsers:
        metric(
          current.budgetUsers,
          previous.budgetUsers
        ),

      cashFlowUsers:
        metric(
          current.cashFlowUsers,
          previous.cashFlowUsers
        ),
    },

    engagement: {
      activeRate:
        percentage(
          current.activeUsers,
          totalUsers
        ),

      transactionParticipationRate:
        percentage(
          current.transactionUsers,
          totalUsers
        ),

      budgetAdoptionRate:
        percentage(
          current.budgetUsers,
          current.activeUsers
        ),

      cashFlowAdoptionRate:
        percentage(
          current.cashFlowUsers,
          current.activeUsers
        ),

      failedTransactionRate:
        percentage(
          current.failedTransactionCount,
          current.transactionCount
        ),
    },

    trend,

    kycBreakdown,

    walletBreakdown,

    riskBreakdown,

    insights:
      buildInsights({
        totalUsers,

        activeUsers:
          current.activeUsers,

        verifiedUsers,

        activeWallets,

        highRiskUsers:
          current.highRiskUsers,

        budgetUsers:
          current.budgetUsers,

        cashFlowUsers:
          current.cashFlowUsers,
      }),
  };
}