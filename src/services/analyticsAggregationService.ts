import mongoose from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  User,
} from "../models/User.js";

import {
  RevenueEvent,
} from "../models/RevenueEvent.js";

import {
  decryptData,
} from "../utils/crypto.js";

import type {
  AnalyticsBreakdownItem,
  AnalyticsDashboardData,
  AnalyticsOverview,
  AnalyticsPulseMetric,
  AnalyticsRange,
  AnalyticsRiskCell,
  AnalyticsSeriesPoint,
  AnalyticsTrend,
} from "../types/analytics.js";

import {
  createAnalyticsBuckets,
  getAnalyticsDateWindow,
} from "./analyticsRangeService.js";

import {
  buildAnalyticsAlerts,
  buildAnalyticsInsights,
} from "./analyticsInsightService.js";

import {
  getCachedAnalytics,
  setCachedAnalytics,
} from "./analyticsCacheService.js";

/* =========================================================
   INTERNAL TYPES
========================================================= */

interface TransactionView {
  _id:
    unknown;

  senderId?:
    unknown;

  receiverId?:
    unknown;

  amount?:
    number;

  amountEncrypted?:
    unknown;

  type?:
    string;

  status?:
    string;

  riskScore?:
    string;

  failureReason?:
    string;

  failureCode?:
    string;

  region?:
    string;

  location?:
    string;

  metadata?:
    Record<
      string,
      unknown
    >;

  createdAt?:
    Date |
    string;
}

interface RevenueEventView {
  kind:
    string;

  feeMinor:
    number;

  volumeMinor?:
    number;

  occurredAt?:
    Date |
    string;
}

interface PeriodFacts {
  transactions:
    TransactionView[];

  revenueEvents:
    RevenueEventView[];

  activeUserIds:
    Set<string>;

  transactionVolume:
    number;

  transactionCount:
    number;

  failedCount:
    number;

  attempts:
    number;

  platformRevenue:
    number;

  highRiskExposure:
    number;

  highRiskCount:
    number;

  withdrawalVolume:
    number;

  refundOrReversalCount:
    number;

  merchantEventCount:
    number;
}

/* =========================================================
   HELPERS
========================================================= */

const clamp =
  (
    value:
      number,
    min:
      number,
    max:
      number
  ) =>
    Math.max(
      min,
      Math.min(
        max,
        value
      )
    );

const safeNumber =
  (
    value:
      unknown
  ):
    number => {
    const number =
      Number(
        value
      );

    return Number.isFinite(
      number
    )
      ? number
      : 0;
  };

const safeDate =
  (
    value:
      unknown
  ):
    Date |
    null => {
    const date =
      value instanceof
      Date
        ? value
        : new Date(
            String(
              value ??
                ""
            )
          );

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : date;
  };

const objectIdString =
  (
    value:
      unknown
  ):
    string => {
    if (
      value ===
      null ||
      value ===
      undefined
    ) {
      return "";
    }

    if (
      typeof value ===
      "string"
    ) {
      return value;
    }

    if (
      typeof value ===
      "object"
    ) {
      const object =
        value as {
          _id?:
            unknown;
          toString?:
            () => string;
        };

      if (
        object._id !==
        undefined
      ) {
        return objectIdString(
          object._id
        );
      }

      if (
        typeof object.toString ===
        "function"
      ) {
        const result =
          object.toString();

        if (
          result !==
          "[object Object]"
        ) {
          return result;
        }
      }
    }

    return String(
      value
    );
  };

const percent =
  (
    numerator:
      number,
    denominator:
      number
  ) => {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return (
      numerator /
      denominator
    ) *
      100;
  };

const percentChange =
  (
    current:
      number,
    previous:
      number
  ) => {
    if (
      previous <=
      0
    ) {
      return current >
        0
        ? 100
        : 0;
    }

    return (
      (
        current -
        previous
      ) /
      previous
    ) *
      100;
  };

const trendFromChange =
  (
    change:
      number
  ):
    AnalyticsTrend => {
    if (
      change >
      1
    ) {
      return "up";
    }

    if (
      change <
      -1
    ) {
      return "down";
    }

    return "flat";
  };

