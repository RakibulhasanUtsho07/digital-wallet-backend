import { Response } from "express";

import { AuthRequest } from "../middlewares/authMiddleware.js";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  BudgetExpense,
  Budget,
} from "../models/Budget.js";

import {
  decryptData,
} from "../utils/crypto.js";

/* =========================================================
   TYPES
========================================================= */

type TimeRange =
  | "week"
  | "month"
  | "year";

type Direction =
  | "income"
  | "expense"
  | "none";

interface EncryptedValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

interface TransactionLike {
  senderId?: unknown;
  receiverId?: unknown;
  amountEncrypted?: unknown;
  type?: unknown;
  status?: unknown;
  createdAt?: unknown;
}

interface BudgetExpenseLike {
  _id?: unknown;
  userId?: unknown;
  categoryId?: unknown;
  amount?: unknown;
  title?: unknown;
  method?: unknown;
  date?: unknown;
  month?: unknown;
  year?: unknown;
}

interface CashflowBucket {
  name: string;
  income: number;
  expense: number;
}

interface Summary {
  totalIncome: number;
  totalSpent: number;
  netBalance: number;
}

/* =========================================================
   HELPERS
========================================================= */

function safeDecrypt(
  value: unknown
): string {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return "";
  }

  const data =
    value as Partial<EncryptedValue>;

  if (
    typeof data.encrypted !==
      "string" ||
    typeof data.iv !==
      "string" ||
    typeof data.authTag !==
      "string"
  ) {
    return "";
  }

  try {
    return decryptData({
      encrypted:
        data.encrypted,
      iv: data.iv,
      authTag:
        data.authTag,
    });
  } catch (error) {
    console.error(
      "INSIGHTS DECRYPT ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    return "";
  }
}

/* =========================================================
   TRANSACTION AMOUNT
========================================================= */

function getTransactionAmount(
  transaction: TransactionLike
): number {
  const decrypted =
    safeDecrypt(
      transaction.amountEncrypted
    );

  if (!decrypted) {
    return 0;
  }

  const minorUnits =
    Number(decrypted);

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits < 0
  ) {
    return 0;
  }

  return minorUnits / 100;
}

/* =========================================================
   BUDGET EXPENSE AMOUNT
========================================================= */

function getBudgetExpenseAmount(
  expense: BudgetExpenseLike
): number {
  const amount =
    Number(expense.amount);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return 0;
  }

  return Math.round(
    amount * 100
  ) / 100;
}

/* =========================================================
   ID
========================================================= */

function getId(
  value: unknown
): string {
  if (!value) {
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

  return String(value);
}

/* =========================================================
   RANGE
========================================================= */

function normalizeRange(
  value: unknown
): TimeRange {
  return value === "week" ||
    value === "year"
    ? value
    : "month";
}

/* =========================================================
   MONEY
========================================================= */

function roundMoney(
  value: number
): number {
  return Math.round(
    value * 100
  ) / 100;
}

/* =========================================================
   TRANSACTION DIRECTION
========================================================= */

function getDirection(
  transaction: TransactionLike,
  userId: string
): Direction {
  if (
    transaction.status !==
    "COMPLETED"
  ) {
    return "none";
  }

  if (
    transaction.type ===
    "DEPOSIT"
  ) {
    return "income";
  }

  if (
    transaction.type ===
    "WITHDRAW"
  ) {
    return "expense";
  }

  if (
    transaction.type ===
    "TRANSFER"
  ) {
    const senderId =
      getId(
        transaction.senderId
      );

    const receiverId =
      getId(
        transaction.receiverId
      );

    if (
      senderId === userId &&
      receiverId !== userId
    ) {
      return "expense";
    }

    if (
      receiverId === userId &&
      senderId !== userId
    ) {
      return "income";
    }
  }

  return "none";
}

/* =========================================================
   DATE BOUNDS
========================================================= */

function getBounds(
  range: TimeRange
) {
  const now =
    new Date();

  if (
    range === "week"
  ) {
    const start =
      new Date(now);

    start.setHours(
      0,
      0,
      0,
      0
    );

    const day =
      start.getDay();

    const mondayOffset =
      day === 0
        ? -6
        : 1 - day;

    start.setDate(
      start.getDate() +
        mondayOffset
    );

    const end =
      new Date(start);

    end.setDate(
      end.getDate() +
        6
    );

    end.setHours(
      23,
      59,
      59,
      999
    );

    const previousStart =
      new Date(start);

    previousStart.setDate(
      previousStart.getDate() -
        7
    );

    const previousEnd =
      new Date(start);

    previousEnd.setMilliseconds(
      -1
    );

    return {
      start,
      end,
      previousStart,
      previousEnd,
    };
  }

  if (
    range === "year"
  ) {
    const start =
      new Date(
        now.getFullYear(),
        0,
        1
      );

    const end =
      new Date(
        now.getFullYear(),
        11,
        31,
        23,
        59,
        59,
        999
      );

    const previousStart =
      new Date(
        now.getFullYear() - 1,
        0,
        1
      );

    const previousEnd =
      new Date(
        now.getFullYear() - 1,
        11,
        31,
        23,
        59,
        59,
        999
      );

    return {
      start,
      end,
      previousStart,
      previousEnd,
    };
  }

  const start =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  const end =
    new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

  const previousStart =
    new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

  const previousEnd =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999
    );

  return {
    start,
    end,
    previousStart,
    previousEnd,
  };
}

