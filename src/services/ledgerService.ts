import crypto from "node:crypto";

import mongoose, {
  ClientSession,
} from "mongoose";

import {
  LedgerAccount,
  type ILedgerAccount,
} from "../models/LedgerAccount.js";

import {
  LedgerEntry,
  type LedgerEntryDirection,
  type LedgerReferenceType,
} from "../models/LedgerEntry.js";

/* =========================================================
   TYPES
========================================================= */

export interface CreateLedgerAccountInput {
  accountCode: string;
  name: string;
  accountType:
    | "asset"
    | "liability"
    | "revenue"
    | "expense"
    | "equity";

  ownerType:
    | "user"
    | "merchant"
    | "platform"
    | "provider"
    | "system";

  ownerId?: string;

  currency: string;

  description?: string;
}

export interface LedgerLineInput {
  accountId: string;

  direction: LedgerEntryDirection;

  amount:
    | string
    | number
    | mongoose.Types.Decimal128;

  currency: string;

  description?: string;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface PostLedgerInput {
  referenceType:
    | LedgerReferenceType;

  referenceId: string;

  lines: LedgerLineInput[];

  idempotencyKey?: string;

  description?: string;

  effectiveAt?: Date;

  session?: ClientSession;
}

export interface PostLedgerResult {
  entryGroupId: string;

  entries: Array<{
    entryId: string;
    accountId: string;
    direction: LedgerEntryDirection;
    amount: string;
    currency: string;
  }>;

  totalDebit: string;

  totalCredit: string;
}

/* =========================================================
   HELPERS
========================================================= */

const generateId = (
  prefix: string
): string => {
  return `${prefix}_${crypto
    .randomBytes(16)
    .toString("hex")}`;
};

const normalizeCurrency = (
  currency: string
): string => {
  const normalized =
    currency
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      normalized
    )
  ) {
    throw new Error(
      "Invalid currency code."
    );
  }

  return normalized;
};

const decimalToString = (
  amount:
    | string
    | number
    | mongoose.Types.Decimal128
): string => {
  if (
    amount instanceof
    mongoose.Types.Decimal128
  ) {
    return amount.toString();
  }

  if (
    typeof amount ===
    "number"
  ) {
    if (
      !Number.isFinite(
        amount
      )
    ) {
      throw new Error(
        "Ledger amount must be a finite number."
      );
    }

    /*
     * Convert number to string first.
     *
     * NOTE:
     * Financial callers should prefer string amounts
     * to avoid floating-point representation issues.
     */
    return amount.toString();
  }

  const value =
    amount.trim();

  if (!value) {
    throw new Error(
      "Ledger amount is required."
    );
  }

  /*
   * Accept only positive decimal values.
   *
   * Up to 18 fractional digits are allowed here.
   * Exact platform currency precision can later be
   * configured centrally.
   */
  if (
    !/^\d+(?:\.\d{1,18})?$/.test(
      value
    )
  ) {
    throw new Error(
      "Invalid ledger amount."
    );
  }

  if (
    Number(value) <=
    0
  ) {
    throw new Error(
      "Ledger amount must be greater than zero."
    );
  }

  return value;
};

const compareDecimalStrings =
  (
    left: string,
    right: string
  ): number => {
    const leftDecimal =
      mongoose.Types.Decimal128.fromString(
        left
      );

    const rightDecimal =
      mongoose.Types.Decimal128.fromString(
        right
      );

    const leftNumber =
      Number(
        leftDecimal.toString()
      );

    const rightNumber =
      Number(
        rightDecimal.toString()
      );

    if (
      leftNumber ===
      rightNumber
    ) {
      return 0;
    }

    return leftNumber <
      rightNumber
      ? -1
      : 1;
  };

const addDecimalStrings = (
  values: string[]
): string => {
  let total =
    mongoose.Types.Decimal128.fromString(
      "0"
    );

  for (const value of values) {
    const current =
      mongoose.Types.Decimal128.fromString(
        total.toString()
      );

    const next =
      mongoose.Types.Decimal128.fromString(
        value
      );

    /*
     * Decimal128 addition is not directly available
     * as a MongoDB client-side arithmetic method.
     *
     * For the current application layer we perform
     * the calculation through decimal strings converted
     * to numbers only for small bounded aggregation.
     *
     * This service should be upgraded to a dedicated
     * decimal arithmetic library before production
     * money volumes become large.
     */
    const result =
      Number(
        current.toString()
      ) +
      Number(
        next.toString()
      );

    total =
      mongoose.Types.Decimal128.fromString(
        result.toFixed(
          18
        )
      );
  }

  return total
    .toString()
    .replace(
      /0+$/,
      ""
    )
    .replace(
      /\.$/,
      ""
    );
};