/*
 * Current project compatibility:
 *
 * 1. Legacy Transaction.amount is a numeric BDT amount.
 * 2. Newer secure transactions may use amountEncrypted.
 * 3. The secure architecture stores encrypted amounts as integer
 *    minor-unit strings. That is the default here.
 *
 * If your current amountEncrypted stores MAJOR units instead,
 * set:
 *
 * TRANSACTION_ENCRYPTED_AMOUNT_UNIT=major
 */
const transactionAmountMajor =
  (
    transaction:
      TransactionView
  ):
    number => {
    if (
      typeof transaction.amount ===
        "number" &&
      Number.isFinite(
        transaction.amount
      )
    ) {
      return Math.max(
        0,
        transaction.amount
      );
    }

    const encrypted =
      transaction.amountEncrypted;

    if (
      !encrypted ||
      typeof encrypted !==
        "object"
    ) {
      return 0;
    }

    const value =
      encrypted as {
        encrypted?:
          unknown;
        iv?:
          unknown;
        authTag?:
          unknown;
      };

    if (
      typeof value.encrypted !==
        "string" ||
      typeof value.iv !==
        "string" ||
      typeof value.authTag !==
        "string"
    ) {
      return 0;
    }

    try {
      const decrypted =
        decryptData({
          encrypted:
            value.encrypted,
          iv:
            value.iv,
          authTag:
            value.authTag,
        });

      const parsed =
        Number(
          decrypted
        );

      if (
        !Number.isFinite(
          parsed
        ) ||
        parsed <
          0
      ) {
        return 0;
      }

      return process.env
        .TRANSACTION_ENCRYPTED_AMOUNT_UNIT ===
        "major"
        ? parsed
        : parsed /
            100;
    } catch (
      error
    ) {
      console.error(
        "ANALYTICS TRANSACTION AMOUNT DECRYPT ERROR:",
        error
      );

      return 0;
    }
  };

const revenueFeeMajor =
  (
    event:
      RevenueEventView
  ) =>
    Math.max(
      0,
      safeNumber(
        event.feeMinor
      )
    ) /
    100;

const revenueVolumeMajor =
  (
    event:
      RevenueEventView
  ) =>
    Math.max(
      0,
      safeNumber(
        event.volumeMinor
      )
    ) /
    100;

const CAPTURED_REVENUE_KINDS =
  new Set([
    "TRANSFER_FEE",
    "WITHDRAWAL_FEE",
    "DEPOSIT_FEE",
    "SERVICE_FEE",
    "MERCHANT_FEE",
  ]);

const DISPUTE_REVENUE_KINDS =
  new Set([
    "REFUND",
    "GATEWAY_REVERSAL",
  ]);

const activeIdsFromTransactions =
  (
    transactions:
      TransactionView[]
  ) => {
    const ids =
      new Set<
        string
      >();

    for (
      const transaction of
      transactions
    ) {
      if (
        String(
          transaction.status ??
            ""
        ).toUpperCase() !==
        "COMPLETED"
      ) {
        continue;
      }

      const sender =
        objectIdString(
          transaction.senderId
        );

      const receiver =
        objectIdString(
          transaction.receiverId
        );

      if (
        sender
      ) {
        ids.add(
          sender
        );
      }

      if (
        receiver
      ) {
        ids.add(
          receiver
        );
      }
    }

    return ids;
  };