/* =========================================================
   CASHFLOW BUCKETS
========================================================= */

function createBuckets(
  range: TimeRange,
  start: Date
): CashflowBucket[] {
  if (
    range === "week"
  ) {
    return [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ].map(
      (name) => ({
        name,
        income: 0,
        expense: 0,
      })
    );
  }

  if (
    range === "year"
  ) {
    return [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].map(
      (name) => ({
        name,
        income: 0,
        expense: 0,
      })
    );
  }

  const daysInMonth =
    new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0
    ).getDate();

  const weeks =
    Math.ceil(
      daysInMonth / 7
    );

  return Array.from(
    {
      length: weeks,
    },
    (_, index) => ({
      name: `Week ${
        index + 1
      }`,
      income: 0,
      expense: 0,
    })
  );
}

/* =========================================================
   BUCKET INDEX
========================================================= */

function getBucketIndex(
  range: TimeRange,
  date: Date
): number {
  if (
    range === "week"
  ) {
    const day =
      date.getDay();

    return day === 0
      ? 6
      : day - 1;
  }

  if (
    range === "year"
  ) {
    return date.getMonth();
  }

  return Math.floor(
    (date.getDate() - 1) /
      7
  );
}

/* =========================================================
   TRANSACTION SUMMARY
========================================================= */

function calculateTransactionSummary(
  transactions: TransactionLike[],
  userId: string
): Summary {
  let totalIncome = 0;
  let totalSpent = 0;

  for (
    const transaction of
      transactions
  ) {
    const amount =
      getTransactionAmount(
        transaction
      );

    const direction =
      getDirection(
        transaction,
        userId
      );

    if (
      direction ===
      "income"
    ) {
      totalIncome +=
        amount;
    }

    if (
      direction ===
      "expense"
    ) {
      totalSpent +=
        amount;
    }
  }

  return {
    totalIncome:
      roundMoney(
        totalIncome
      ),
    totalSpent:
      roundMoney(
        totalSpent
      ),
    netBalance:
      roundMoney(
        totalIncome -
          totalSpent
      ),
  };
}

/* =========================================================
   TREND
========================================================= */

function calculateTrend(
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
      ((current -
        previous) /
        previous) *
      100
    ).toFixed(1)
  );
}

/* =========================================================
   CONTROLLER
========================================================= */

