import crypto from "node:crypto";

import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payout,
  type PayoutMethod,
  type PayoutStatus,
} from "../models/Payout.js";

import {
  LedgerAccount,
  type ILedgerAccount,
} from "../models/LedgerAccount.js";

import {
  LedgerEntry,
} from "../models/LedgerEntry.js";

import {
  postBalancedLedger,
} from "./ledgerService.js";

/* =========================================================
   TYPES
========================================================= */

export interface CreateMerchantPayoutInput {
  ownerId: string;

  amount: unknown;

  currency?: unknown;

  payoutMethod: PayoutMethod;

  destination?: unknown;

  destinationReference?: unknown;

  merchantReference?: unknown;

  idempotencyKey?: unknown;
}

export interface ListMerchantPayoutsInput {
  ownerId: string;

  page?: unknown;

  limit?: unknown;

  search?: unknown;

  status?: unknown;

  payoutMethod?: unknown;

  from?: unknown;

  to?: unknown;
}

/* =========================================================
   CONSTANTS
========================================================= */

const PAYOUT_STATUSES:
  readonly PayoutStatus[] = [
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ];

const MAX_PAYOUT_AMOUNT =
  1_000_000_000;

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

function normalizeMoney(
  value: unknown,
  fieldName = "amount"
): number {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount >
      MAX_PAYOUT_AMOUNT
  ) {
    throw new Error(
      `${fieldName} must be greater than zero and within the supported limit.`
    );
  }

  return (
    Math.round(
      (
        amount +
        Number.EPSILON
      ) * 100
    ) / 100
  );
}

function toDecimal(
  value: number
): mongoose.Types.Decimal128 {
  return mongoose.Types.Decimal128.fromString(
    value.toFixed(2)
  );
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
    ) / multiplier
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