const summarizePeriod =
  (
    transactions:
      TransactionView[],
    revenueEvents:
      RevenueEventView[]
  ):
    PeriodFacts => {
    let transactionVolume =
      0;

    let transactionCount =
      0;

    let failedCount =
      0;

    let attempts =
      0;

    let highRiskExposure =
      0;

    let highRiskCount =
      0;

    let withdrawalVolume =
      0;

    for (
      const transaction of
      transactions
    ) {
      const status =
        String(
          transaction.status ??
            ""
        ).toUpperCase();

      const type =
        String(
          transaction.type ??
            ""
        ).toUpperCase();

      const risk =
        String(
          transaction.riskScore ??
            "LOW"
        ).toUpperCase();

      const amount =
        transactionAmountMajor(
          transaction
        );

      attempts +=
        1;

      if (
        status ===
        "FAILED"
      ) {
        failedCount +=
          1;
      }

      if (
        status ===
        "COMPLETED"
      ) {
        transactionCount +=
          1;

        transactionVolume +=
          amount;

        if (
          type ===
          "WITHDRAW"
        ) {
          withdrawalVolume +=
            amount;
        }
      }

      if (
        status !==
          "FAILED" &&
        (
          risk ===
            "HIGH" ||
          risk ===
            "CRITICAL"
        )
      ) {
        highRiskExposure +=
          amount;

        highRiskCount +=
          1;
      }
    }

    let platformRevenue =
      0;

    let refundOrReversalCount =
      0;

    let merchantEventCount =
      0;

    for (
      const event of
      revenueEvents
    ) {
      const kind =
        String(
          event.kind ??
            ""
        ).toUpperCase();

      if (
        CAPTURED_REVENUE_KINDS.has(
          kind
        )
      ) {
        platformRevenue +=
          revenueFeeMajor(
            event
          );
      }

      if (
        DISPUTE_REVENUE_KINDS.has(
          kind
        )
      ) {
        refundOrReversalCount +=
          1;
      }

      if (
        kind ===
        "MERCHANT_FEE"
      ) {
        merchantEventCount +=
          1;
      }
    }

    return {
      transactions,
      revenueEvents,
      activeUserIds:
        activeIdsFromTransactions(
          transactions
        ),
      transactionVolume,
      transactionCount,
      failedCount,
      attempts,
      platformRevenue,
      highRiskExposure,
      highRiskCount,
      withdrawalVolume,
      refundOrReversalCount,
      merchantEventCount,
    };
  };

/* =========================================================
   DATA LOADERS
========================================================= */

const loadTransactions =
  async (
    start:
      Date,
    end:
      Date
  ):
    Promise<
      TransactionView[]
    > => {
    const rows =
      await Transaction.find({
        createdAt: {
          $gte:
            start,
          $lt:
            end,
        },
      })
        .select(
          [
            "senderId",
            "receiverId",
            "amount",
            "amountEncrypted",
            "type",
            "status",
            "riskScore",
            "failureReason",
            "failureCode",
            "region",
            "location",
            "metadata",
            "createdAt",
          ].join(
            " "
          )
        )
        .lean();

    return rows as
      unknown as
      TransactionView[];
  };

const loadRevenueEvents =
  async (
    start:
      Date,
    end:
      Date
  ):
    Promise<
      RevenueEventView[]
    > => {
    const rows =
      await RevenueEvent.find({
        occurredAt: {
          $gte:
            start,
          $lt:
            end,
        },
      })
        .select(
          [
            "kind",
            "feeMinor",
            "volumeMinor",
            "occurredAt",
          ].join(
            " "
          )
        )
        .lean();

    return rows as
      unknown as
      RevenueEventView[];
  };

const getWalletBalance =
  async () => {
    try {
      const rows =
        await mongoose.connection
          .collection(
            "wallets"
          )
          .aggregate<{
            _id:
              null;
            total:
              number;
          }>([
            {
              $match: {
                balance: {
                  $type:
                    "number",
                },
              },
            },
            {
              $group: {
                _id:
                  null,
                total: {
                  $sum:
                    "$balance",
                },
              },
            },
          ])
          .toArray();

      return Math.max(
        0,
        safeNumber(
          rows[
            0
          ]?.total
        )
      );
    } catch (
      error
    ) {
      console.error(
        "ANALYTICS WALLET BALANCE AGGREGATION ERROR:",
        error
      );

      return 0;
    }
  };

const getKycMetrics =
  async () => {
    const [
      eligible,
      verified,
    ] =
      await Promise.all([
        User.countDocuments({
          role:
            "user",
          accountStatus:
            "active",
        }),

        User.countDocuments({
          role:
            "user",
          accountStatus:
            "active",
          kycStatus:
            "verified",
        }),
      ]);

    return {
      eligible,
      verified,
      completion:
        percent(
          verified,
          eligible
        ),
    };
  };

