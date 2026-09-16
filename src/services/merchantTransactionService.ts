import mongoose from "mongoose";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  LedgerAccount,
} from "../models/LedgerAccount.js";

import {
  LedgerEntry,
  type LedgerEntryDirection,
  type LedgerEntryStatus,
  type LedgerReferenceType,
} from "../models/LedgerEntry.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  Refund,
} from "../models/Refund.js";

import {
  Payout,
} from "../models/Payout.js";

/* =========================================================
   TYPES
========================================================= */

export type MerchantTransactionType =
  | "PAYMENT"
  | "REFUND"
  | "PAYOUT"
  | "FEE"
  | "ADJUSTMENT"
  | "REVERSAL";

export type MerchantTransactionDirection =
  | "CREDIT"
  | "DEBIT";

export type MerchantTransactionStatus =
  | "POSTED"
  | "REVERSED";

export interface MerchantTransactionListInput {
  ownerId: string;

  page?: unknown;

  limit?: unknown;

  search?: unknown;

  status?: unknown;

  type?: unknown;

  direction?: unknown;

  currency?: unknown;

  from?: unknown;

  to?: unknown;
}

export interface MerchantTransactionRow {
  transactionId: string;

  entryGroupId: string;

  type:
    MerchantTransactionType;

  direction:
    MerchantTransactionDirection;

  amount: number;

  balanceImpact: number;

  currency: string;

  status:
    MerchantTransactionStatus;

  referenceType:
    LedgerReferenceType;

  referenceId: string;

  paymentId:
    string | null;

  refundId:
    string | null;

  payoutId:
    string | null;

  merchantReference:
    string | null;

  provider:
    string | null;

  sourceType:
    string | null;

  mode:
    string | null;

  sourceStatus:
    string | null;

  description:
    string | null;

  metadata:
    Record<
      string,
      unknown
    > | null;

  isReversal:
    boolean;

  effectiveAt:
    Date;

  createdAt:
    Date;
}

/* =========================================================
   ERRORS
========================================================= */

export type MerchantTransactionErrorCode =
  | "INVALID_REQUEST"
  | "MERCHANT_NOT_FOUND"
  | "TRANSACTION_NOT_FOUND";

export class MerchantTransactionError
  extends Error {
  constructor(
    message: string,

    readonly statusCode:
      number,

    readonly code:
      MerchantTransactionErrorCode
  ) {
    super(
      message
    );

    this.name =
      "MerchantTransactionError";
  }
}

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_LIMIT =
  20;

const MAX_LIMIT =
  100;

const REVERSAL_PREFIX =
  "Reversal of ledger group ";

const MERCHANT_REFERENCE_TYPES:
  LedgerReferenceType[] = [
    "payment",
    "refund",
    "payout",
    "fee",
    "adjustment",
  ];

const MERCHANT_TRANSACTION_TYPES:
  MerchantTransactionType[] = [
    "PAYMENT",
    "REFUND",
    "PAYOUT",
    "FEE",
    "ADJUSTMENT",
    "REVERSAL",
  ];

const MERCHANT_TRANSACTION_DIRECTIONS:
  MerchantTransactionDirection[] = [
    "CREDIT",
    "DEBIT",
  ];

const MERCHANT_TRANSACTION_STATUSES:
  MerchantTransactionStatus[] = [
    "POSTED",
    "REVERSED",
  ];

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown,
  maxLength = 200
): string | undefined {
  if (
    typeof value !==
    "string"
  ) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (
    !normalized
  ) {
    return undefined;
  }

  return normalized.slice(
    0,
    maxLength
  );
}

function normalizePositiveInteger(
  value: unknown,

  fallback: number,

  maximum:
    number
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      1
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(
      parsed
    ),
    maximum
  );
}

function normalizeCurrency(
  value: unknown,
  fallback: string
): string {
  const currency =
    (
      normalizeText(
        value,
        3
      ) ||
      fallback
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency
    )
  ) {
    throw new MerchantTransactionError(
      "Currency must be a valid three-letter code.",
      400,
      "INVALID_REQUEST"
    );
  }

  return currency;
}

function parseDate(
  value: unknown,
  endOfDay =
    false
): Date | undefined {
  const text =
    normalizeText(
      value,
      40
    );

  if (
    !text
  ) {
    return undefined;
  }

  const date =
    new Date(
      text
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new MerchantTransactionError(
      "Invalid date filter.",
      400,
      "INVALID_REQUEST"
    );
  }

  if (
    endOfDay
  ) {
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
    value ===
      undefined
  ) {
    return 0;
  }

  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  try {
    const numeric =
      Number(
        String(
          value
        )
      );

    return Number.isFinite(
      numeric
    )
      ? numeric
      : 0;
  } catch {
    return 0;
  }
}

function roundMoney(
  value: number
): number {
  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        100
    ) /
    100
  );
}