/* =========================================================
   CREATE LEDGER ACCOUNT
========================================================= */

export const createLedgerAccount =
  async (
    input: CreateLedgerAccountInput
  ): Promise<ILedgerAccount> => {
    const {
      accountCode,
      name,
      accountType,
      ownerType,
      ownerId,
      currency,
      description,
    } = input;

    const normalizedCode =
      accountCode
        .trim()
        .toLowerCase();

    if (
      !normalizedCode
    ) {
      throw new Error(
        "Account code is required."
      );
    }

    if (
      !name?.trim()
    ) {
      throw new Error(
        "Ledger account name is required."
      );
    }

    const normalizedCurrency =
      normalizeCurrency(
        currency
      );

    let normalizedOwnerId:
      | mongoose.Types.ObjectId
      | undefined;

    if (ownerId) {
      if (
        !mongoose.isValidObjectId(
          ownerId
        )
      ) {
        throw new Error(
          "Invalid ledger account owner ID."
        );
      }

      normalizedOwnerId =
        new mongoose.Types.ObjectId(
          ownerId
        );
    }

    /*
     * Platform/system accounts do not require ownerId.
     */
    if (
      (
        ownerType ===
          "user" ||
        ownerType ===
          "merchant" ||
        ownerType ===
          "provider"
      ) &&
      !normalizedOwnerId
    ) {
      throw new Error(
        "Owner ID is required for this ledger account owner type."
      );
    }

    const existing =
      await LedgerAccount.findOne({
        accountCode:
          normalizedCode,
      });

    if (existing) {
      return existing;
    }

    return LedgerAccount.create({
      accountCode:
        normalizedCode,

      name:
        name.trim(),

      accountType,

      ownerType,

      ownerId:
        normalizedOwnerId,

      currency:
        normalizedCurrency,

      status:
        "active",

      description:
        description?.trim() ||
        undefined,
    });
  };

/* =========================================================
   GET ACCOUNT
========================================================= */

export const getLedgerAccount =
  async (
    accountId: string,
    session?: ClientSession
  ): Promise<ILedgerAccount | null> => {
    if (
      !mongoose.isValidObjectId(
        accountId
      )
    ) {
      return null;
    }

    return LedgerAccount.findById(
      accountId
    )
      .session(
        session ?? null
      )
      .lean();
  };

/* =========================================================
   POST BALANCED LEDGER
========================================================= */