/* =========================================================
   OVERVIEW
========================================================= */

const buildOverview =
  ({
    facts,
    previousFacts,
    walletBalance,
    kycCompletion,
  }: {
    facts:
      PeriodFacts;
    previousFacts:
      PeriodFacts;
    walletBalance:
      number;
    kycCompletion:
      number;
  }):
    AnalyticsOverview => {
    const retained =
      Array.from(
        previousFacts.activeUserIds
      ).filter(
        (
          id
        ) =>
          facts.activeUserIds.has(
            id
          )
      ).length;

    const totalForMerchantShare =
      facts.transactionCount +
      facts.merchantEventCount;

    return {
      transactionVolume:
        Number(
          facts.transactionVolume.toFixed(
            2
          )
        ),

      transactionCount:
        facts.transactionCount,

      activeUsers:
        facts.activeUserIds.size,

      walletBalance:
        Number(
          walletBalance.toFixed(
            2
          )
        ),

      kycCompletion:
        Number(
          kycCompletion.toFixed(
            2
          )
        ),

      platformRevenue:
        Number(
          facts.platformRevenue.toFixed(
            2
          )
        ),

      failedRate:
        Number(
          percent(
            facts.failedCount,
            facts.attempts
          ).toFixed(
            2
          )
        ),

      highRiskExposure:
        Number(
          facts.highRiskExposure.toFixed(
            2
          )
        ),

      avgTransactionValue:
        Number(
          (
            facts.transactionCount >
            0
              ? facts.transactionVolume /
                facts.transactionCount
              : 0
          ).toFixed(
            2
          )
        ),

      merchantShare:
        Number(
          percent(
            facts.merchantEventCount,
            totalForMerchantShare
          ).toFixed(
            2
          )
        ),

      retentionRate:
        Number(
          percent(
            retained,
            previousFacts.activeUserIds.size
          ).toFixed(
            2
          )
        ),

      disputeRate:
        Number(
          percent(
            facts.refundOrReversalCount,
            facts.transactionCount
          ).toFixed(
            2
          )
        ),
    };
  };

/* =========================================================
   PULSE
========================================================= */

const scoreTrend =
  (
    current:
      number,
    previous:
      number
  ):
    AnalyticsTrend =>
    trendFromChange(
      current -
      previous
    );