function escapeRegExp(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function isReversalDescription(
  value?: string | null
): boolean {
  return Boolean(
    value?.startsWith(
      REVERSAL_PREFIX
    )
  );
}

function readMetadataString(
  metadata:
    Record<
      string,
      unknown
    > | undefined,

  key:
    string
): string | null {
  if (
    !metadata
  ) {
    return null;
  }

  const value =
    metadata[
      key
    ];

  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function getTransactionType(
  entry: {
    referenceType:
      LedgerReferenceType;

    description?:
      string;
  }
): MerchantTransactionType {
  if (
    isReversalDescription(
      entry.description
    )
  ) {
    return "REVERSAL";
  }

  switch (
    entry.referenceType
  ) {
    case "payment":
      return "PAYMENT";

    case "refund":
      return "REFUND";

    case "payout":
      return "PAYOUT";

    case "fee":
      return "FEE";

    case "adjustment":
      return "ADJUSTMENT";

    default:
      return "ADJUSTMENT";
  }
}

function getBalanceImpact(
  direction:
    LedgerEntryDirection,

  amount:
    number
): number {
  return roundMoney(
    direction ===
      "credit"
      ? amount
      : -amount
  );
}

/* =========================================================
   MERCHANT
========================================================= */

async function getMerchantByOwner(
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
    throw new MerchantTransactionError(
      "Merchant owner is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  if (
    !mongoose.isValidObjectId(
      normalizedOwnerId
    )
  ) {
    throw new MerchantTransactionError(
      "Invalid merchant owner ID.",
      400,
      "INVALID_REQUEST"
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
          "defaultCurrency",
          "status",
          "verificationStatus",
        ].join(
          " "
        )
      )
      .lean();

  if (
    !merchant
  ) {
    throw new MerchantTransactionError(
      "Merchant account not found.",
      404,
      "MERCHANT_NOT_FOUND"
    );
  }

  /*
   * Read-only financial history remains available
   * even if a merchant account is suspended or
   * otherwise not active.
   *
   * We intentionally do not block transaction history
   * based on merchant.status.
   */

  return merchant;
}

/* =========================================================
   MERCHANT PAYABLE ACCOUNTS
========================================================= */

async function getMerchantLedgerAccounts(
  merchantId:
    mongoose.Types.ObjectId,

  currency?:
    string
) {
  const merchantIdText =
    merchantId.toString();

  /*
   * Current wallet payment service:
   *
   * merchant:payable:<merchantId>
   *
   * Older payout/service code may also expect:
   *
   * merchant_payable_<merchantId>
   */
  const knownAccountCodes =
    [
      `merchant:payable:${merchantIdText}`,
      `merchant_payable_${merchantIdText}`,
    ].map(
      (
        value
      ) =>
        value.toLowerCase()
    );

  const exactFilter:
    Record<
      string,
      unknown
    > = {
    ownerType:
      "merchant",

    ownerId:
      merchantId,

    accountType:
      "liability",

    accountCode: {
      $in:
        knownAccountCodes,
    },
  };

  if (
    currency
  ) {
    exactFilter.currency =
      currency;
  }

  const exactAccounts =
    await LedgerAccount.find(
      exactFilter
    )
      .sort({
        createdAt:
          1,
      })
      .lean();

  if (
    exactAccounts.length >
    0
  ) {
    return exactAccounts;
  }

  /*
   * Compatibility fallback.
   *
   * This preserves existing merchant payable accounts
   * that may have been created before account-code
   * naming was standardized.
   */
  const fallbackFilter:
    Record<
      string,
      unknown
    > = {
    ownerType:
      "merchant",

    ownerId:
      merchantId,

    accountType:
      "liability",
  };

  if (
    currency
  ) {
    fallbackFilter.currency =
      currency;
  }

  return LedgerAccount.find(
    fallbackFilter
  )
    .sort({
      createdAt:
        1,
    })
    .lean();
}

/* =========================================================
   SEARCH REFERENCE IDS
========================================================= */

async function getSearchReferenceIds(
  merchantId:
    mongoose.Types.ObjectId,

  search:
    string
): Promise<string[]> {
  const regex =
    new RegExp(
      escapeRegExp(
        search
      ),
      "i"
    );

  const [
    payments,
    refunds,
    payouts,
  ] =
    await Promise.all([
      Payment.find({
        merchantId,

        $or: [
          {
            paymentId:
              regex,
          },

          {
            merchantReference:
              regex,
          },

          {
            providerPaymentId:
              regex,
          },
        ],
      })
        .select(
          "paymentId"
        )
        .limit(
          100
        )
        .lean(),

      Refund.find({
        merchantId,

        $or: [
          {
            refundId:
              regex,
          },

          {
            paymentReference:
              regex,
          },

          {
            merchantReference:
              regex,
          },
        ],
      })
        .select(
          "refundId"
        )
        .limit(
          100
        )
        .lean(),

      Payout.find({
        merchantId,

        $or: [
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
        ],
      })
        .select(
          "payoutId"
        )
        .limit(
          100
        )
        .lean(),
    ]);

  const values =
    new Set<string>();

  for (
    const payment of
      payments
  ) {
    values.add(
      payment.paymentId
    );
  }

  for (
    const refund of
      refunds
  ) {
    values.add(
      refund.refundId
    );
  }

  for (
    const payout of
      payouts
  ) {
    values.add(
      payout.payoutId
    );
  }

  return [
    ...values,
  ];
}

/* =========================================================
   FILTER BUILDER
========================================================= */

async function buildLedgerFilter({
  merchantId,
  accountIds,
  currency,
  search,
  status,
  type,
  direction,
  from,
  to,
}: {
  merchantId:
    mongoose.Types.ObjectId;

  accountIds:
    mongoose.Types.ObjectId[];

  currency:
    string;

  search?:
    string;

  status?:
    MerchantTransactionStatus;

  type?:
    MerchantTransactionType;

  direction?:
    MerchantTransactionDirection;

  from?:
    Date;

  to?:
    Date;
}): Promise<
  Record<
    string,
    unknown
  >
> {
  const filter:
    Record<
      string,
      unknown
    > = {
    accountId: {
      $in:
        accountIds,
    },

    currency,

    referenceType: {
      $in:
        MERCHANT_REFERENCE_TYPES,
    },
  };

  if (
    status
  ) {
    filter.status =
      status.toLowerCase();
  }

  if (
    direction
  ) {
    filter.direction =
      direction.toLowerCase();
  }

  if (
    from ||
    to
  ) {
    filter.effectiveAt = {
      ...(from
        ? {
            $gte:
              from,
          }
        : {}),

      ...(to
        ? {
            $lte:
              to,
          }
        : {}),
    };
  }

  if (
    type
  ) {
    if (
      type ===
      "REVERSAL"
    ) {
      filter.description =
        new RegExp(
          `^${escapeRegExp(
            REVERSAL_PREFIX
          )}`,
          "i"
        );
    } else {
      const referenceTypeMap:
        Record<
          Exclude<
            MerchantTransactionType,
            "REVERSAL"
          >,
          LedgerReferenceType
        > = {
        PAYMENT:
          "payment",

        REFUND:
          "refund",

        PAYOUT:
          "payout",

        FEE:
          "fee",

        ADJUSTMENT:
          "adjustment",
      };

      filter.referenceType =
        referenceTypeMap[
          type
        ];

      /*
       * Reversal entries keep the same source
       * referenceType as the original entry.
       *
       * Exclude those when filtering for a normal
       * PAYMENT / REFUND / PAYOUT / etc.
       */
      filter.description = {
        $not:
          new RegExp(
            `^${escapeRegExp(
              REVERSAL_PREFIX
            )}`,
            "i"
          ),
      };
    }
  }

  if (
    search
  ) {
    const regex =
      new RegExp(
        escapeRegExp(
          search
        ),
        "i"
      );

    const matchingReferenceIds =
      await getSearchReferenceIds(
        merchantId,
        search
      );

    const searchConditions:
      Record<
        string,
        unknown
      >[] = [
      {
        entryId:
          regex,
      },

      {
        entryGroupId:
          regex,
      },

      {
        referenceId:
          regex,
      },

      {
        description:
          regex,
      },

      {
        idempotencyKey:
          regex,
      },
    ];

    if (
      matchingReferenceIds.length >
      0
    ) {
      searchConditions.push({
        referenceId: {
          $in:
            matchingReferenceIds,
        },
      });
    }

    filter.$or =
      searchConditions;
  }

  return filter;
}

/* =========================================================
   RELATED DOMAIN DATA
========================================================= */

interface RelatedData {
  paymentMap:
    Map<
      string,
      {
        paymentId:
          string;

        merchantReference?:
          string;

        provider:
          string;

        sourceType:
          string;

        mode:
          string;

        status:
          string;
      }
    >;

  refundMap:
    Map<
      string,
      {
        refundId:
          string;

        paymentReference:
          string;

        merchantReference?:
          string;

        mode:
          string;

        status:
          string;
      }
    >;

  payoutMap:
    Map<
      string,
      {
        payoutId:
          string;

        merchantReference?:
          string;

        payoutMethod:
          string;

        status:
          string;
      }
    >;
}

async function loadRelatedData(
  merchantId:
    mongoose.Types.ObjectId,

  entries:
    Array<{
      referenceType:
        LedgerReferenceType;

      referenceId:
        string;
    }>
): Promise<RelatedData> {
  const paymentIds =
    new Set<string>();

  const refundIds =
    new Set<string>();

  const payoutIds =
    new Set<string>();

  for (
    const entry of
      entries
  ) {
    if (
      entry.referenceType ===
      "payment"
    ) {
      paymentIds.add(
        entry.referenceId
      );
    }

    if (
      entry.referenceType ===
      "refund"
    ) {
      refundIds.add(
        entry.referenceId
      );
    }

    if (
      entry.referenceType ===
      "payout"
    ) {
      payoutIds.add(
        entry.referenceId
      );
    }
  }

  const [
    payments,
    refunds,
    payouts,
  ] =
    await Promise.all([
      paymentIds.size
        ? Payment.find({
            merchantId,

            paymentId: {
              $in: [
                ...paymentIds,
              ],
            },
          })
            .select(
              [
                "paymentId",
                "merchantReference",
                "provider",
                "sourceType",
                "mode",
                "status",
              ].join(
                " "
              )
            )
            .lean()
        : [],

      refundIds.size
        ? Refund.find({
            merchantId,

            refundId: {
              $in: [
                ...refundIds,
              ],
            },
          })
            .select(
              [
                "refundId",
                "paymentReference",
                "merchantReference",
                "mode",
                "status",
              ].join(
                " "
              )
            )
            .lean()
        : [],

      payoutIds.size
        ? Payout.find({
            merchantId,

            payoutId: {
              $in: [
                ...payoutIds,
              ],
            },
          })
            .select(
              [
                "payoutId",
                "merchantReference",
                "payoutMethod",
                "status",
              ].join(
                " "
              )
            )
            .lean()
        : [],
    ]);

  const paymentMap =
    new Map(
      payments.map(
        (
          payment
        ) => [
          payment.paymentId,

          {
            paymentId:
              payment.paymentId,

            merchantReference:
              payment.merchantReference,

            provider:
              payment.provider,

            sourceType:
              payment.sourceType,

            mode:
              payment.mode,

            status:
              payment.status,
          },
        ]
      )
    );

  const refundMap =
    new Map(
      refunds.map(
        (
          refund
        ) => [
          refund.refundId,

          {
            refundId:
              refund.refundId,

            paymentReference:
              refund.paymentReference,

            merchantReference:
              refund.merchantReference,

            mode:
              refund.mode,

            status:
              refund.status,
          },
        ]
      )
    );

  const payoutMap =
    new Map(
      payouts.map(
        (
          payout
        ) => [
          payout.payoutId,

          {
            payoutId:
              payout.payoutId,

            merchantReference:
              payout.merchantReference,

            payoutMethod:
              payout.payoutMethod,

            status:
              payout.status,
          },
        ]
      )
    );

  return {
    paymentMap,
    refundMap,
    payoutMap,
  };
}

/* =========================================================
   ROW MAPPER
========================================================= */

function mapLedgerEntryToTransaction(
  entry: {
    entryId:
      string;

    entryGroupId:
      string;

    direction:
      LedgerEntryDirection;

    amount:
      mongoose.Types.Decimal128;

    currency:
      string;

    referenceType:
      LedgerReferenceType;

    referenceId:
      string;

    description?:
      string;

    metadata?:
      Record<
        string,
        unknown
      >;

    status:
      LedgerEntryStatus;

    effectiveAt:
      Date;

    createdAt:
      Date;
  },

  related:
    RelatedData
): MerchantTransactionRow {
  const amount =
    roundMoney(
      decimalToNumber(
        entry.amount
      )
    );

  const type =
    getTransactionType(
      entry
    );

  const payment =
    entry.referenceType ===
    "payment"
      ? related.paymentMap.get(
          entry.referenceId
        )
      : undefined;

  const refund =
    entry.referenceType ===
    "refund"
      ? related.refundMap.get(
          entry.referenceId
        )
      : undefined;

  const payout =
    entry.referenceType ===
    "payout"
      ? related.payoutMap.get(
          entry.referenceId
        )
      : undefined;

  const metadataPaymentId =
    readMetadataString(
      entry.metadata,
      "paymentId"
    );

  const paymentId =
    payment?.paymentId ??
    refund?.paymentReference ??
    metadataPaymentId ??
    (
      entry.referenceType ===
      "payment"
        ? entry.referenceId
        : null
    );

  const refundId =
    entry.referenceType ===
    "refund"
      ? entry.referenceId
      : readMetadataString(
          entry.metadata,
          "refundId"
        );

  const payoutId =
    entry.referenceType ===
    "payout"
      ? entry.referenceId
      : readMetadataString(
          entry.metadata,
          "payoutId"
        );

  return {
    transactionId:
      entry.entryId,

    entryGroupId:
      entry.entryGroupId,

    type,

    direction:
      entry.direction ===
      "credit"
        ? "CREDIT"
        : "DEBIT",

    amount,

    balanceImpact:
      getBalanceImpact(
        entry.direction,
        amount
      ),

    currency:
      entry.currency,

    status:
      entry.status ===
      "reversed"
        ? "REVERSED"
        : "POSTED",

    referenceType:
      entry.referenceType,

    referenceId:
      entry.referenceId,

    paymentId,

    refundId,

    payoutId,

    merchantReference:
      payment?.merchantReference ??
      refund?.merchantReference ??
      payout?.merchantReference ??
      readMetadataString(
        entry.metadata,
        "merchantReference"
      ),

    provider:
      payment?.provider ??
      null,

    sourceType:
      payment?.sourceType ??
      (
        payout
          ? payout.payoutMethod
          : null
      ),

    mode:
      payment?.mode ??
      refund?.mode ??
      null,

    sourceStatus:
      payment?.status ??
      refund?.status ??
      payout?.status ??
      null,

    description:
      entry.description ??
      null,

    metadata:
      entry.metadata ??
      null,

    isReversal:
      type ===
      "REVERSAL",

    effectiveAt:
      entry.effectiveAt,

    createdAt:
      entry.createdAt,
  };
}

/* =========================================================
   SUMMARY
========================================================= */

async function getMerchantLedgerSummary({
  merchantId,
  accountIds,
  currency,
}: {
  merchantId:
    mongoose.Types.ObjectId;

  accountIds:
    mongoose.Types.ObjectId[];

  currency:
    string;
}) {
  const result =
    await LedgerEntry.aggregate<{
      transactionCount:
        number;

      postedCount:
        number;

      reversedCount:
        number;

      reversalCount:
        number;

      totalCredits:
        unknown;

      totalDebits:
        unknown;

      ledgerBalance:
        unknown;

      paymentNetImpact:
        unknown;

      refundNetImpact:
        unknown;

      payoutNetImpact:
        unknown;

      feeNetImpact:
        unknown;

      adjustmentNetImpact:
        unknown;

      paymentCredits:
        unknown;

      refundDebits:
        unknown;

      payoutDebits:
        unknown;

      feeDebits:
        unknown;
    }>([
      {
        $match: {
          accountId: {
            $in:
              accountIds,
          },

          currency,

          referenceType: {
            $in:
              MERCHANT_REFERENCE_TYPES,
          },

          /*
           * IMPORTANT:
           *
           * reverseLedgerGroup() marks the original entry
           * as "reversed" AND creates an opposite posted
           * entry.
           *
           * Both sides must therefore be included when
           * calculating actual ledger position.
           */
          status: {
            $in: [
              "posted",
              "reversed",
            ],
          },
        },
      },

      {
        $group: {
          _id:
            null,

          transactionCount: {
            $sum:
              1,
          },

          postedCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "posted",
                  ],
                },

                1,

                0,
              ],
            },
          },

          reversedCount: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "reversed",
                  ],
                },

                1,

                0,
              ],
            },
          },

          reversalCount: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: {
                      $ifNull: [
                        "$description",
                        "",
                      ],
                    },

                    regex:
                      "^Reversal of ledger group ",
                  },
                },

                1,

                0,
              ],
            },
          },

          totalCredits: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$direction",
                    "credit",
                  ],
                },

                "$amount",

                0,
              ],
            },
          },

          totalDebits: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$direction",
                    "debit",
                  ],
                },

                "$amount",

                0,
              ],
            },
          },

          ledgerBalance: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$direction",
                    "credit",
                  ],
                },

                "$amount",

                {
                  $multiply: [
                    "$amount",
                    -1,
                  ],
                },
              ],
            },
          },

          paymentNetImpact: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$referenceType",
                    "payment",
                  ],
                },

                {
                  $cond: [
                    {
                      $eq: [
                        "$direction",
                        "credit",
                      ],
                    },

                    "$amount",

                    {
                      $multiply: [
                        "$amount",
                        -1,
                      ],
                    },
                  ],
                },

                0,
              ],
            },
          },

          refundNetImpact: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$referenceType",
                    "refund",
                  ],
                },

                {
                  $cond: [
                    {
                      $eq: [
                        "$direction",
                        "credit",
                      ],
                    },

                    "$amount",

                    {
                      $multiply: [
                        "$amount",
                        -1,
                      ],
                    },
                  ],
                },

                0,
              ],
            },
          },

          payoutNetImpact: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$referenceType",
                    "payout",
                  ],
                },

                {
                  $cond: [
                    {
                      $eq: [
                        "$direction",
                        "credit",
                      ],
                    },

                    "$amount",

                    {
                      $multiply: [
                        "$amount",
                        -1,
                      ],
                    },
                  ],
                },

                0,
              ],
            },
          },

          feeNetImpact: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$referenceType",
                    "fee",
                  ],
                },

                {
                  $cond: [
                    {
                      $eq: [
                        "$direction",
                        "credit",
                      ],
                    },

                    "$amount",

                    {
                      $multiply: [
                        "$amount",
                        -1,
                      ],
                    },
                  ],
                },

                0,
              ],
            },
          },

          adjustmentNetImpact: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$referenceType",
                    "adjustment",
                  ],
                },

                {
                  $cond: [
                    {
                      $eq: [
                        "$direction",
                        "credit",
                      ],
                    },

                    "$amount",

                    {
                      $multiply: [
                        "$amount",
                        -1,
                      ],
                    },
                  ],
                },

                0,
              ],
            },
          },

          paymentCredits: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$referenceType",
                        "payment",
                      ],
                    },

                    {
                      $eq: [
                        "$direction",
                        "credit",
                      ],
                    },
                  ],
                },

                "$amount",

                0,
              ],
            },
          },

          refundDebits: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$referenceType",
                        "refund",
                      ],
                    },

                    {
                      $eq: [
                        "$direction",
                        "debit",
                      ],
                    },
                  ],
                },

                "$amount",

                0,
              ],
            },
          },

          payoutDebits: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$referenceType",
                        "payout",
                      ],
                    },

                    {
                      $eq: [
                        "$direction",
                        "debit",
                      ],
                    },
                  ],
                },

                "$amount",

                0,
              ],
            },
          },

          feeDebits: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $eq: [
                        "$referenceType",
                        "fee",
                      ],
                    },

                    {
                      $eq: [
                        "$direction",
                        "debit",
                      ],
                    },
                  ],
                },

                "$amount",

                0,
              ],
            },
          },
        },
      },
    ]);

  const summary =
    result[0];

  const openPayoutResult =
    await Payout.aggregate<{
      total:
        unknown;

      count:
        number;
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
          _id:
            null,

          total: {
            $sum:
              "$amount",
          },

          count: {
            $sum:
              1,
          },
        },
      },
    ]);

  const ledgerBalance =
    roundMoney(
      decimalToNumber(
        summary?.ledgerBalance
      )
    );

  const reservedPayoutAmount =
    roundMoney(
      decimalToNumber(
        openPayoutResult[0]
          ?.total
      )
    );

  const availableBalance =
    roundMoney(
      Math.max(
        ledgerBalance -
          reservedPayoutAmount,
        0
      )
    );

  return {
    currency,

    transactionCount:
      Number(
        summary?.transactionCount ??
          0
      ),

    postedCount:
      Number(
        summary?.postedCount ??
          0
      ),

    reversedCount:
      Number(
        summary?.reversedCount ??
          0
      ),

    reversalCount:
      Number(
        summary?.reversalCount ??
          0
      ),

    totalCredits:
      roundMoney(
        decimalToNumber(
          summary?.totalCredits
        )
      ),

    totalDebits:
      roundMoney(
        decimalToNumber(
          summary?.totalDebits
        )
      ),

    ledgerBalance,

    reservedPayoutAmount,

    availableBalance,

    pendingPayoutCount:
      Number(
        openPayoutResult[0]
          ?.count ??
          0
      ),

    paymentCredits:
      roundMoney(
        decimalToNumber(
          summary?.paymentCredits
        )
      ),

    refundDebits:
      roundMoney(
        decimalToNumber(
          summary?.refundDebits
        )
      ),

    payoutDebits:
      roundMoney(
        decimalToNumber(
          summary?.payoutDebits
        )
      ),

    feeDebits:
      roundMoney(
        decimalToNumber(
          summary?.feeDebits
        )
      ),

    /*
     * Net impacts automatically account for
     * reversal postings.
     */
    paymentNetImpact:
      roundMoney(
        decimalToNumber(
          summary?.paymentNetImpact
        )
      ),

    refundNetImpact:
      roundMoney(
        decimalToNumber(
          summary?.refundNetImpact
        )
      ),

    payoutNetImpact:
      roundMoney(
        decimalToNumber(
          summary?.payoutNetImpact
        )
      ),

    feeNetImpact:
      roundMoney(
        decimalToNumber(
          summary?.feeNetImpact
        )
      ),

    adjustmentNetImpact:
      roundMoney(
        decimalToNumber(
          summary?.adjustmentNetImpact
        )
      ),
  };
}