export const getFinancialInsights =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      res.setHeader(
        "Cache-Control",
        "private, no-store, max-age=0"
      );

      if (
        !req.user?._id
      ) {
        res.status(
          401
        ).json({
          success: false,
          message:
            "Not authorized",
        });

        return;
      }

      const userId =
        req.user._id;

      const userIdString =
        userId.toString();

      const range =
        normalizeRange(
          req.query.range
        );

      const bounds =
        getBounds(range);

      /* =====================================================
         LOAD TRANSACTIONS + BUDGET EXPENSES
      ====================================================== */

      const [
        transactionRecords,
        budgetExpenseRecords,
      ] =
        await Promise.all([
          Transaction.find({
            $or: [
              {
                senderId:
                  userId,
              },
              {
                receiverId:
                  userId,
              },
            ],
            status:
              "COMPLETED",
            createdAt: {
              $gte:
                bounds.previousStart,
              $lte:
                bounds.end,
            },
          })
            .select(
              "senderId receiverId amountEncrypted type status createdAt"
            )
            .lean(),

          BudgetExpense.find({
            userId,
            date: {
              $gte:
                bounds.previousStart,
              $lte:
                bounds.end,
            },
          })
            .select(
              "categoryId title amount method date month year"
            )
            .lean(),
        ]);

      /* =====================================================
         CURRENT/PREVIOUS TRANSACTIONS
      ====================================================== */

      const currentTransactions =
        transactionRecords.filter(
          (
            transaction
          ) => {
            const createdAt =
              new Date(
                transaction.createdAt as Date
              );

            return (
              createdAt >=
                bounds.start &&
              createdAt <=
                bounds.end
            );
          }
        );

      const previousTransactions =
        transactionRecords.filter(
          (
            transaction
          ) => {
            const createdAt =
              new Date(
                transaction.createdAt as Date
              );

            return (
              createdAt >=
                bounds.previousStart &&
              createdAt <=
                bounds.previousEnd
            );
          }
        );

      /* =====================================================
         CURRENT/PREVIOUS BUDGET EXPENSES
      ====================================================== */

      const currentBudgetExpenses =
        budgetExpenseRecords.filter(
          (expense) => {
            const date =
              new Date(
                expense.date
              );

            return (
              !Number.isNaN(
                date.getTime()
              ) &&
              date >=
                bounds.start &&
              date <=
                bounds.end
            );
          }
        );

      const previousBudgetExpenses =
        budgetExpenseRecords.filter(
          (expense) => {
            const date =
              new Date(
                expense.date
              );

            return (
              !Number.isNaN(
                date.getTime()
              ) &&
              date >=
                bounds.previousStart &&
              date <=
                bounds.previousEnd
            );
          }
        );

      /* =====================================================
         TRANSACTION SUMMARY
      ====================================================== */

      const transactionSummary =
        calculateTransactionSummary(
          currentTransactions as TransactionLike[],
          userIdString
        );

      const previousTransactionSummary =
        calculateTransactionSummary(
          previousTransactions as TransactionLike[],
          userIdString
        );

      /* =====================================================
         MANUAL BUDGET TOTALS
      ====================================================== */

      const currentBudgetSpent =
        currentBudgetExpenses.reduce(
          (
            total,
            expense
          ) =>
            total +
            getBudgetExpenseAmount(
              expense as BudgetExpenseLike
            ),
          0
        );

      const previousBudgetSpent =
        previousBudgetExpenses.reduce(
          (
            total,
            expense
          ) =>
            total +
            getBudgetExpenseAmount(
              expense as BudgetExpenseLike
            ),
          0
        );

      /* =====================================================
         FINAL SUMMARY
      ====================================================== */

      const summary: Summary = {
        totalIncome:
          roundMoney(
            transactionSummary.totalIncome
          ),

        totalSpent:
          roundMoney(
            transactionSummary.totalSpent +
              currentBudgetSpent
          ),

        netBalance:
          roundMoney(
            transactionSummary.totalIncome -
              transactionSummary.totalSpent -
              currentBudgetSpent
          ),
      };

      const previousSummary: Summary =
        {
          totalIncome:
            roundMoney(
              previousTransactionSummary.totalIncome
            ),

          totalSpent:
            roundMoney(
              previousTransactionSummary.totalSpent +
                previousBudgetSpent
            ),

          netBalance:
            roundMoney(
              previousTransactionSummary.totalIncome -
                previousTransactionSummary.totalSpent -
                previousBudgetSpent
            ),
        };

      /* =====================================================
         CASHFLOW
      ====================================================== */

      const cashflow =
        createBuckets(
          range,
          bounds.start
        );

      /* =====================================================
         TRANSACTION CASHFLOW
      ====================================================== */

      for (
        const transaction of
          currentTransactions
      ) {
        const item =
          transaction as TransactionLike;

        const createdAt =
          new Date(
            item.createdAt as Date
          );

        const amount =
          getTransactionAmount(
            item
          );

        const direction =
          getDirection(
            item,
            userIdString
          );

        const index =
          getBucketIndex(
            range,
            createdAt
          );

        const bucket =
          cashflow[index];

        if (
          bucket &&
          direction ===
            "income"
        ) {
          bucket.income =
            roundMoney(
              bucket.income +
                amount
            );
        }

        if (
          bucket &&
          direction ===
            "expense"
        ) {
          bucket.expense =
            roundMoney(
              bucket.expense +
                amount
            );
        }
      }

      /* =====================================================
         BUDGET CASHFLOW
      ====================================================== */

      for (
        const expense of
          currentBudgetExpenses
      ) {
        const item =
          expense as BudgetExpenseLike;

        const createdAt =
          new Date(
            item.date as Date
          );

        if (
          Number.isNaN(
            createdAt.getTime()
          )
        ) {
          continue;
        }

        const amount =
          getBudgetExpenseAmount(
            item
          );

        const index =
          getBucketIndex(
            range,
            createdAt
          );

        const bucket =
          cashflow[index];

        if (
          bucket
        ) {
          bucket.expense =
            roundMoney(
              bucket.expense +
                amount
            );
        }
      }

      /* =====================================================
         EXPENSE CATEGORIES
      ====================================================== */

      const expenseTotals:
        Record<string, number> =
        {};

      /* -----------------------------------------------------
         TRANSFERS / WITHDRAWALS
      ------------------------------------------------------ */

      for (
        const transaction of
          currentTransactions
      ) {
        const item =
          transaction as TransactionLike;

        const amount =
          getTransactionAmount(
            item
          );

        const direction =
          getDirection(
            item,
            userIdString
          );

        if (
          direction !==
          "expense"
        ) {
          continue;
        }

        if (
          item.type ===
          "TRANSFER"
        ) {
          expenseTotals.Transfers =
            roundMoney(
              (
                expenseTotals
                  .Transfers ||
                0
              ) + amount
            );
        }

        if (
          item.type ===
          "WITHDRAW"
        ) {
          expenseTotals.Withdrawals =
            roundMoney(
              (
                expenseTotals
                  .Withdrawals ||
                0
              ) + amount
            );
        }
      }

      /* -----------------------------------------------------
         BUDGET CATEGORIES
      ------------------------------------------------------ */

      const budgetCategoryIds =
        currentBudgetExpenses
          .map(
            (expense) =>
              getId(
                expense.categoryId
              )
          )
          .filter(Boolean);

      const uniqueCategoryIds =
        [
          ...new Set(
            budgetCategoryIds
          ),
        ];

      const categoryRecords =
        uniqueCategoryIds.length
          ? await Budget.find({
              _id: {
                $in:
                  uniqueCategoryIds,
              },
              userId,
            })
              .select(
                "_id category"
              )
              .lean()
          : [];

      const categoryNameMap =
        new Map<
          string,
          string
        >();

      for (
        const category of
          categoryRecords
      ) {
        categoryNameMap.set(
          String(
            category._id
          ),
          category.category
        );
      }

      for (
        const expense of
          currentBudgetExpenses
      ) {
        const item =
          expense as BudgetExpenseLike;

        const amount =
          getBudgetExpenseAmount(
            item
          );

        const categoryId =
          getId(
            item.categoryId
          );

        const categoryName =
          categoryNameMap.get(
            categoryId
          ) ||
          "Other";

        expenseTotals[
          categoryName
        ] =
          roundMoney(
            (
              expenseTotals[
                categoryName
              ] || 0
            ) + amount
          );
      }

      const expenseCategories =
        Object.entries(
          expenseTotals
        )
          .filter(
            ([, value]) =>
              value > 0
          )
          .map(
            ([
              name,
              value,
            ]) => ({
              name,
              value:
                roundMoney(
                  value
                ),
            })
          )
          .sort(
            (a, b) =>
              b.value -
              a.value
          );

      /* =====================================================
         TRENDS
      ====================================================== */

      const trends = {
        income:
          calculateTrend(
            summary.totalIncome,
            previousSummary.totalIncome
          ),

        expense:
          calculateTrend(
            summary.totalSpent,
            previousSummary.totalSpent
          ),
      };

      /* =====================================================
         SMART INSIGHT
      ====================================================== */

      let insight =
        "No completed financial activity was found for this period.";

      if (
        summary.netBalance >
        0
      ) {
        insight =
          `Your cashflow is positive by BDT ${summary.netBalance.toLocaleString(
            "en-BD"
          )} for this ${range}.`;
      } else if (
        summary.netBalance <
        0
      ) {
        insight =
          `Your outgoing funds are BDT ${Math.abs(
            summary.netBalance
          ).toLocaleString(
            "en-BD"
          )} higher than incoming funds for this ${range}.`;
      } else if (
        summary.totalIncome >
          0 ||
        summary.totalSpent >
          0
      ) {
        insight =
          `Your incoming and outgoing funds are balanced for this ${range}.`;
      }

      /* =====================================================
         RESPONSE
      ====================================================== */

      res.status(
        200
      ).json({
        success:
          true,

        range,

        period: {
          start:
            bounds.start,

          end:
            bounds.end,
        },

        summary,

        previousSummary,

        trends,

        cashflow,

        expenseCategories,

        insight,
      });
    } catch (
      error
    ) {
      console.error(
        "Financial insights error:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Failed to load financial insights.",
      });
    }
  };