const buildPulse =
  ({
    current,
    previous,
    facts,
    previousFacts,
  }: {
    current:
      AnalyticsOverview;
    previous:
      AnalyticsOverview;
    facts:
      PeriodFacts;
    previousFacts:
      PeriodFacts;
  }):
    AnalyticsPulseMetric[] => {
    const volumeGrowth =
      percentChange(
        current.transactionVolume,
        previous.transactionVolume
      );

    const revenueGrowth =
      percentChange(
        current.platformRevenue,
        previous.platformRevenue
      );

    const activeGrowth =
      percentChange(
        current.activeUsers,
        previous.activeUsers
      );

    const growthScore =
      clamp(
        78 +
          volumeGrowth *
            0.18 +
          revenueGrowth *
            0.16 +
          activeGrowth *
            0.12,
        55,
        99
      );

    const cashOutPressure =
      facts.withdrawalVolume >
      0
        ? current.walletBalance /
          facts.withdrawalVolume
        : 10;

    const previousCashOutPressure =
      previousFacts.withdrawalVolume >
      0
        ? current.walletBalance /
          previousFacts.withdrawalVolume
        : 10;

    const liquidityScore =
      clamp(
        70 +
          Math.min(
            25,
            cashOutPressure *
              4
          ),
        55,
        99
      );

    const previousLiquidityScore =
      clamp(
        70 +
          Math.min(
            25,
            previousCashOutPressure *
              4
          ),
        55,
        99
      );

    const successRate =
      100 -
      current.failedRate;

    const previousSuccessRate =
      100 -
      previous.failedRate;

    const transactionScore =
      clamp(
        successRate -
          1,
        55,
        99
      );

    const previousTransactionScore =
      clamp(
        previousSuccessRate -
          1,
        55,
        99
      );

    const highRiskRatio =
      percent(
        facts.highRiskCount,
        Math.max(
          1,
          facts.attempts
        )
      );

    const previousHighRiskRatio =
      percent(
        previousFacts.highRiskCount,
        Math.max(
          1,
          previousFacts.attempts
        )
      );

    const securityScore =
      clamp(
        98 -
          current.failedRate *
            2 -
          highRiskRatio *
            1.7,
        50,
        99
      );

    const previousSecurityScore =
      clamp(
        98 -
          previous.failedRate *
            2 -
          previousHighRiskRatio *
            1.7,
        50,
        99
      );

    const riskScore =
      clamp(
        96 -
          highRiskRatio *
            3 -
          current.disputeRate *
            2,
        45,
        99
      );

    const previousRiskScore =
      clamp(
        96 -
          previousHighRiskRatio *
            3 -
          previous.disputeRate *
            2,
        45,
        99
      );

    return [
      {
        id:
          "growth",
        label:
          "Growth",
        score:
          Math.round(
            growthScore
          ),
        trend:
          trendFromChange(
            volumeGrowth +
              revenueGrowth +
              activeGrowth
          ),
      },

      {
        id:
          "liquidity",
        label:
          "Liquidity",
        score:
          Math.round(
            liquidityScore
          ),
        trend:
          scoreTrend(
            liquidityScore,
            previousLiquidityScore
          ),
      },

      {
        id:
          "tx",
        label:
          "Transactions",
        score:
          Math.round(
            transactionScore
          ),
        trend:
          scoreTrend(
            transactionScore,
            previousTransactionScore
          ),
      },

      {
        id:
          "security",
        label:
          "Security",
        score:
          Math.round(
            securityScore
          ),
        trend:
          scoreTrend(
            securityScore,
            previousSecurityScore
          ),
      },

      {
        id:
          "risk",
        label:
          "Risk",
        score:
          Math.round(
            riskScore
          ),
        trend:
          scoreTrend(
            riskScore,
            previousRiskScore
          ),
      },
    ];
  };

/* =========================================================
   SERIES
========================================================= */

const buildSeries =
  ({
    range,
    start,
    end,
    transactions,
    revenueEvents,
  }: {
    range:
      AnalyticsRange;
    start:
      Date;
    end:
      Date;
    transactions:
      TransactionView[];
    revenueEvents:
      RevenueEventView[];
  }):
    AnalyticsSeriesPoint[] => {
    const buckets =
      createAnalyticsBuckets(
        range,
        start,
        end,
        7
      );

    return buckets.map(
      (
        bucket
      ) => {
        let volume =
          0;

        let attempts =
          0;

        let failures =
          0;

        let revenue =
          0;

        for (
          const transaction of
          transactions
        ) {
          const createdAt =
            safeDate(
              transaction.createdAt
            );

          if (
            !createdAt ||
            createdAt <
              bucket.start ||
            createdAt >=
              bucket.end
          ) {
            continue;
          }

          attempts +=
            1;

          const status =
            String(
              transaction.status ??
                ""
            ).toUpperCase();

          if (
            status ===
            "FAILED"
          ) {
            failures +=
              1;
          }

          if (
            status ===
            "COMPLETED"
          ) {
            volume +=
              transactionAmountMajor(
                transaction
              );
          }
        }

        for (
          const event of
          revenueEvents
        ) {
          const occurredAt =
            safeDate(
              event.occurredAt
            );

          if (
            !occurredAt ||
            occurredAt <
              bucket.start ||
            occurredAt >=
              bucket.end
          ) {
            continue;
          }

          const kind =
            String(
              event.kind ??
                ""
            ).toUpperCase();

          if (
            CAPTURED_REVENUE_KINDS.has(
              kind
            )
          ) {
            revenue +=
              revenueFeeMajor(
                event
              );
          }
        }

        return {
          label:
            bucket.label,

          /*
           * Frontend chart displays these values as millions.
           */
          volume:
            Number(
              (
                volume /
                1_000_000
              ).toFixed(
                4
              )
            ),

          revenue:
            Number(
              (
                revenue /
                1_000_000
              ).toFixed(
                4
              )
            ),

          failures:
            Number(
              percent(
                failures,
                attempts
              ).toFixed(
                2
              )
            ),
        };
      }
    );
  };