/* =========================================================
   EMPTY RESULT
========================================================= */

function createEmptyResult({
  merchant,
  currency,
  page,
  limit,
}: {
  merchant: {
    _id:
      mongoose.Types.ObjectId;

    businessName?:
      string;

    businessDisplayName?:
      string;

    defaultCurrency:
      string;

    status?:
      string;

    verificationStatus?:
      string;
  };

  currency:
    string;

  page:
    number;

  limit:
    number;
}) {
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

      status:
        merchant.status ??
        null,

      verificationStatus:
        merchant.verificationStatus ??
        null,
    },

    summary: {
      currency,

      transactionCount:
        0,

      postedCount:
        0,

      reversedCount:
        0,

      reversalCount:
        0,

      totalCredits:
        0,

      totalDebits:
        0,

      ledgerBalance:
        0,

      reservedPayoutAmount:
        0,

      availableBalance:
        0,

      pendingPayoutCount:
        0,

      paymentCredits:
        0,

      refundDebits:
        0,

      payoutDebits:
        0,

      feeDebits:
        0,

      paymentNetImpact:
        0,

      refundNetImpact:
        0,

      payoutNetImpact:
        0,

      feeNetImpact:
        0,

      adjustmentNetImpact:
        0,
    },

    transactions:
      [] as MerchantTransactionRow[],

    pagination: {
      page,

      limit,

      total:
        0,

      totalPages:
        1,

      hasNextPage:
        false,

      hasPreviousPage:
        false,
    },
  };
}

