import mongoose, {
  Types,
} from "mongoose";

import {
  decryptData,
  type EncryptedData,
} from "../utils/crypto.js";

import type {
  AdminOverviewResponse,
  AttentionQueueItem,
  OverviewMetric,
  OverviewRange,
  OverviewSeriesPoint,
  OverviewTransaction,
  ServiceHealthItem,
  TransactionStatusBreakdown,
} from "../types/adminOverview.js";

/* =========================================================
   TYPES
========================================================= */

type AnyDoc = Record<string, any>;

interface CacheEntry {
  expiresAt: number;
  value: AdminOverviewResponse;
}

interface DecryptedTransaction {
  id: string;
  senderId: string;
  receiverId: string;
  senderName: string;
  receiverName: string;
  amount: number;
  currency: string;
  status: TransactionStatusBreakdown["status"];
  createdAt: string;
  reference?: string;
}

/* =========================================================
   CACHE
========================================================= */

/*
 * Keep this very short so the admin dashboard feels live.
 *
 * 5 seconds:
 * - avoids repeated heavy DB work on every render
 * - new transactions appear quickly
 */
const CACHE_TTL_MS = 5_000;

const cache =
  new Map<
    OverviewRange,
    CacheEntry
  >();

/* =========================================================
   RANGE
========================================================= */

const RANGE_DAYS: Record<
  OverviewRange,
  number
> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/* =========================================================
   MAIN
========================================================= */