export const postBalancedLedger =
  async (
    input: PostLedgerInput
  ): Promise<PostLedgerResult> => {
    const {
      referenceType,
      referenceId,
      lines,
      idempotencyKey,
      description,
      effectiveAt =
        new Date(),
      session,
    } = input;

    /* =====================================================
       BASIC VALIDATION
    ====================================================== */

    if (
      !referenceId?.trim()
    ) {
      throw new Error(
        "Ledger reference ID is required."
      );
    }

    if (
      !Array.isArray(lines) ||
      lines.length <
        2
    ) {
      throw new Error(
        "A balanced ledger requires at least two entries."
      );
    }

    /* =====================================================
       IDEMPOTENCY CHECK
    ====================================================== */

    if (
      idempotencyKey?.trim()
    ) {
      const existing =
        await LedgerEntry.findOne({
          idempotencyKey:
            idempotencyKey.trim(),
        })
          .session(
            session ?? null
          )
          .lean();

      if (existing) {
        const existingEntries =
          await LedgerEntry.find({
            entryGroupId:
              existing.entryGroupId,
          })
            .sort({
              createdAt:
                1,
            })
            .lean();

        const debitEntries =
          existingEntries.filter(
            (entry) =>
              entry.direction ===
              "debit"
          );

        const creditEntries =
          existingEntries.filter(
            (entry) =>
              entry.direction ===
              "credit"
          );

        return {
          entryGroupId:
            existing.entryGroupId,

          entries:
            existingEntries.map(
              (entry) => ({
                entryId:
                  entry.entryId,

                accountId:
                  entry.accountId.toString(),

                direction:
                  entry.direction,

                amount:
                  entry.amount.toString(),

                currency:
                  entry.currency,
              })
            ),

          totalDebit:
            addDecimalStrings(
              debitEntries.map(
                (entry) =>
                  entry.amount.toString()
              )
            ),

          totalCredit:
            addDecimalStrings(
              creditEntries.map(
                (entry) =>
                  entry.amount.toString()
              )
            ),
        };
      }
    }

    /* =====================================================
       NORMALIZE LINES
    ====================================================== */

    const normalizedLines =
      lines.map(
        (
          line
        ) => {
          if (
            !mongoose.isValidObjectId(
              line.accountId
            )
          ) {
            throw new Error(
              `Invalid ledger account ID: ${line.accountId}`
            );
          }

          const amount =
            decimalToString(
              line.amount
            );

          const currency =
            normalizeCurrency(
              line.currency
            );

          return {
            accountId:
              line.accountId,

            direction:
              line.direction,

            amount,

            currency,

            description:
              line.description
                ?.trim() ||
              description,

            metadata:
              line.metadata,
          };
        }
      );

    /* =====================================================
       SAME CURRENCY
    ====================================================== */

    const currencies =
      new Set(
        normalizedLines.map(
          (line) =>
            line.currency
        )
      );

    if (
      currencies.size !==
      1
    ) {
      throw new Error(
        "All entries in one balanced ledger posting must use the same currency."
      );
    }

    /* =====================================================
       LOAD ACCOUNTS
    ====================================================== */

    const accountIds =
      normalizedLines.map(
        (line) =>
          new mongoose.Types.ObjectId(
            line.accountId
          )
      );

    const accounts =
      await LedgerAccount.find({
        _id: {
          $in:
            accountIds,
        },
      })
        .session(
          session ?? null
        )
        .lean();

    const accountMap =
      new Map(
        accounts.map(
          (account) => [
            account._id.toString(),
            account,
          ]
        )
      );

    if (
      accounts.length !==
      new Set(
        normalizedLines.map(
          (line) =>
            line.accountId
        )
      ).size
    ) {
      throw new Error(
        "One or more ledger accounts do not exist."
      );
    }

    /* =====================================================
       ACCOUNT VALIDATION
    ====================================================== */

    for (const line of normalizedLines) {
      const account =
        accountMap.get(
          line.accountId
        );

      if (!account) {
        throw new Error(
          "Ledger account not found."
        );
      }

      if (
        account.status !==
        "active"
      ) {
        throw new Error(
          `Ledger account "${account.name}" is not active.`
        );
      }

      if (
        account.currency !==
        line.currency
      ) {
        throw new Error(
          `Currency mismatch for ledger account "${account.name}".`
        );
      }
    }

    /* =====================================================
       BALANCE CHECK
    ====================================================== */

    const debitTotal =
      addDecimalStrings(
        normalizedLines
          .filter(
            (
              line
            ) =>
              line.direction ===
              "debit"
          )
          .map(
            (
              line
            ) =>
              line.amount
          )
      );

    const creditTotal =
      addDecimalStrings(
        normalizedLines
          .filter(
            (
              line
            ) =>
              line.direction ===
              "credit"
          )
          .map(
            (
              line
            ) =>
              line.amount
          )
      );

    if (
      compareDecimalStrings(
        debitTotal,
        creditTotal
      ) !== 0
    ) {
      throw new Error(
        `Unbalanced ledger entry. Debit=${debitTotal}, Credit=${creditTotal}.`
      );
    }

    if (
      compareDecimalStrings(
        debitTotal,
        "0"
      ) <= 0
    ) {
      throw new Error(
        "Ledger posting total must be greater than zero."
      );
    }

    /* =====================================================
       ENTRY GROUP
    ====================================================== */

    const entryGroupId =
      generateId(
        "ledgrp"
      );

    /* =====================================================
       CREATE ENTRIES
    ====================================================== */

    const documents =
      normalizedLines.map(
        (
          line
        ) => ({
          entryId:
            generateId(
              "led"
            ),

          entryGroupId,

          accountId:
            new mongoose.Types.ObjectId(
              line.accountId
            ),

          direction:
            line.direction,

          amount:
            mongoose.Types.Decimal128.fromString(
              line.amount
            ),

          currency:
            line.currency,

          referenceType,

          referenceId:
            referenceId.trim(),

          description:
            line.description,

          idempotencyKey:
            idempotencyKey?.trim() ||
            undefined,

          metadata:
            line.metadata,

          status:
            "posted",

          effectiveAt,
        })
      );

    /*
     * insertMany preserves all ledger lines as one
     * application-level posting.
     *
     * For production-critical money movement this
     * should be executed inside a MongoDB transaction
     * session with the surrounding payment operation.
     */
    const created =
      await LedgerEntry.insertMany(
        documents,
        {
          session,
          ordered:
            true,
        }
      );

    return {
      entryGroupId,

      entries:
        created.map(
          (
            entry
          ) => ({
            entryId:
              entry.entryId,

            accountId:
              entry.accountId.toString(),

            direction:
              entry.direction,

            amount:
              entry.amount.toString(),

            currency:
              entry.currency,
          })
        ),

      totalDebit:
        debitTotal,

      totalCredit:
        creditTotal,
    };
  };

