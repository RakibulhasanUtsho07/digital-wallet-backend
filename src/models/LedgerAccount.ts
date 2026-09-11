import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

/*
 * Who owns / represents the ledger account.
 */
export type LedgerOwnerType =
  | "user"
  | "merchant"
  | "platform"
  | "provider"
  | "system";

/*
 * Financial account classification.
 *
 * Asset:
 *   Money/resources controlled by the platform.
 *
 * Liability:
 *   Money owed to a customer/merchant.
 *
 * Revenue:
 *   Platform earned fees/revenue.
 *
 * Expense:
 *   Platform costs.
 *
 * Equity:
 *   Platform capital/equity.
 */
export type LedgerAccountType =
  | "asset"
  | "liability"
  | "revenue"
  | "expense"
  | "equity";

/*
 * Account lifecycle.
 */
export type LedgerAccountStatus =
  | "active"
  | "frozen"
  | "closed";

/* =========================================================
   LEDGER ACCOUNT
========================================================= */

export interface ILedgerAccount
  extends Document {
  /*
   * Stable unique account code.
   *
   * Examples:
   *
   * user_wallet_65f...
   * merchant_payable_65f...
   * platform_cash_bdt
   * paypal_clearing_bdt
   */
  accountCode: string;

  /*
   * Human-readable account name.
   */
  name: string;

  /*
   * Financial classification.
   */
  accountType: LedgerAccountType;

  /*
   * Entity represented by this account.
   *
   * For platform/system accounts ownerId can be undefined.
   */
  ownerType: LedgerOwnerType;

  ownerId?: mongoose.Types.ObjectId;

  /*
   * ISO-style currency code.
   *
   * Example:
   * BDT
   * USD
   */
  currency: string;

  /*
   * Ledger accounts are not directly mutated for
   * money movement.
   *
   * Their financial position is represented by
   * LedgerEntry records.
   */
  status: LedgerAccountStatus;

  /*
   * Optional description.
   */
  description?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const ledgerAccountSchema =
  new Schema<ILedgerAccount>(
    {
      /* =====================================================
         ACCOUNT CODE
      ====================================================== */

      accountCode: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 150,
      },

      /* =====================================================
         NAME
      ====================================================== */

      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 150,
      },

      /* =====================================================
         ACCOUNT TYPE
      ====================================================== */

      accountType: {
        type: String,

        enum: [
          "asset",
          "liability",
          "revenue",
          "expense",
          "equity",
        ],

        required: true,
        index: true,
      },

      /* =====================================================
         OWNER TYPE
      ====================================================== */

      ownerType: {
        type: String,

        enum: [
          "user",
          "merchant",
          "platform",
          "provider",
          "system",
        ],

        required: true,
        index: true,
      },

      /* =====================================================
         OWNER ID
      ====================================================== */

      ownerId: {
        type: Schema.Types.ObjectId,
        default: undefined,
        index: true,
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
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "active",
          "frozen",
          "closed",
        ],

        required: true,
        default: "active",
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
 * Account codes must be globally unique.
 */
ledgerAccountSchema.index(
  {
    accountCode: 1,
  },
  {
    unique: true,
    name: "unique_ledger_account_code",
  }
);

/*
 * Useful for loading an owner's accounts.
 */
ledgerAccountSchema.index(
  {
    ownerType: 1,
    ownerId: 1,
    currency: 1,
    status: 1,
  },
  {
    name: "ledger_account_owner_currency_status",
  }
);

/*
 * Useful for platform/provider accounts.
 */
ledgerAccountSchema.index(
  {
    accountType: 1,
    ownerType: 1,
    currency: 1,
    status: 1,
  },
  {
    name: "ledger_account_type_owner_currency_status",
  }
);

/* =========================================================
   SAFE OBJECT OUTPUT
========================================================= */

ledgerAccountSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

ledgerAccountSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

const LedgerAccountModel:
  Model<ILedgerAccount> =
  (mongoose.models.LedgerAccount as Model<ILedgerAccount>) ||
  mongoose.model<ILedgerAccount>(
    "LedgerAccount",
    ledgerAccountSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const LedgerAccount =
  LedgerAccountModel;

export default LedgerAccountModel;