/* =========================================================
   CHANNELS
========================================================= */

const buildChannels =
  (
    facts:
      PeriodFacts
  ):
    AnalyticsBreakdownItem[] => {
    const completed =
      facts.transactions.filter(
        (
          transaction
        ) =>
          String(
            transaction.status ??
              ""
          ).toUpperCase() ===
          "COMPLETED"
      );

    const transferCount =
      completed.filter(
        (
          transaction
        ) =>
          String(
            transaction.type ??
              ""
          ).toUpperCase() ===
          "TRANSFER"
      ).length;

    const cashInCount =
      completed.filter(
        (
          transaction
        ) =>
          String(
            transaction.type ??
              ""
          ).toUpperCase() ===
          "DEPOSIT"
      ).length;

    const cashOutCount =
      completed.filter(
        (
          transaction
        ) =>
          String(
            transaction.type ??
              ""
          ).toUpperCase() ===
          "WITHDRAW"
      ).length;

    const merchantCount =
      facts.merchantEventCount;

    const total =
      transferCount +
      cashInCount +
      cashOutCount +
      merchantCount;

    const share =
      (
        count:
          number
      ) =>
        Number(
          percent(
            count,
            total
          ).toFixed(
            1
          )
        );

    return [
      {
        label:
          "P2P Transfer",
        value:
          share(
            transferCount
          ),
        helper:
          `${transferCount.toLocaleString()} txns`,
        tone:
          "blue",
      },

      {
        label:
          "Merchant Pay",
        value:
          share(
            merchantCount
          ),
        helper:
          `${merchantCount.toLocaleString()} revenue events`,
        tone:
          "violet",
      },

      {
        label:
          "Cash In",
        value:
          share(
            cashInCount
          ),
        helper:
          `${cashInCount.toLocaleString()} txns`,
        tone:
          "emerald",
      },

      {
        label:
          "Cash Out",
        value:
          share(
            cashOutCount
          ),
        helper:
          `${cashOutCount.toLocaleString()} txns`,
        tone:
          "amber",
      },
    ];
  };

/* =========================================================
   FAILURES
========================================================= */

const failureBucket =
  (
    transaction:
      TransactionView
  ):
    | "gateway"
    | "funds"
    | "risk"
    | "bank"
    | "other" => {
    const source =
      [
        transaction.failureReason,
        transaction.failureCode,
        transaction.metadata
          ?.failureReason,
        transaction.metadata
          ?.failureCode,
      ]
        .filter(
          (
            value
          ) =>
            typeof value ===
            "string"
        )
        .join(
          " "
        )
        .toLowerCase();

    if (
      /gateway|timeout|settlement/.test(
        source
      )
    ) {
      return "gateway";
    }

    if (
      /insufficient|balance|fund/.test(
        source
      )
    ) {
      return "funds";
    }

    if (
      /risk|fraud|blocked|security/.test(
        source
      )
    ) {
      return "risk";
    }

    if (
      /bank|issuer|declin|reject/.test(
        source
      )
    ) {
      return "bank";
    }

    return "other";
  };