/* =========================================================
   LIST MERCHANT TRANSACTIONS
========================================================= */

export async function listMerchantTransactions(
  input:
    MerchantTransactionListInput
) {
  const merchant =
    await getMerchantByOwner(
      input.ownerId
    );

  const page =
    normalizePositiveInteger(
      input.page,
      1,
      1_000_000
    );

  const limit =
    normalizePositiveInteger(
      input.limit,
      DEFAULT_LIMIT,
      MAX_LIMIT
    );

  const currency =
    normalizeCurrency(
      input.currency,
      merchant.defaultCurrency
    );

  const search =
    normalizeText(
      input.search,
      150
    );

  /* =======================================================
     TYPE
  ======================================================== */

  const rawType =
    normalizeText(
      input.type,
      30
    )?.toUpperCase();

  let type:
    MerchantTransactionType |
    undefined;

  if (
    rawType
  ) {
    if (
      !MERCHANT_TRANSACTION_TYPES.includes(
        rawType as
          MerchantTransactionType
      )
    ) {
      throw new MerchantTransactionError(
        "Invalid merchant transaction type.",
        400,
        "INVALID_REQUEST"
      );
    }

    type =
      rawType as
        MerchantTransactionType;
  }

  /* =======================================================
     DIRECTION
  ======================================================== */

  const rawDirection =
    normalizeText(
      input.direction,
      20
    )?.toUpperCase();

  let direction:
    MerchantTransactionDirection |
    undefined;

  if (
    rawDirection
  ) {
    if (
      !MERCHANT_TRANSACTION_DIRECTIONS.includes(
        rawDirection as
          MerchantTransactionDirection
      )
    ) {
      throw new MerchantTransactionError(
        "Invalid transaction direction.",
        400,
        "INVALID_REQUEST"
      );
    }

    direction =
      rawDirection as
        MerchantTransactionDirection;
  }

  /* =======================================================
     STATUS
  ======================================================== */

  const rawStatus =
    normalizeText(
      input.status,
      20
    )?.toUpperCase();

  let status:
    MerchantTransactionStatus |
    undefined;

  if (
    rawStatus
  ) {
    if (
      !MERCHANT_TRANSACTION_STATUSES.includes(
        rawStatus as
          MerchantTransactionStatus
      )
    ) {
      throw new MerchantTransactionError(
        "Invalid transaction status.",
        400,
        "INVALID_REQUEST"
      );
    }

    status =
      rawStatus as
        MerchantTransactionStatus;
  }

  /* =======================================================
     DATES
  ======================================================== */

  const from =
    parseDate(
      input.from
    );

  const to =
    parseDate(
      input.to,
      true
    );

  if (
    from &&
    to &&
    from >
      to
  ) {
    throw new MerchantTransactionError(
      "From date cannot be after to date.",
      400,
      "INVALID_REQUEST"
    );
  }

  /* =======================================================
     ACCOUNTS
  ======================================================== */

  const accounts =
    await getMerchantLedgerAccounts(
      merchant._id,
      currency
    );

  if (
    accounts.length ===
    0
  ) {
    return createEmptyResult({
      merchant,

      currency,

      page,

      limit,
    });
  }

  const accountIds =
    accounts.map(
      (
        account
      ) =>
        account._id
    );

  /* =======================================================
     FILTER
  ======================================================== */

  const filter =
    await buildLedgerFilter({
      merchantId:
        merchant._id,

      accountIds,

      currency,

      search,

      status,

      type,

      direction,

      from,

      to,
    });

  /* =======================================================
     COUNT
  ======================================================== */

  const total =
    await LedgerEntry.countDocuments(
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
     PAGE DATA
  ======================================================== */

  const entries =
    await LedgerEntry.find(
      filter
    )
      .select(
        [
          "entryId",
          "entryGroupId",
          "accountId",
          "direction",
          "amount",
          "currency",
          "referenceType",
          "referenceId",
          "description",
          "metadata",
          "status",
          "effectiveAt",
          "createdAt",
        ].join(
          " "
        )
      )
      .sort({
        effectiveAt:
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
     DOMAIN ENRICHMENT
  ======================================================== */

  const related =
    await loadRelatedData(
      merchant._id,

      entries.map(
        (
          entry
        ) => ({
          referenceType:
            entry.referenceType,

          referenceId:
            entry.referenceId,
        })
      )
    );

  const transactions =
    entries.map(
      (
        entry
      ) =>
        mapLedgerEntryToTransaction(
          entry,
          related
        )
    );

  /* =======================================================
     SUMMARY

     Summary intentionally describes the complete
     merchant ledger position for the selected currency.

     Search/type/date filters affect the table but do not
     corrupt the actual merchant balance.
  ======================================================== */

  const summary =
    await getMerchantLedgerSummary({
      merchantId:
        merchant._id,

      accountIds,

      currency,
    });

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

      status:
        merchant.status ??
        null,

      verificationStatus:
        merchant.verificationStatus ??
        null,
    },

    summary,

    transactions,

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
      search:
        search ??
        null,

      type:
        type ??
        null,

      direction:
        direction ??
        null,

      status:
        status ??
        null,

      currency,

      from:
        normalizeText(
          input.from,
          40
        ) ??
        null,

      to:
        normalizeText(
          input.to,
          40
        ) ??
        null,
    },
  };
}

