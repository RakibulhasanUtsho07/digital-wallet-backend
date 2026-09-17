import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

/*
 * Every financial posting is either a debit or a credit.
 */
export type LedgerEntryDirection =
  | "debit"
  | "credit";

/*
 * Source of the financial event.
 */
export type LedgerReferenceType =
  | "payment"
  | "payment_attempt"
  | "order"
  | "refund"
  | "payout"
  | "transfer"
  | "settlement"
  | "invoice"
  | "subscription"
  | "dispute"
  | "wallet"
  | "adjustment"
  | "provider"
  | "fee";

/*
 * Ledger entry lifecycle.
 *
 * Posted entries are immutable financial records.
 */
export type LedgerEntryStatus =
  | "posted"
  | "reversed";

/* =========================================================
   LEDGER ENTRY
========================================================= */

export interface ILedgerEntry
  extends Document {
  /*
   * Unique identifier for a single ledger entry.
   */
  entryId: string;

  /*
   * Groups all debit/credit lines belonging to
   * one financial operation.
   *
   * Example:
   *
   * LEGRP_xxxxx
   */
  entryGroupId: string;

  /*
   * Ledger account receiving this entry.
   */
  accountId: mongoose.Types.ObjectId;

  /*
   * Debit or credit.
   */
  direction: LedgerEntryDirection;

  /*
   * Financial amount.
   *
   * Decimal128 is used instead of JavaScript number
   * to avoid floating-point money calculations.
   */
  amount: mongoose.Types.Decimal128;

  /*
   * Currency must match the target LedgerAccount.
   */
  currency: string;

  /*
   * What generated this entry.
   */
  referenceType: LedgerReferenceType;

  /*
   * ID of source domain record.
   */
  referenceId: string;

  /*
   * Human-readable explanation.
   */
  description?: string;

  /*
   * Optional idempotency key associated with
   * the financial operation.
   */
  idempotencyKey?: string;

  /*
   * Optional metadata for traceability.
   */
  metadata?: Record<
    string,
    unknown
  >;

  /*
   * Posted/reversed.
   */
  status: LedgerEntryStatus;

  /*
   * Effective financial timestamp.
   */
  effectiveAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const ledgerEntrySchema =
  new Schema<ILedgerEntry>(
    {
      /* =====================================================
         ENTRY ID
      ====================================================== */

      entryId: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        minlength: 10,
        maxlength: 120,
      },

      /* =====================================================
         ENTRY GROUP
      ====================================================== */

      entryGroupId: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        index: true,
        minlength: 10,
        maxlength: 120,
      },

      /* =====================================================
         ACCOUNT
      ====================================================== */

      accountId: {
        type: Schema.Types.ObjectId,
        ref: "LedgerAccount",
        required: true,
        index: true,
      },

      /* =====================================================
         DIRECTION
      ====================================================== */

      direction: {
        type: String,

        enum: [
          "debit",
          "credit",
        ],

        required: true,
      },

      /* =====================================================
         AMOUNT
      ====================================================== */

      amount: {
        type: Schema.Types.Decimal128,
        required: true,

        /*
         * Money must always be strictly positive.
         *
         * Direction determines whether the amount is
         * represented as debit or credit.
         */
        validate: {
          validator: (
            value: mongoose.Types.Decimal128
          ): boolean => {
            try {
              return (
                Number(
                  value.toString()
                ) > 0
              );
            } catch {
              return false;
            }
          },

          message:
            "Ledger amount must be greater than zero.",
        },
      },

      /* =====================================================
         CURRENCY
      ====================================================== */

      currency: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        index: true,
      },

      /* =====================================================
         REFERENCE
      ====================================================== */

      referenceType: {
        type: String,

        enum: [
          "payment",
          "payment_attempt",
          "order",
          "refund",
          "payout",
          "transfer",
          "settlement",
          "invoice",
          "subscription",
          "dispute",
          "wallet",
          "adjustment",
          "provider",
          "fee",
        ],

        required: true,
        index: true,
      },

      referenceId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150,
        index: true,
      },

      /* =====================================================
         DESCRIPTION
      ====================================================== */

      description: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      /* =====================================================
         IDEMPOTENCY
      ====================================================== */

      idempotencyKey: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
        index: true,
      },

      /* =====================================================
         METADATA
      ====================================================== */

      metadata: {
        type: Schema.Types.Mixed,
        default: undefined,
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "posted",
          "reversed",
        ],

        default: "posted",
        required: true,
        index: true,
      },

      /* =====================================================
         EFFECTIVE TIME
      ====================================================== */

      effectiveAt: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
      },
    },

    {
      timestamps: true,
      versionKey: false,
      strict: true,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

/*
 * Single entry must be unique.
 */
ledgerEntrySchema.index(
  {
    entryId: 1,
  },
  {
    unique: true,
    name: "unique_ledger_entry_id",
  }
);

/*
 * Financial operation grouping.
 */
ledgerEntrySchema.index(
  {
    entryGroupId: 1,
    direction: 1,
    createdAt: 1,
  },
  {
    name: "ledger_entry_group_direction",
  }
);

/*
 * Account history.
 */
ledgerEntrySchema.index(
  {
    accountId: 1,
    effectiveAt: -1,
  },
  {
    name: "ledger_account_history",
  }
);

/*
 * Source lookup.
 */
ledgerEntrySchema.index(
  {
    referenceType: 1,
    referenceId: 1,
    effectiveAt: -1,
  },
  {
    name: "ledger_reference_lookup",
  }
);

/*
 * Idempotency lookup.
 */
ledgerEntrySchema.index(
  {
    idempotencyKey: 1,
    referenceType: 1,
    referenceId: 1,
  },
  {
    sparse: true,
    name: "ledger_idempotency_lookup",
  }
);

/* =========================================================
   MODEL
========================================================= */

const LedgerEntryModel:
  Model<ILedgerEntry> =
  (mongoose.models.LedgerEntry as Model<ILedgerEntry>) ||
  mongoose.model<ILedgerEntry>(
    "LedgerEntry",
    ledgerEntrySchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const LedgerEntry =
  LedgerEntryModel;

export default LedgerEntryModel;