const buildFailureReasons =
  (
    transactions:
      TransactionView[]
  ) => {
    const counts = {
      gateway:
        0,
      funds:
        0,
      risk:
        0,
      bank:
        0,
      other:
        0,
    };

    for (
      const transaction of
      transactions
    ) {
      if (
        String(
          transaction.status ??
            ""
        ).toUpperCase() !==
        "FAILED"
      ) {
        continue;
      }

      counts[
        failureBucket(
          transaction
        )
      ] +=
        1;
    }

    const failed =
      Object.values(
        counts
      ).reduce(
        (
          total,
          value
        ) =>
          total +
          value,
        0
      );

    const item =
      (
        label:
          string,
        count:
          number,
        tone:
          AnalyticsBreakdownItem["tone"]
      ):
        AnalyticsBreakdownItem => ({
        label,
        value:
          Number(
            percent(
              count,
              failed
            ).toFixed(
              1
            )
          ),
        helper:
          `${count.toLocaleString()} events`,
        tone,
      });

    return {
      rows: [
        item(
          "Gateway timeout",
          counts.gateway,
          "rose"
        ),
        item(
          "Insufficient funds",
          counts.funds,
          "amber"
        ),
        item(
          "Risk blocked",
          counts.risk,
          "violet"
        ),
        item(
          "Bank rejection",
          counts.bank,
          "blue"
        ),
        item(
          "Other",
          counts.other,
          "slate"
        ),
      ],

      gatewayCount:
        counts.gateway,

      failedCount:
        failed,
    };
  };

/* =========================================================
   RISK MATRIX
========================================================= */

const buildRiskMatrix =
  (
    transactions:
      TransactionView[]
  ):
    AnalyticsRiskCell[] => {
    const groups = {
      low: {
        count:
          0,
        amount:
          0,
      },
      monitored: {
        count:
          0,
        amount:
          0,
      },
      high: {
        count:
          0,
        amount:
          0,
      },
      critical: {
        count:
          0,
        amount:
          0,
      },
    };

    for (
      const transaction of
      transactions
    ) {
      if (
        String(
          transaction.status ??
            ""
        ).toUpperCase() ===
        "FAILED"
      ) {
        continue;
      }

      const risk =
        String(
          transaction.riskScore ??
            "LOW"
        ).toUpperCase();

      const amount =
        transactionAmountMajor(
          transaction
        );

      const key =
        risk ===
        "CRITICAL"
          ? "critical"
          : risk ===
            "HIGH"
            ? "high"
            : risk ===
              "MEDIUM"
              ? "monitored"
              : "low";

      groups[
        key
      ].count +=
        1;

      groups[
        key
      ].amount +=
        amount;
    }

    return [
      {
        label:
          "Low Risk",
        count:
          groups.low.count,
        amount:
          Number(
            groups.low.amount.toFixed(
              2
            )
          ),
        severity:
          "Low",
      },

      {
        label:
          "Monitored",
        count:
          groups.monitored.count,
        amount:
          Number(
            groups.monitored.amount.toFixed(
              2
            )
          ),
        severity:
          "Moderate",
      },

      {
        label:
          "High Risk",
        count:
          groups.high.count,
        amount:
          Number(
            groups.high.amount.toFixed(
              2
            )
          ),
        severity:
          "High",
      },

      {
        label:
          "Critical",
        count:
          groups.critical.count,
        amount:
          Number(
            groups.critical.amount.toFixed(
              2
            )
          ),
        severity:
          "Critical",
      },
    ];
  };

/* =========================================================
   GEOGRAPHY
========================================================= */

const transactionRegion =
  (
    transaction:
      TransactionView
  ) => {
    const candidates =
      [
        transaction.region,
        transaction.location,
        transaction.metadata
          ?.region,
        transaction.metadata
          ?.location,
      ];

    for (
      const candidate of
      candidates
    ) {
      if (
        typeof candidate ===
          "string" &&
        candidate.trim()
      ) {
        return candidate
          .trim()
          .slice(
            0,
            80
          );
      }
    }

    return "Unspecified";
  };