function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function parseDate(
  value: unknown,
  endOfDay = false
): Date | null {
  const normalized =
    normalizeText(
      value,
      30
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

function generatePayoutId(): string {
  return `payout_${Date.now().toString(36)}_${crypto
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
          "liveEnabled",
          "testEnabled",
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
   FIND MERCHANT PAYABLE ACCOUNT
========================================================= */

async function findMerchantPayableAccount(
  merchantId: mongoose.Types.ObjectId,
  currency: string
): Promise<
  ILedgerAccount | null
> {
  const expectedAccountCode =
    `merchant_payable_${merchantId.toString()}`;

  const exact =
    await LedgerAccount.findOne({
      accountCode:
        expectedAccountCode,

      ownerType:
        "merchant",

      ownerId:
        merchantId,

      accountType:
        "liability",

      currency,

      status:
        "active",
    }).lean();

  if (exact) {
    return exact;
  }

  /*
   * Fallback for older merchant payable accounts.
   */
  const fallback =
    await LedgerAccount.findOne({
      ownerType:
        "merchant",

      ownerId:
        merchantId,

      accountType:
        "liability",

      currency,

      status:
        "active",
    })
      .sort({
        createdAt: 1,
      })
      .lean();

  return fallback;
}

/* =========================================================
   GET MERCHANT PAYABLE BALANCE
========================================================= */

async function getMerchantPayableBalance(
  merchantId: mongoose.Types.ObjectId,
  currency: string,
  session?: mongoose.ClientSession
): Promise<{
  account:
    | ILedgerAccount
    | null;
  balance: number;
}> {
  const account =
    await findMerchantPayableAccount(
      merchantId,
      currency
    );

  if (!account) {
    return {
      account: null,
      balance: 0,
    };
  }

  const entriesQuery =
    LedgerEntry.find({
      accountId:
        account._id,
      currency,
      status:
        "posted",
    })
      .select(
        "direction amount"
      )
      .lean();

  if (session) {
    entriesQuery.session(
      session
    );
  }

  const entries =
    await entriesQuery.exec();

  let credits = 0;
  let debits = 0;

  for (const entry of entries) {
    const amount =
      decimalToNumber(
        entry.amount
      );

    if (
      entry.direction ===
      "credit"
    ) {
      credits += amount;
    } else {
      debits += amount;
    }
  }

  const balance =
    credits - debits;

  return {
    account,
    balance:
      roundNumber(
        Math.max(
          balance,
          0
        )
      ),
  };
}
/* =========================================================
   RESERVED / OPEN PAYOUT AMOUNT
========================================================= */

async function getOpenPayoutAmount(
  merchantId: mongoose.Types.ObjectId,
  currency: string
): Promise<number> {
  const result =
    await Payout.aggregate<{
      total: unknown;
    }>([
      {
        $match: {
          merchantId,

          currency,

          status: {
            $in: [
              "pending",
              "processing",
            ],
          },
        },
      },

      {
        $group: {
          _id: null,

          total: {
            $sum:
              "$amount",
          },
        },
      },
    ]);

  return roundNumber(
    decimalToNumber(
      result[0]?.total
    )
  );
}

/* =========================================================
   SERIALIZE PAYOUT
========================================================= */

function formatPayout(
  payout: Record<
    string,
    unknown
  >
) {
  return {
    id:
      String(
        payout._id
      ),

    payoutId:
      payout.payoutId,

    merchantId:
      payout.merchantId
        ? String(
            payout.merchantId
          )
        : null,

    amount:
      roundNumber(
        decimalToNumber(
          payout.amount
        )
      ),

    currency:
      payout.currency,

    feeAmount:
      roundNumber(
        decimalToNumber(
          payout.feeAmount
        )
      ),

    netAmount:
      roundNumber(
        decimalToNumber(
          payout.netAmount
        )
      ),

    payoutMethod:
      payout.payoutMethod,

    destination:
      payout.destination ??
      null,

    destinationReference:
      payout.destinationReference ??
      null,

    status:
      payout.status,

    merchantReference:
      payout.merchantReference ??
      null,

    externalReference:
      payout.externalReference ??
      null,

    failureReason:
      payout.failureReason ??
      null,

    ledgerEntryGroupId:
      payout.ledgerEntryGroupId ??
      null,

    requestedAt:
      payout.requestedAt,

    processingAt:
      payout.processingAt ??
      null,

    completedAt:
      payout.completedAt ??
      null,

    failedAt:
      payout.failedAt ??
      null,

    cancelledAt:
      payout.cancelledAt ??
      null,

    createdAt:
      payout.createdAt,

    updatedAt:
      payout.updatedAt,
  };
}

/* =========================================================
   CREATE MERCHANT PAYOUT REQUEST
========================================================= */

export async function createMerchantPayout(
  input: CreateMerchantPayoutInput
) {
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

  const amount =
    normalizeMoney(
      input.amount
    );

  const currency =
    normalizeCurrency(
      input.currency,
      merchant.defaultCurrency
    );

  const payoutMethod =
    input.payoutMethod;

  const validMethods:
    PayoutMethod[] = [
      "bank",
      "mobile_wallet",
      "wallet",
      "other",
    ];

  if (
    !validMethods.includes(
      payoutMethod
    )
  ) {
    throw new Error(
      "Invalid payout method."
    );
  }

  const idempotencyKey =
    normalizeText(
      input.idempotencyKey,
      200
    );

  /* -------------------------------------------------------
     IDEMPOTENCY
  ------------------------------------------------------- */

  if (idempotencyKey) {
    const existing =
      await Payout.findOne({
        merchantId:
          merchant._id,

        idempotencyKey,
      }).lean();

    if (existing) {
      return {
        duplicate: true,

        payout:
          formatPayout(
            existing as unknown as Record<
              string,
              unknown
            >
          ),
      };
    }
  }

  /* -------------------------------------------------------
     DESTINATION
  ------------------------------------------------------- */

  const destination =
    normalizeText(
      input.destination,
      200
    );

  const destinationReference =
    normalizeText(
      input.destinationReference,
      200
    );

  if (
    payoutMethod !==
      "wallet" &&
    !destinationReference
  ) {
    throw new Error(
      "Destination reference is required for this payout method."
    );
  }

  const merchantReference =
    normalizeText(
      input.merchantReference,
      150
    );

  /* -------------------------------------------------------
     FEE
  ------------------------------------------------------- */

  const feeAmount = 0;

  const netAmount =
    roundNumber(
      amount -
        feeAmount
    );

  /* -------------------------------------------------------
     AVAILABLE BALANCE
  ------------------------------------------------------- */

  const payable =
    await getMerchantPayableBalance(
      merchant._id,
      currency
    );

  if (!payable.account) {
    throw new Error(
      `Merchant payable ledger account not found for ${currency}.`
    );
  }

  const openPayoutAmount =
    await getOpenPayoutAmount(
      merchant._id,
      currency
    );

  const availableBalance =
    roundNumber(
      Math.max(
        payable.balance -
          openPayoutAmount,
        0
      )
    );

  if (
    netAmount >
    availableBalance
  ) {
    throw new Error(
      `Insufficient available balance. Available balance is ${availableBalance.toFixed(
        2
      )} ${currency}.`
    );
  }

  /* -------------------------------------------------------
     PAYOUT CREATE
  ------------------------------------------------------- */

  const payoutId =
    generatePayoutId();

  try {
    const payout =
      await Payout.create({
        payoutId,

        merchantId:
          merchant._id,

        amount:
          toDecimal(
            amount
          ),

        currency,

        feeAmount:
          toDecimal(
            feeAmount
          ),

        netAmount:
          toDecimal(
            netAmount
          ),

        payoutMethod,

        destination,

        destinationReference,

        status:
          "pending",

        merchantReference,

        idempotencyKey,

        requestedAt:
          new Date(),
      });

    return {
      duplicate: false,

      payout:
        formatPayout(
          payout.toObject() as unknown as Record<
            string,
            unknown
          >
        ),

      balance: {
        currency,

        currentBalance:
          payable.balance,

        reservedAmount:
          openPayoutAmount +
          netAmount,

        availableAfterRequest:
          roundNumber(
            availableBalance -
              netAmount
          ),
      },
    };
  } catch (
    error: unknown
  ) {
    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000 &&
      idempotencyKey
    ) {
      const duplicate =
        await Payout.findOne({
          merchantId:
            merchant._id,

          idempotencyKey,
        }).lean();

      if (duplicate) {
        return {
          duplicate: true,

          payout:
            formatPayout(
              duplicate as unknown as Record<
                string,
                unknown
              >
            ),
        };
      }
    }

    throw error;
  }
}

/* =========================================================
   LIST MERCHANT PAYOUTS
========================================================= */

export async function listMerchantPayouts(
  input: ListMerchantPayoutsInput
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
    PAYOUT_STATUSES.includes(
      input.status as PayoutStatus
    )
      ? (
          input.status as PayoutStatus
        )
      : undefined;

  const payoutMethod =
    normalizeText(
      input.payoutMethod,
      50
    );

  const fromDate =
    parseDate(
      input.from
    );

  const toDate =
    parseDate(
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

  if (payoutMethod) {
    filter.payoutMethod =
      payoutMethod;
  }

  if (
    fromDate ||
    toDate
  ) {
    const requestedAt:
      Record<
        string,
        Date
      > = {};

    if (fromDate) {
      requestedAt.$gte =
        fromDate;
    }

    if (toDate) {
      requestedAt.$lte =
        toDate;
    }

    filter.requestedAt =
      requestedAt;
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
        payoutId:
          regex,
      },

      {
        merchantReference:
          regex,
      },

      {
        externalReference:
          regex,
      },

      {
        destination:
          regex,
      },
    ];
  }

  /* -------------------------------------------------------
     COUNT
  ------------------------------------------------------- */

  const total =
    await Payout.countDocuments(
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

  /* -------------------------------------------------------
     PAYOUTS
  ------------------------------------------------------- */

  const payouts =
    await Payout.find(
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
          limit
      )
      .limit(
        limit
      )
      .lean();

  /* -------------------------------------------------------
     SUMMARY
  ------------------------------------------------------- */

  const summaryResult =
    await Payout.aggregate<{
      total: number;

      pending: number;

      processing: number;

      completed: number;

      failed: number;

      cancelled: number;

      totalAmount: unknown;

      pendingAmount: unknown;

      completedAmount: unknown;
    }>([
      {
        $match: {
          merchantId:
            merchant._id,
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

          completed: {
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

          totalAmount: {
            $sum:
              "$amount",
          },

          pendingAmount: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$status",
                    [
                      "pending",
                      "processing",
                    ],
                  ],
                },

                "$amount",

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

                "$netAmount",

                0,
              ],
            },
          },
        },
      },
    ]);

  const summary =
    summaryResult[0];

  const payable =
    await getMerchantPayableBalance(
      merchant._id,
      merchant.defaultCurrency
    );

  const openPayoutAmount =
    await getOpenPayoutAmount(
      merchant._id,
      merchant.defaultCurrency
    );

  const availableBalance =
    payable.account
      ? roundNumber(
          Math.max(
            payable.balance -
              openPayoutAmount,
            0
          )
        )
      : 0;

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

    payouts:
      payouts.map(
        (
          payout
        ) =>
          formatPayout(
            payout as unknown as Record<
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

      completed:
        summary?.completed ??
        0,

      failed:
        summary?.failed ??
        0,

      cancelled:
        summary?.cancelled ??
        0,

      totalAmount:
        roundNumber(
          decimalToNumber(
            summary?.totalAmount
          )
        ),

      pendingAmount:
        roundNumber(
          decimalToNumber(
            summary?.pendingAmount
          )
        ),

      completedAmount:
        roundNumber(
          decimalToNumber(
            summary?.completedAmount
          )
        ),
    },

    balance: {
      currency:
        merchant.defaultCurrency,

      ledgerBalance:
        payable.balance,

      reservedAmount:
        openPayoutAmount,

      availableBalance,
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

      payoutMethod:
        payoutMethod ||
        null,

      from:
        normalizeText(
          input.from,
          30
        ) || null,

      to:
        normalizeText(
          input.to,
          30
        ) || null,
    },
  };
}

/* =========================================================
   GET MERCHANT PAYOUT
========================================================= */

export async function getMerchantPayout(
  ownerId: string,
  payoutIdValue: string
) {
  const merchant =
    await findMerchantForOwner(
      ownerId
    );

  const payoutId =
    normalizeText(
      payoutIdValue,
      120
    );

  if (!payoutId) {
    throw new Error(
      "Payout ID is required."
    );
  }

  const payout =
    await Payout.findOne({
      payoutId,

      merchantId:
        merchant._id,
    }).lean();

  if (!payout) {
    throw new Error(
      "Payout not found."
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

    payout:
      formatPayout(
        payout as unknown as Record<
          string,
          unknown
        >
      ),
  };
}

/* =========================================================
   PROCESS PAYOUT
   INTERNAL-SIDE LOGIC
========================================================= */

/* =========================================================
   PROCESS PAYOUT
   INTERNAL-SIDE LOGIC

   IMPORTANT:
   - Atomic payout claiming
   - MongoDB transaction
   - Ledger + payout state commit together
   - Prevents concurrent double processing
========================================================= */

export async function processMerchantPayout(
  payoutId: string
) {
  const normalizedPayoutId =
    normalizeText(
      payoutId,
      120
    );

  if (!normalizedPayoutId) {
    throw new Error(
      "Payout ID is required."
    );
  }

  const session =
    await mongoose.startSession();

  try {
    let finalResult:
      | {
          duplicate: boolean;
          payout: ReturnType<
            typeof formatPayout
          >;
          ledger?: Awaited<
            ReturnType<
              typeof postBalancedLedger
            >
          >;
        }
      | null = null;

    await session.withTransaction(
      async () => {
        /* =================================================
           LOAD PAYOUT INSIDE TRANSACTION
        ================================================= */

        const payout =
          await Payout.findOne({
            payoutId:
              normalizedPayoutId,
          }).session(session);

        if (!payout) {
          throw new Error(
            "Payout not found."
          );
        }

        /* =================================================
           ALREADY COMPLETED
        ================================================= */

        if (
          payout.status ===
          "completed"
        ) {
          finalResult = {
            duplicate: true,

            payout:
              formatPayout(
                payout.toObject() as unknown as Record<
                  string,
                  unknown
                >
              ),
          };

          return;
        }

        /* =================================================
           ATOMIC CLAIM

           Only pending payout can be claimed.

           A second concurrent worker will not be able
           to update the same payout from pending again.
        ================================================= */

        if (
          payout.status ===
          "pending"
        ) {
          const claim =
            await Payout.updateOne(
              {
                _id:
                  payout._id,

                status:
                  "pending",
              },
              {
                $set: {
                  status:
                    "processing",

                  processingAt:
                    new Date(),
                },
              },
              {
                session,
              }
            );

          if (
            claim.modifiedCount !==
            1
          ) {
            throw new Error(
              "Payout is already being processed."
            );
          }

          /*
           * Refresh the in-memory document
           * after the atomic claim.
           */
          payout.status =
            "processing";

          payout.processingAt =
            new Date();
        }

        /* =================================================
           PROCESSING PAYOUT

           Another worker may have claimed it already.
        ================================================= */

        if (
          payout.status !==
          "processing"
        ) {
          throw new Error(
            `Payout cannot be processed from status "${payout.status}".`
          );
        }

        /* =================================================
           MERCHANT
        ================================================= */

        const merchant =
          await Merchant.findById(
            payout.merchantId
          )
            .select(
              "_id status defaultCurrency"
            )
            .session(
              session
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

        const currency =
          payout.currency;

        /* =================================================
           PAYABLE ACCOUNT + BALANCE
        ================================================= */

        const payable =
          await getMerchantPayableBalance(
            merchant._id,
            currency,
            session
          );

        if (!payable.account) {
          throw new Error(
            `Merchant payable ledger account not found for ${currency}.`
          );
        }

        const merchantPayableBalance =
          payable.balance;

        const payoutAmount =
          decimalToNumber(
            payout.netAmount
          );

        if (
          payoutAmount <= 0
        ) {
          throw new Error(
            "Payout amount must be greater than zero."
          );
        }

        if (
          payoutAmount >
          merchantPayableBalance
        ) {
          throw new Error(
            "Merchant payable balance is insufficient for this payout."
          );
        }

        /* =================================================
           PLATFORM CASH ACCOUNT
        ================================================= */

        const platformCashAccountCode =
          `platform_cash_${currency.toLowerCase()}`;

        let platformCashAccount =
          await LedgerAccount.findOne({
            accountCode:
              platformCashAccountCode,

            ownerType:
              "platform",

            accountType:
              "asset",

            currency,

            status:
              "active",
          })
            .session(
              session
            )
            .exec();

        if (!platformCashAccount) {
          try {
            platformCashAccount =
              await LedgerAccount.create(
                [
                  {
                    accountCode:
                      platformCashAccountCode,

                    name:
                      `Platform Cash ${currency}`,

                    accountType:
                      "asset",

                    ownerType:
                      "platform",

                    currency,

                    status:
                      "active",
                  },
                ],
                {
                  session,
                }
              ).then(
                (
                  documents
                ) =>
                  documents[0]
              );
          } catch (
            accountError: unknown
          ) {
            /*
             * Another concurrent operation may have
             * created the same platform account.
             *
             * Reload it rather than failing the payout.
             */
            if (
              typeof accountError ===
                "object" &&
              accountError !== null &&
              "code" in
                accountError &&
              accountError.code ===
                11000
            ) {
              platformCashAccount =
                await LedgerAccount.findOne(
                  {
                    accountCode:
                      platformCashAccountCode,

                    ownerType:
                      "platform",

                    accountType:
                      "asset",

                    currency,

                    status:
                      "active",
                  }
                )
                  .session(
                    session
                  )
                  .exec();
            } else {
              throw accountError;
            }
          }
        }

        if (
          !platformCashAccount
        ) {
          throw new Error(
            `Platform cash ledger account not found for ${currency}.`
          );
        }

        /* =================================================
           LEDGER POSTING

           Merchant payable liability decreases:
             DEBIT merchant payable

           Platform cash asset decreases:
             CREDIT platform cash
        ================================================= */

        const ledgerResult =
          await postBalancedLedger({
            referenceType:
              "payout",

            referenceId:
              payout.payoutId,

            lines: [
              {
                accountId:
                  payable.account._id.toString(),

                direction:
                  "debit",

                amount:
                  payoutAmount.toFixed(
                    2
                  ),

                currency,

                description:
                  `Merchant payout ${payout.payoutId}`,

                metadata: {
                  payoutId:
                    payout.payoutId,

                  merchantId:
                    merchant._id.toString(),

                  paymentSource:
                    "merchant_payout",
                },
              },

              {
                accountId:
                  platformCashAccount._id.toString(),

                direction:
                  "credit",

                amount:
                  payoutAmount.toFixed(
                    2
                  ),

                currency,

                description:
                  `Cash disbursement for merchant payout ${payout.payoutId}`,

                metadata: {
                  payoutId:
                    payout.payoutId,

                  merchantId:
                    merchant._id.toString(),

                  paymentSource:
                    "merchant_payout",
                },
              },
            ],

            idempotencyKey:
              `payout_ledger_${payout.payoutId}`,

            description:
              `Payout ${payout.payoutId}`,

            effectiveAt:
              new Date(),

            session,
          });

        /* =================================================
           COMPLETE PAYOUT

           Both payout state and ledger posting are inside
           the same MongoDB transaction.
        ================================================= */

        payout.status =
          "completed";

        payout.completedAt =
          new Date();

        payout.ledgerEntryGroupId =
          ledgerResult.entryGroupId;

        await payout.save({
          session,
        });

        finalResult = {
          duplicate: false,

          payout:
            formatPayout(
              payout.toObject() as unknown as Record<
                string,
                unknown
              >
            ),

          ledger:
            ledgerResult,
        };
      }
    );

    if (!finalResult) {
      throw new Error(
        "Payout processing produced no result."
      );
    }

    return finalResult;
  } finally {
    await session.endSession();
  }
}