export async function getAdminOverview(
  range: OverviewRange
): Promise<AdminOverviewResponse> {
  const cached =
    cache.get(range);

  if (
    cached &&
    cached.expiresAt >
      Date.now()
  ) {
    return cached.value;
  }

  const db =
    mongoose.connection.db;

  if (!db) {
    throw new Error(
      "MongoDB is not connected."
    );
  }

  const days =
    RANGE_DAYS[range];

  const end =
    new Date();

  const start =
    startOfUtcDay(
      new Date(
        end.getTime() -
          (days - 1) *
            DAY_MS
      )
    );

  const previousStart =
    new Date(
      start.getTime() -
        days * DAY_MS
    );

  /* =======================================================
     COLLECTIONS
  ======================================================= */

  const users =
    db.collection("users");

  const wallets =
    db.collection("wallets");

  const transactions =
    db.collection(
      "transactions"
    );

  const kycs =
    db.collection("kycs");

  const revenueEvents =
    db.collection(
      "revenueevents"
    );

  const securityEvents =
    db.collection(
      "securityevents"
    );

  const supportTickets =
    db.collection(
      "supporttickets"
    );

  const systemLogs =
    db.collection(
      "systemlogs"
    );

  /* =======================================================
     PARALLEL NON-TRANSACTION QUERIES
  ======================================================= */

  const [
    totalUsers,
    previousUsers,
    activeWallets,
    previousActiveWallets,
    revenueTotals,
    revenueSeries,
    pendingKyc,
    previousPendingKyc,
    riskAlerts,
    previousRiskAlerts,
    openSupport,
    failedTransactions,
    healthRows,
  ] = await Promise.all([
    /* Users */
    users.countDocuments({
      accountStatus: {
        $ne: "deleted",
      },

      deletedAt: null,
    }),

    users.countDocuments({
      createdAt: {
        $lt: start,
      },

      accountStatus: {
        $ne: "deleted",
      },

      deletedAt: null,
    }),

    /* Active wallets */
    wallets.countDocuments({
      status: {
        $in: [
          "active",
          "ACTIVE",
        ],
      },
    }),

    wallets.countDocuments({
      createdAt: {
        $lt: start,
      },

      status: {
        $in: [
          "active",
          "ACTIVE",
        ],
      },
    }),

    /* Revenue */
    periodMoneyTotals(
      revenueEvents,
      start,
      end,
      previousStart,
      [
        "completed",
        "success",
        "posted",
        "SUCCESS",
        "COMPLETED",
      ]
    ),

    dailyMoneySeries(
      revenueEvents,
      start,
      end,
      false
    ),

    /* KYC */
    kycs.countDocuments({
      status: {
        $in: [
          "pending",
          "under_review",
          "submitted",
        ],
      },
    }),

    kycs.countDocuments({
      createdAt: {
        $lt: start,
      },

      status: {
        $in: [
          "pending",
          "under_review",
          "submitted",
        ],
      },
    }),

    /* Risk */
    securityEvents.countDocuments({
      severity: {
        $in: [
          "high",
          "critical",
          "HIGH",
          "CRITICAL",
        ],
      },

      $or: [
        {
          resolvedAt: null,
        },
        {
          resolvedAt: {
            $exists: false,
          },
        },
      ],
    }),

    securityEvents.countDocuments({
      createdAt: {
        $lt: start,
      },

      severity: {
        $in: [
          "high",
          "critical",
          "HIGH",
          "CRITICAL",
        ],
      },

      $or: [
        {
          resolvedAt: null,
        },
        {
          resolvedAt: {
            $exists: false,
          },
        },
      ],
    }),

    /* Support */
    supportTickets.countDocuments({
      status: {
        $in: [
          "open",
          "pending",
          "in_progress",
          "overdue",
        ],
      },
    }),

    /* Failed transactions */
    transactions.countDocuments({
      createdAt: {
        $gte: start,
        $lte: end,
      },

      status: {
        $in: [
          "failed",
          "FAILED",
        ],
      },
    }),

    /* System logs */
    systemLogs
      .find({
        createdAt: {
          $gte: start,
          $lte: end,
        },
      })
      .sort({
        createdAt: -1,
      })
      .limit(500)
      .project({
        service: 1,
        source: 1,
        module: 1,
        level: 1,
        severity: 1,
        latencyMs: 1,
        durationMs: 1,
        createdAt: 1,
      })
      .toArray(),
  ]);

  /* =======================================================
     TRANSACTIONS
     
     IMPORTANT:
     Transaction.amountEncrypted is encrypted.
     Therefore MongoDB cannot $sum the actual amount.
     
     We load the relevant transactions and decrypt their
     amounts in the backend.
  ======================================================= */

  const transactionRows =
    await transactions
      .find({
        createdAt: {
          $gte: previousStart,
          $lte: end,
        },
      })
      .sort({
        createdAt: -1,
      })
      .project({
        senderId: 1,
        receiverId: 1,
        amountEncrypted: 1,
        referenceEncrypted: 1,
        currency: 1,
        type: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .toArray();

  /* =======================================================
     USER NAME LOOKUP
  ======================================================= */

  const userIds =
    new Set<string>();

  for (
    const row of transactionRows
  ) {
    const senderId =
      getObjectIdString(
        row.senderId
      );

    const receiverId =
      getObjectIdString(
        row.receiverId
      );

    if (senderId) {
      userIds.add(
        senderId
      );
    }

    if (receiverId) {
      userIds.add(
        receiverId
      );
    }
  }

  const userObjectIds =
    [...userIds]
      .filter((id) =>
        Types.ObjectId.isValid(
          id
        )
      )
      .map(
        (id) =>
          new Types.ObjectId(
            id
          )
      );

  const userRows =
    userObjectIds.length
      ? await users
          .find({
            _id: {
              $in:
                userObjectIds,
            },
          })
          .project({
            name: 1,
          })
          .toArray()
      : [];

  const userNameMap =
    new Map<
      string,
      string
    >();

  for (
    const user of userRows
  ) {
    userNameMap.set(
      String(
        user._id
      ),
      stringValue(
        user.name,
        "User"
      )
    );
  }

  /* =======================================================
     DECRYPT TRANSACTIONS
  ======================================================= */

  const decryptedTransactions: DecryptedTransaction[] =
    [];

  for (
    const row of transactionRows
  ) {
    const decrypted =
      decryptTransaction(
        row,
        userNameMap
      );

    if (decrypted) {
      decryptedTransactions.push(
        decrypted
      );
    }
  }

  /* =======================================================
     CURRENT / PREVIOUS TRANSACTION VOLUME
  ======================================================= */

  let currentTransactionVolume =
    0;

  let previousTransactionVolume =
    0;

  for (
    const transaction of
      decryptedTransactions
  ) {
    const timestamp =
      new Date(
        transaction.createdAt
      ).getTime();

    if (
      timestamp >=
      start.getTime()
    ) {
      currentTransactionVolume +=
        transaction.amount;
    } else {
      previousTransactionVolume +=
        transaction.amount;
    }
  }

  /* =======================================================
     TRANSACTION DAILY SERIES
  ======================================================= */

  const transactionSeries =
    buildTransactionSeries(
      start,
      days,
      decryptedTransactions
    );

  /* =======================================================
     STATUS BREAKDOWN
  ======================================================= */

  const statusRows =
    buildStatusRows(
      decryptedTransactions,
      start,
      end
    );

  /* =======================================================
     RECENT TRANSACTIONS
  ======================================================= */

  const recentTransactions =
    decryptedTransactions
      .filter(
        (
          transaction
        ) => {
          const time =
            new Date(
              transaction.createdAt
            ).getTime();

          return (
            time >=
              start.getTime() &&
            time <=
              end.getTime()
          );
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          new Date(
            b.createdAt
          ).getTime() -
          new Date(
            a.createdAt
          ).getTime()
      )
      .slice(
        0,
        8
      )
      .map(
        toOverviewTransaction
      );

  /* =======================================================
     MERGE CHART DATA
  ======================================================= */

  const series =
    mergeDailySeries(
      start,
      days,
      transactionSeries,
      revenueSeries
    );

  /* =======================================================
     RESPONSE
  ======================================================= */

  const response: AdminOverviewResponse =
    {
      generatedAt:
        new Date().toISOString(),

      currency:
        "BDT",

      kpis: {
        totalUsers:
          metric(
            totalUsers,
            previousUsers
          ),

        activeWallets:
          metric(
            activeWallets,
            previousActiveWallets
          ),

        transactionVolume:
          metric(
            currentTransactionVolume,
            previousTransactionVolume
          ),

        platformRevenue:
          metric(
            revenueTotals.current,
            revenueTotals.previous
          ),

        pendingKyc:
          metric(
            pendingKyc,
            previousPendingKyc
          ),

        riskAlerts:
          metric(
            riskAlerts,
            previousRiskAlerts
          ),
      },

      series,

      transactionStatuses:
        statusRows,

      recentTransactions,

      attentionQueue:
        buildAttentionQueue({
          pendingKyc,
          riskAlerts,
          openSupport,
          failedTransactions,
        }),

      serviceHealth:
        buildServiceHealth(
          healthRows
        ),
    };

  /* =======================================================
     CACHE
  ======================================================= */

  cache.set(
    range,
    {
      expiresAt:
        Date.now() +
        CACHE_TTL_MS,

      value:
        response,
    }
  );

  return response;
}

/* =========================================================
   CLEAR CACHE
========================================================= */

export function clearAdminOverviewCache(): void {
  cache.clear();
}

/* =========================================================
   RECORD EXPORT
========================================================= */

export async function recordOverviewExport(
  actorId:
    | string
    | undefined,
  range: OverviewRange
): Promise<void> {
  const db =
    mongoose.connection.db;

  if (
    !actorId ||
    !db
  ) {
    return;
  }

  const actor =
    Types.ObjectId.isValid(
      actorId
    )
      ? new Types.ObjectId(
          actorId
        )
      : actorId;

  await db
    .collection(
      "auditlogs"
    )
    .insertOne({
      actor,

      actorId: actor,

      action:
        "ADMIN_OVERVIEW_EXPORT",

      after: {
        range,
      },

      createdAt:
        new Date(),
    });
}

/* =========================================================
   CSV EXPORT
========================================================= */

export function overviewToCsv(
  data: AdminOverviewResponse
): string {
  const rows:
    Array<
      Array<unknown>
    > = [
    [
      "section",
      "name",
      "value",
      "previousValue",
      "changePercent",
    ],

    ...Object.entries(
      data.kpis
    ).map(
      ([
        name,
        value,
      ]) => [
        "kpi",
        name,
        value.value,
        value.previousValue,
        value.changePercent,
      ]
    ),

    [],

    [
      "date",
      "volume",
      "transactions",
      "revenue",
    ],

    ...data.series.map(
      (
        point
      ) => [
        point.date,
        point.volume,
        point.transactions,
        point.revenue,
      ]
    ),

    [],

    [
      "recentTransaction",
      "reference",
      "sender",
      "receiver",
      "amount",
      "currency",
      "status",
      "createdAt",
    ],

    ...data.recentTransactions.map(
      (
        transaction
      ) => [
        "transaction",
        transaction.reference,
        transaction.senderName,
        transaction.receiverName,
        transaction.amount,
        transaction.currency,
        transaction.status,
        transaction.createdAt,
      ]
    ),
  ];

  return rows
    .map(
      (row) =>
        row
          .map(
            csvCell
          )
          .join(",")
    )
    .join("\n");
}

/* =========================================================
   DECRYPT TRANSACTION
========================================================= */

function decryptTransaction(
  row: AnyDoc,
  userNameMap: Map<
    string,
    string
  >
): DecryptedTransaction | null {
  const amount =
    decryptAmount(
      row.amountEncrypted
    );

  if (
    amount === null
  ) {
    /*
     * Do not break the whole dashboard because
     * one corrupted/legacy transaction cannot decrypt.
     */
    return null;
  }

  const senderId =
    getObjectIdString(
      row.senderId
    );

  const receiverId =
    getObjectIdString(
      row.receiverId
    );

  const senderName =
    senderId
      ? userNameMap.get(
          senderId
        ) ??
        "Sender"
      : "Sender";

  const receiverName =
    receiverId
      ? userNameMap.get(
          receiverId
        ) ??
        "Receiver"
      : "Receiver";

  const reference =
    decryptOptionalValue(
      row.referenceEncrypted
    );

  return {
    id:
      stringValue(
        row._id
      ),

    senderId,

    receiverId,

    senderName,

    receiverName,

    amount,

    currency:
      stringValue(
        row.currency,
        "BDT"
      ).toUpperCase(),

    status:
      normalizeStatus(
        row.status
      ),

    createdAt:
      dateValue(
        row.createdAt
      ),

    ...(reference
      ? {
          reference,
        }
      : {}),
  };
}

/* =========================================================
   DECRYPT AMOUNT
========================================================= */

function decryptAmount(
  value: unknown
): number | null {
  if (
    !isEncryptedData(
      value
    )
  ) {
    return null;
  }

  try {
    const decrypted =
      decryptData(
        value
      );

    const minorUnits =
      Number(
        decrypted
      );

    if (
      !Number.isSafeInteger(
        minorUnits
      ) ||
      minorUnits <
        0
    ) {
      return null;
    }

    return minorUnits / 100;
  } catch (
    error
  ) {
    console.error(
      "ADMIN OVERVIEW TRANSACTION AMOUNT DECRYPT ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    return null;
  }
}

/* =========================================================
   DECRYPT OPTIONAL VALUE
========================================================= */

function decryptOptionalValue(
  value: unknown
): string | undefined {
  if (
    !isEncryptedData(
      value
    )
  ) {
    return undefined;
  }

  try {
    return decryptData(
      value
    );
  } catch (
    error
  ) {
    console.error(
      "ADMIN OVERVIEW OPTIONAL DATA DECRYPT ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    return undefined;
  }
}

/* =========================================================
   ENCRYPTED DATA CHECK
========================================================= */

function isEncryptedData(
  value: unknown
): value is EncryptedData {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }

  const record =
    value as Partial<EncryptedData>;

  return (
    typeof record.encrypted ===
      "string" &&
    typeof record.iv ===
      "string" &&
    typeof record.authTag ===
      "string"
  );
}

/* =========================================================
   TRANSACTION SERIES
========================================================= */

function buildTransactionSeries(
  start: Date,
  days: number,
  transactions: DecryptedTransaction[]
): AnyDoc[] {
  const map =
    new Map<
      string,
      {
        amount: number;
        count: number;
      }
    >();

  for (
    const transaction of
      transactions
  ) {
    const created =
      new Date(
        transaction.createdAt
      );

    if (
      created <
        start
    ) {
      continue;
    }

    const date =
      created
        .toISOString()
        .slice(
          0,
          10
        );

    const current =
      map.get(
        date
      ) ?? {
        amount: 0,
        count: 0,
      };

    current.amount +=
      transaction.amount;

    current.count +=
      1;

    map.set(
      date,
      current
    );
  }

  const rows: AnyDoc[] =
    [];

  for (
    let index = 0;
    index < days;
    index += 1
  ) {
    const date =
      new Date(
        start.getTime() +
          index *
            DAY_MS
      )
        .toISOString()
        .slice(
          0,
          10
        );

    const item =
      map.get(
        date
      );

    rows.push({
      _id: date,

      amountMajor:
        item?.amount ??
        0,

      count:
        item?.count ??
        0,
    });
  }

  return rows;
}

/* =========================================================
   DAILY REVENUE SERIES
========================================================= */

async function dailyMoneySeries(
  collection: AnyDoc,
  start: Date,
  end: Date,
  includeCount: boolean
): Promise<AnyDoc[]> {
  const rows =
    await collection
      .find({
        createdAt: {
          $gte: start,
          $lte: end,
        },
      })
      .project({
        createdAt: 1,
        amountMinor: 1,
        revenueMinor: 1,
        feeMinor: 1,
        amount: 1,
      })
      .toArray();

  const map =
    new Map<
      string,
      {
        amount: number;
        count: number;
      }
    >();

  for (
    const row of rows
  ) {
    const created =
      new Date(
        row.createdAt
      );

    if (
      Number.isNaN(
        created.getTime()
      )
    ) {
      continue;
    }

    const date =
      created
        .toISOString()
        .slice(
          0,
          10
        );

    const amount =
      resolveMoneyMajor(
        row
      );

    const current =
      map.get(
        date
      ) ?? {
        amount: 0,
        count: 0,
      };

    current.amount +=
      amount;

    if (
      includeCount
    ) {
      current.count +=
        1;
    }

    map.set(
      date,
      current
    );
  }

  return [
    ...map.entries(),
  ].map(
    ([
      date,
      value,
    ]) => ({
      _id: date,

      amountMinor:
        value.amount *
        100,

      count:
        value.count,
    })
  );
}

/* =========================================================
   PERIOD REVENUE TOTAL
========================================================= */

async function periodMoneyTotals(
  collection: AnyDoc,
  start: Date,
  end: Date,
  previousStart: Date,
  completedStatuses: string[]
): Promise<{
  current: number;
  previous: number;
}> {
  const rows =
    await collection
      .find({
        createdAt: {
          $gte:
            previousStart,

          $lte:
            end,
        },

        $or: [
          {
            status: {
              $in:
                completedStatuses,
            },
          },

          {
            status: {
              $exists:
                false,
            },
          },
        ],
      })
      .project({
        createdAt: 1,
        amountMinor: 1,
        revenueMinor: 1,
        feeMinor: 1,
        amount: 1,
      })
      .toArray();

  let current =
    0;

  let previous =
    0;

  for (
    const row of rows
  ) {
    const date =
      new Date(
        row.createdAt
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      continue;
    }

    const amount =
      resolveMoneyMajor(
        row
      );

    if (
      date.getTime() >=
      start.getTime()
    ) {
      current +=
        amount;
    } else {
      previous +=
        amount;
    }
  }

  return {
    current:
      round(
        current
      ),

    previous:
      round(
        previous
      ),
  };
}

/* =========================================================
   RESOLVE PLAIN MONEY
========================================================= */

function resolveMoneyMajor(
  row: AnyDoc
): number {
  if (
    row.amountMinor !==
      undefined &&
    row.amountMinor !==
      null
  ) {
    return (
      numberValue(
        row.amountMinor
      ) / 100
    );
  }

  if (
    row.revenueMinor !==
      undefined &&
    row.revenueMinor !==
      null
  ) {
    return (
      numberValue(
        row.revenueMinor
      ) / 100
    );
  }

  if (
    row.feeMinor !==
      undefined &&
    row.feeMinor !==
      null
  ) {
    return (
      numberValue(
        row.feeMinor
      ) / 100
    );
  }

  /*
   * Legacy/plain amount support.
   */
  return numberValue(
    row.amount
  );
}

/* =========================================================
   MERGE CHART SERIES
========================================================= */

function mergeDailySeries(
  start: Date,
  days: number,
  transactionRows: AnyDoc[],
  revenueRows: AnyDoc[]
): OverviewSeriesPoint[] {
  const transactionMap =
    new Map(
      transactionRows.map(
        (row) => [
          String(
            row._id
          ),
          row,
        ]
      )
    );

  const revenueMap =
    new Map(
      revenueRows.map(
        (row) => [
          String(
            row._id
          ),
          row,
        ]
      )
    );

  const result:
    OverviewSeriesPoint[] =
    [];

  for (
    let index = 0;
    index < days;
    index += 1
  ) {
    const date =
      new Date(
        start.getTime() +
          index *
            DAY_MS
      )
        .toISOString()
        .slice(
          0,
          10
        );

    const transaction =
      transactionMap.get(
        date
      );

    const revenue =
      revenueMap.get(
        date
      );

    result.push({
      date,

      volume:
        round(
          numberValue(
            transaction?.amountMajor
          )
        ),

      transactions:
        numberValue(
          transaction?.count
        ),

      revenue:
        minorToMajor(
          revenue?.amountMinor
        ),
    });
  }

  return result;
}

/* =========================================================
   STATUS ROWS
========================================================= */

function buildStatusRows(
  transactions: DecryptedTransaction[],
  start: Date,
  end: Date
): TransactionStatusBreakdown[] {
  const counts: Record<
    TransactionStatusBreakdown["status"],
    number
  > = {
    completed: 0,
    pending: 0,
    failed: 0,
    reversed: 0,
  };

  for (
    const transaction of
      transactions
  ) {
    const created =
      new Date(
        transaction.createdAt
      );

    if (
      created <
        start ||
      created >
        end
    ) {
      continue;
    }

    counts[
      transaction.status
    ] += 1;
  }

  const total =
    Object.values(
      counts
    ).reduce(
      (
        sum,
        count
      ) =>
        sum + count,
      0
    );

  return (
    Object.entries(
      counts
    ) as Array<
      [
        TransactionStatusBreakdown["status"],
        number
      ]
    >
  ).map(
    ([
      status,
      count,
    ]) => ({
      status,

      count,

      percentage:
        total
          ? round(
              (count /
                total) *
                100
            )
          : 0,
    })
  );
}

/* =========================================================
   OVERVIEW TRANSACTION
========================================================= */

function toOverviewTransaction(
  transaction: DecryptedTransaction
): OverviewTransaction {
  return {
    id:
      transaction.id,

    reference:
      transaction.reference ??
      transaction.id,

    senderName:
      transaction.senderName,

    receiverName:
      transaction.receiverName,

    amount:
      transaction.amount,

    currency:
      transaction.currency,

    status:
      transaction.status,

    createdAt:
      transaction.createdAt,
  };
}

/* =========================================================
   ATTENTION QUEUE
========================================================= */

function buildAttentionQueue(
  input: {
    pendingKyc: number;
    riskAlerts: number;
    openSupport: number;
    failedTransactions: number;
  }
): AttentionQueueItem[] {
  return [
    {
      id: "kyc",

      type: "kyc",

      title:
        "Pending KYC",

      description:
        "Identity reviews waiting for a decision",

      count:
        input.pendingKyc,

      href:
        "/dashboard/kyc-requests",

      severity:
        "medium",
    },

    {
      id: "risk",

      type: "risk",

      title:
        "Risk alerts",

      description:
        "Unresolved high-risk security events",

      count:
        input.riskAlerts,

      href:
        "/dashboard/security",

      severity:
        "high",
    },

    {
      id: "support",

      type: "support",

      title:
        "Open support",

      description:
        "Support tickets requiring attention",

      count:
        input.openSupport,

      href:
        "/dashboard/support",

      severity:
        "medium",
    },

    {
      id: "transaction",

      type:
        "transaction",

      title:
        "Failed transactions",

      description:
        "Failed transactions in the selected range",

      count:
        input.failedTransactions,

      href:
        "/dashboard/all-transactions",

      severity:
        "high",
    },
  ].filter(
    (item) =>
      item.count > 0
  ) as AttentionQueueItem[];
}

/* =========================================================
   SERVICE HEALTH
========================================================= */

function buildServiceHealth(
  rows: AnyDoc[]
): ServiceHealthItem[] {
  const groups =
    new Map<
      string,
      {
        total: number;
        errors: number;
        latency: number;
      }
    >();

  for (
    const row of rows
  ) {
    const name =
      stringValue(
        row.service ??
          row.source ??
          row.module,
        "API"
      );

    const current =
      groups.get(
        name
      ) ?? {
        total: 0,
        errors: 0,
        latency: 0,
      };

    current.total +=
      1;

    const severity =
      String(
        row.level ??
          row.severity ??
          ""
      ).toLowerCase();

    if (
      [
        "error",
        "fatal",
        "critical",
      ].includes(
        severity
      )
    ) {
      current.errors +=
        1;
    }

    current.latency +=
      numberValue(
        row.latencyMs ??
          row.durationMs
      );

    groups.set(
      name,
      current
    );
  }

  return [
    ...groups.entries(),
  ]
    .slice(
      0,
      6
    )
    .map(
      ([
        name,
        value,
      ]) => {
        const errorRate =
          value.total
            ? value.errors /
              value.total
            : 0;

        return {
          id:
            name
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                "-"
              ),

          name,

          status:
            errorRate >=
            0.25
              ? "down"
              : errorRate >=
                  0.05
                ? "degraded"
                : "operational",

          uptimePercent:
            round(
              (1 -
                errorRate) *
                100
            ),

          latencyMs:
            value.total
              ? Math.round(
                  value.latency /
                    value.total
                )
              : 0,
        };
      }
    );
}

/* =========================================================
   METRIC
========================================================= */

function metric(
  value: number,
  previousValue: number
): OverviewMetric {
  return {
    value:
      round(value),

    previousValue:
      round(
        previousValue
      ),

    changePercent:
      percentChange(
        value,
        previousValue
      ),
  };
}

/* =========================================================
   PERCENTAGE
========================================================= */

function percentChange(
  value: number,
  previousValue: number
): number {
  if (
    value === 0 &&
    previousValue === 0
  ) {
    return 0;
  }

  if (
    previousValue === 0
  ) {
    return 100;
  }

  return round(
    ((value -
      previousValue) /
      Math.abs(
        previousValue
      )) *
      100
  );
}

/* =========================================================
   NORMALIZE STATUS
========================================================= */

function normalizeStatus(
  value: unknown
): TransactionStatusBreakdown["status"] {
  const status =
    String(
      value ??
        "pending"
    ).toLowerCase();

  if (
    [
      "completed",
      "complete",
      "success",
      "successful",
      "paid",
    ].includes(
      status
    )
  ) {
    return "completed";
  }

  if (
    [
      "failed",
      "cancelled",
      "canceled",
      "declined",
      "error",
    ].includes(
      status
    )
  ) {
    return "failed";
  }

  if (
    [
      "reversed",
      "refunded",
    ].includes(
      status
    )
  ) {
    return "reversed";
  }

  return "pending";
}

/* =========================================================
   OBJECT ID
========================================================= */

function getObjectIdString(
  value: unknown
): string {
  if (
    value ===
      undefined ||
    value === null
  ) {
    return "";
  }

  if (
    typeof value ===
    "object" &&
    value !== null &&
    "_id" in value
  ) {
    return String(
      (
        value as {
          _id: unknown;
        }
      )._id
    );
  }

  return String(
    value
  );
}

/* =========================================================
   DATE
========================================================= */

function startOfUtcDay(
  value: Date
): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

/* =========================================================
   CONSTANT
========================================================= */

const DAY_MS =
  86_400_000;

/* =========================================================
   MONEY
========================================================= */

function minorToMajor(
  value: unknown
): number {
  return round(
    numberValue(value) /
      100
  );
}

/* =========================================================
   NUMBER
========================================================= */

function numberValue(
  value: unknown
): number {
  const result =
    Number(
      value ?? 0
    );

  return Number.isFinite(
    result
  )
    ? result
    : 0;
}

/* =========================================================
   STRING
========================================================= */

function stringValue(
  value: unknown,
  fallback = ""
): string {
  return value ===
    undefined ||
    value === null ||
    value === ""
    ? fallback
    : String(
        value
      );
}

/* =========================================================
   DATE VALUE
========================================================= */

function dateValue(
  value: unknown
): string {
  const date =
    value instanceof Date
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
    ? new Date(
        0
      ).toISOString()
    : date.toISOString();
}

/* =========================================================
   ROUND
========================================================= */

function round(
  value: number
): number {
  return Math.round(
    value * 100
  ) / 100;
}

/* =========================================================
   CSV
========================================================= */

function csvCell(
  value: unknown
): string {
  return `"${String(
    value ?? ""
  ).replaceAll(
    '"',
    '""'
  )}"`;
}