const buildGeography =
  (
    transactions:
      TransactionView[]
  ):
    AnalyticsBreakdownItem[] => {
    const map =
      new Map<
        string,
        {
          count:
            number;
          volume:
            number;
        }
      >();

    for (
      const transaction of
      transactions
    ) {
      if (
        String(
          transaction.status ??
            ""
        ).toUpperCase() !==
        "COMPLETED"
      ) {
        continue;
      }

      const region =
        transactionRegion(
          transaction
        );

      const current =
        map.get(
          region
        ) ?? {
          count:
            0,
          volume:
            0,
        };

      current.count +=
        1;

      current.volume +=
        transactionAmountMajor(
          transaction
        );

      map.set(
        region,
        current
      );
    }

    const totalVolume =
      Array.from(
        map.values()
      ).reduce(
        (
          total,
          item
        ) =>
          total +
          item.volume,
        0
      );

    const tones:
      AnalyticsBreakdownItem["tone"][] = [
      "blue",
      "cyan",
      "violet",
      "emerald",
      "slate",
    ];

    return Array.from(
      map.entries()
    )
      .sort(
        (
          a,
          b
        ) =>
          b[
            1
          ].volume -
          a[
            1
          ].volume
      )
      .slice(
        0,
        5
      )
      .map(
        (
          [
            region,
            item,
          ],
          index
        ) => ({
          label:
            region,

          value:
            Number(
              percent(
                item.volume,
                totalVolume
              ).toFixed(
                1
              )
            ),

          helper:
            `৳${item.volume.toLocaleString(
              undefined,
              {
                maximumFractionDigits:
                  0,
              }
            )}`,

          tone:
            tones[
              index
            ] ??
            "slate",
        })
      );
  };

/* =========================================================
   MAIN AGGREGATION
========================================================= */

export const getAnalyticsDashboard =
  async ({
    range,
    forceFresh =
      false,
  }: {
    range:
      AnalyticsRange;
    forceFresh?:
      boolean;
  }):
    Promise<
      AnalyticsDashboardData
    > => {
    if (
      !forceFresh
    ) {
      const cached =
        getCachedAnalytics(
          range
        );

      if (
        cached
      ) {
        return cached;
      }
    }

    const window =
      getAnalyticsDateWindow(
        range
      );

    const [
      currentTransactions,
      previousTransactions,
      currentRevenueEvents,
      previousRevenueEvents,
      walletBalance,
      kycMetrics,
    ] =
      await Promise.all([
        loadTransactions(
          window.start,
          window.end
        ),

        loadTransactions(
          window.previousStart,
          window.previousEnd
        ),

        loadRevenueEvents(
          window.start,
          window.end
        ),

        loadRevenueEvents(
          window.previousStart,
          window.previousEnd
        ),

        getWalletBalance(),

        getKycMetrics(),
      ]);

    const facts =
      summarizePeriod(
        currentTransactions,
        currentRevenueEvents
      );

    const previousFacts =
      summarizePeriod(
        previousTransactions,
        previousRevenueEvents
      );

    const overview =
      buildOverview({
        facts,
        previousFacts,
        walletBalance,
        kycCompletion:
          kycMetrics.completion,
      });

    const previousOverview =
      buildOverview({
        facts:
          previousFacts,

        /*
         * A second historical predecessor is not needed for
         * the previous overview fields used by current insights.
         * Passing itself keeps retention bounded and avoids an
         * extra MongoDB window scan.
         */
        previousFacts,

        walletBalance,
        kycCompletion:
          kycMetrics.completion,
      });

    const failure =
      buildFailureReasons(
        currentTransactions
      );

    const dashboard:
      AnalyticsDashboardData = {
      range,

      generatedAt:
        new Date()
          .toISOString(),

      overview,

      pulse:
        buildPulse({
          current:
            overview,
          previous:
            previousOverview,
          facts,
          previousFacts,
        }),

      series:
        buildSeries({
          range,
          start:
            window.start,
          end:
            window.end,
          transactions:
            currentTransactions,
          revenueEvents:
            currentRevenueEvents,
        }),

      channels:
        buildChannels(
          facts
        ),

      failureReasons:
        failure.rows,

      geography:
        buildGeography(
          currentTransactions
        ),

      riskMatrix:
        buildRiskMatrix(
          currentTransactions
        ),

      alerts:
        buildAnalyticsAlerts({
          overview,
          failedTransactions:
            failure.failedCount,
          failureGatewayCount:
            failure.gatewayCount,
        }),

      insights:
        buildAnalyticsInsights({
          current:
            overview,
          previous:
            previousOverview,
        }),
    };

    setCachedAnalytics(
      range,
      dashboard
    );

    return dashboard;
  };