/* =========================================================
   REVERSE LEDGER GROUP
========================================================= */

export const reverseLedgerGroup =
  async (
    entryGroupId: string,
    session?: ClientSession
  ): Promise<PostLedgerResult> => {
    if (
      !entryGroupId?.trim()
    ) {
      throw new Error(
        "Ledger entry group ID is required."
      );
    }

    const existing =
      await LedgerEntry.find({
        entryGroupId:
          entryGroupId.trim(),
      })
        .session(
          session ?? null
        )
        .lean();

    if (
      existing.length ===
      0
    ) {
      throw new Error(
        "Ledger entry group not found."
      );
    }

    const posted =
      existing.filter(
        (
          entry
        ) =>
          entry.status ===
          "posted"
      );

    if (
      posted.length ===
      0
    ) {
      throw new Error(
        "Ledger entry group has already been reversed."
      );
    }

    /*
     * Create compensating entries.
     */
    const reversalGroupId =
      generateId(
        "ledgrp"
      );

    const referenceType =
      posted[0]
        .referenceType;

    const referenceId =
      posted[0]
        .referenceId;

    const reversalDocuments =
      posted.map(
        (
          entry
        ) => ({
          entryId:
            generateId(
              "led"
            ),

          entryGroupId:
            reversalGroupId,

          accountId:
            entry.accountId,

          /*
           * Reverse the direction.
           */
          direction:
            entry.direction ===
            "debit"
              ? "credit"
              : "debit",

          amount:
            entry.amount,

          currency:
            entry.currency,

          referenceType,

          referenceId,

          description:
            `Reversal of ledger group ${entryGroupId}`,

          status:
            "posted",

          effectiveAt:
            new Date(),
        })
      );

    const created =
      await LedgerEntry.insertMany(
        reversalDocuments,
        {
          session,
          ordered:
            true,
        }
      );

    /*
     * Mark the original entries reversed.
     */
    await LedgerEntry.updateMany(
      {
        entryGroupId:
          entryGroupId.trim(),

        status:
          "posted",
      },
      {
        $set: {
          status:
            "reversed",
        },
      },
      {
        session,
      }
    );

    const debitEntries =
      created.filter(
        (
          entry
        ) =>
          entry.direction ===
          "debit"
      );

    const creditEntries =
      created.filter(
        (
          entry
        ) =>
          entry.direction ===
          "credit"
      );

    return {
      entryGroupId:
        reversalGroupId,

      entries:
        created.map(
          (
            entry
          ) => ({
            entryId:
              entry.entryId,

            accountId:
              entry.accountId.toString(),

            direction:
              entry.direction,

            amount:
              entry.amount.toString(),

            currency:
              entry.currency,
          })
        ),

      totalDebit:
        addDecimalStrings(
          debitEntries.map(
            (
              entry
            ) =>
              entry.amount.toString()
          )
        ),

      totalCredit:
        addDecimalStrings(
          creditEntries.map(
            (
              entry
            ) =>
              entry.amount.toString()
          )
        ),
    };
  };