/* =========================================================
   GET SINGLE MERCHANT TRANSACTION
========================================================= */

export async function getMerchantTransaction(
  ownerId:
    string,

  transactionId:
    string
) {
  const merchant =
    await getMerchantByOwner(
      ownerId
    );

  const normalizedId =
    normalizeText(
      transactionId,
      150
    );

  if (
    !normalizedId
  ) {
    throw new MerchantTransactionError(
      "Transaction ID is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  const accounts =
    await getMerchantLedgerAccounts(
      merchant._id
    );

  if (
    accounts.length ===
    0
  ) {
    throw new MerchantTransactionError(
      "Merchant transaction not found.",
      404,
      "TRANSACTION_NOT_FOUND"
    );
  }

  const accountIds =
    accounts.map(
      (
        account
      ) =>
        account._id
    );

  /*
   * New transaction ID:
   *
   * led_xxx
   */
  let entry =
    await LedgerEntry.findOne({
      accountId: {
        $in:
          accountIds,
      },

      entryId:
        normalizedId,

      referenceType: {
        $in:
          MERCHANT_REFERENCE_TYPES,
      },
    }).lean();

  /*
   * Backward compatibility:
   *
   * Existing frontend may still navigate with a
   * payment ID such as pay_xxx.
   *
   * Allow public source IDs to resolve to the
   * merchant's corresponding ledger entry.
   */
  if (
    !entry
  ) {
    entry =
      await LedgerEntry.findOne({
        accountId: {
          $in:
            accountIds,
        },

        referenceId:
          normalizedId,

        referenceType: {
          $in:
            MERCHANT_REFERENCE_TYPES,
        },
      })
        .sort({
          effectiveAt:
            -1,
        })
        .lean();
  }

  if (
    !entry
  ) {
    throw new MerchantTransactionError(
      "Merchant transaction not found.",
      404,
      "TRANSACTION_NOT_FOUND"
    );
  }

  const related =
    await loadRelatedData(
      merchant._id,
      [
        {
          referenceType:
            entry.referenceType,

          referenceId:
            entry.referenceId,
        },
      ]
    );

  const transaction =
    mapLedgerEntryToTransaction(
      entry,
      related
    );

  /* =======================================================
     LEDGER GROUP

     Only entries belonging to this merchant are exposed.
     Customer/platform counterparty lines are intentionally
     not returned to the merchant dashboard.
  ======================================================== */

  const groupEntries =
    await LedgerEntry.find({
      entryGroupId:
        entry.entryGroupId,

      accountId: {
        $in:
          accountIds,
      },
    })
      .select(
        [
          "entryId",
          "entryGroupId",
          "direction",
          "amount",
          "currency",
          "referenceType",
          "referenceId",
          "description",
          "metadata",
          "status",
          "effectiveAt",
          "createdAt",
        ].join(
          " "
        )
      )
      .sort({
        createdAt:
          1,
      })
      .lean();

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

      status:
        merchant.status ??
        null,

      verificationStatus:
        merchant.verificationStatus ??
        null,
    },

    transaction,

    ledgerGroup: {
      entryGroupId:
        entry.entryGroupId,

      entries:
        groupEntries.map(
          (
            groupEntry
          ) => ({
            transactionId:
              groupEntry.entryId,

            direction:
              groupEntry.direction ===
              "credit"
                ? "CREDIT"
                : "DEBIT",

            amount:
              roundMoney(
                decimalToNumber(
                  groupEntry.amount
                )
              ),

            balanceImpact:
              getBalanceImpact(
                groupEntry.direction,
                decimalToNumber(
                  groupEntry.amount
                )
              ),

            currency:
              groupEntry.currency,

            referenceType:
              groupEntry.referenceType,

            referenceId:
              groupEntry.referenceId,

            description:
              groupEntry.description ??
              null,

            status:
              groupEntry.status ===
              "reversed"
                ? "REVERSED"
                : "POSTED",

            effectiveAt:
              groupEntry.effectiveAt,

            createdAt:
              groupEntry.createdAt,
          })
        ),
    },
  };
}